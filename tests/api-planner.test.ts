import assert from "node:assert/strict";
import test from "node:test";

import { eq } from "drizzle-orm";

import {
  createApiApp,
  createAppSessionIssuer,
  createAppSessionVerifier,
  createAuthUserRepository,
  createHouseholdProfileRepository,
  createPlannerRepository,
  type ApiConfig,
  type AuthDatabase,
  type AuthenticatedUser,
  type ClaudeService
} from "../apps/api/src/index.ts";
import { databaseTables } from "../apps/api/src/db/schema.ts";
import { createMigratedTestDatabase } from "../apps/api/src/db/testing.ts";

const sessionSecret = "abcdefghijklmnopqrstuvwxyz123456";

function createTestApiConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    appEnv: "test",
    port: 3106,
    databaseUrl: "postgres://freshful:freshful@localhost:5432/freshful_test",
    session: {
      secret: sessionSecret,
      ttlSeconds: 3600,
      issuer: "@freshful/api"
    },
    google: {
      webClientId: "test-web-client.apps.googleusercontent.com"
    },
    anthropic: {
      apiKey: "test-anthropic-key",
      baseUrl: "https://api.anthropic.com",
      apiVersion: "2023-06-01",
      requestTimeoutMs: 20000,
      models: {
        haiku: "claude-3-5-haiku-latest",
        sonnet: "claude-3-7-sonnet-latest"
      },
      usage: {
        maxPromptChars: 16000,
        maxOutputTokens: 1200,
        maxTranscriptMessages: 24
      },
      routing: {
        sonnetTranscriptMessageThreshold: 10,
        sonnetPromptCharThreshold: 5000
      }
    },
    freshful: {
      baseUrl: "https://www.freshful.ro",
      searchPath: "/search",
      requestTimeoutMs: 10000
    },
    ...overrides
  };
}

function createFixedCurrentDateSessionVerifier(currentDate: Date) {
  return createAppSessionVerifier({
    issuer: "@freshful/api",
    secret: sessionSecret,
    currentDate
  });
}

function createUser(id: string, now: Date): AuthenticatedUser {
  return {
    id,
    email: `${id}@example.com`,
    emailVerified: true,
    displayName: id,
    photoUrl: null,
    lastLoginAt: now.toISOString()
  };
}

async function createUserSession(database: AuthDatabase, user: AuthenticatedUser, now: Date) {
  await database.insert(databaseTables.users).values({
    id: user.id,
    googleSubject: `google-${user.id}`,
    email: user.email,
    emailVerified: user.emailVerified,
    displayName: user.displayName,
    photoUrl: user.photoUrl,
    lastLoginAt: user.lastLoginAt
  });

  return createAppSessionIssuer({
    issuer: "@freshful/api",
    secret: sessionSecret,
    ttlSeconds: 3600,
    now: () => now
  }).issue(user);
}

async function seedProfile(database: Awaited<ReturnType<typeof createMigratedTestDatabase>>["db"], userId: string, now: string) {
  await database.insert(databaseTables.onboardingTranscripts).values({
    id: `${userId}-transcript`,
    userId,
    messages: [
      {
        id: `${userId}-message-1`,
        role: "assistant",
        content: "Saved profile transcript.",
        createdAt: now
      }
    ],
    containsSensitiveProfileSignals: false,
    createdAt: now,
    updatedAt: now
  });

  await database.insert(databaseTables.householdProfiles).values({
    id: `${userId}-profile`,
    userId,
    householdType: "family",
    numChildren: 1,
    dietaryRestrictions: ["vegetarian"],
    allergies: {
      normalized: ["peanuts"],
      freeText: []
    },
    medicalFlags: {
      diabetes: false,
      hypertension: false
    },
    goals: ["maintenance"],
    cuisinePreferences: ["Romanian", "Mediterranean"],
    favoriteIngredients: ["tomatoes", "lentils"],
    dislikedIngredients: ["celery"],
    budgetBand: "medium",
    maxPrepTimeMinutes: 30,
    cookingSkill: "intermediate",
    rawChatHistoryId: `${userId}-transcript`,
    containsSensitiveHealthData: true,
    createdAt: now,
    updatedAt: now
  });
}

function createMealPlanAiDouble(result: Awaited<ReturnType<ClaudeService["createMealPlan"]>>): ClaudeService {
  const refinementResult = result;

  return {
    async createOnboardingReply() {
      return {
        assistantMessage: "unused",
        usage: {
          model: "claude-3-5-haiku-latest",
          modelTier: "haiku",
          routeReason: "test",
          inputTokens: 1,
          outputTokens: 1
        }
      };
    },
    async extractProfile() {
      return {
        profile: null,
        rawText: "unused",
        missingFields: [],
        parseFailureReason: "missing_json",
        usage: {
          model: "claude-3-7-sonnet-latest",
          modelTier: "sonnet",
          routeReason: "test",
          inputTokens: 1,
          outputTokens: 1
        }
      };
    },
    async createMealPlan() {
      return result;
    },
    async refineMealPlan() {
      return refinementResult;
    }
  };
}

function createPlannerAiDouble(options: {
  createMealPlanResult: Awaited<ReturnType<ClaudeService["createMealPlan"]>>;
  refineMealPlanResult?: Awaited<ReturnType<ClaudeService["refineMealPlan"]>>;
}): ClaudeService {
  return {
    async createOnboardingReply() {
      return {
        assistantMessage: "unused",
        usage: {
          model: "claude-3-5-haiku-latest",
          modelTier: "haiku",
          routeReason: "test",
          inputTokens: 1,
          outputTokens: 1
        }
      };
    },
    async extractProfile() {
      return {
        profile: null,
        rawText: "unused",
        missingFields: [],
        parseFailureReason: "missing_json",
        usage: {
          model: "claude-3-7-sonnet-latest",
          modelTier: "sonnet",
          routeReason: "test",
          inputTokens: 1,
          outputTokens: 1
        }
      };
    },
    async createMealPlan() {
      return options.createMealPlanResult;
    },
    async refineMealPlan() {
      return options.refineMealPlanResult ?? options.createMealPlanResult;
    }
  };
}

function createGeneratedPlan(durationDays: number) {
  return {
    title: `${durationDays} Day Family Vegetarian Plan`,
    durationDays,
    recipes: [
      {
        id: "recipe-breakfast",
        title: "Yogurt Oat Bowl",
        ingredients: [
          {
            name: "oats",
            quantity: 80,
            unit: "g"
          },
          {
            name: "yogurt",
            quantity: 200,
            unit: "g"
          }
        ],
        instructions: ["Combine oats and yogurt.", "Serve chilled."],
        tags: ["vegetarian", "quick"],
        estimatedMacros: {
          calories: 430,
          proteinGrams: 19,
          carbsGrams: 50,
          fatGrams: 15
        }
      },
      {
        id: "recipe-dinner",
        title: "Lentil Tomato Skillet",
        ingredients: [
          {
            name: "lentils",
            quantity: 250,
            unit: "g"
          },
          {
            name: "tomatoes",
            quantity: 400,
            unit: "g"
          }
        ],
        instructions: ["Cook lentils.", "Simmer with tomatoes.", "Serve warm."],
        tags: ["vegetarian", "family"],
        estimatedMacros: {
          calories: 620,
          proteinGrams: 28,
          carbsGrams: 74,
          fatGrams: 18
        }
      }
    ],
    days: Array.from({ length: durationDays }, (_, index) => ({
      dayNumber: index + 1,
      meals: [
        {
          slot: "breakfast" as const,
          recipeId: "recipe-breakfast"
        },
        {
          slot: "dinner" as const,
          recipeId: "recipe-dinner"
        }
      ]
    })),
    metadata: {
      tags: ["family", "vegetarian"],
      estimatedMacros: {
        calories: durationDays * 1050,
        proteinGrams: durationDays * 47,
        carbsGrams: durationDays * 124,
        fatGrams: durationDays * 33
      }
    }
  };
}

function createRefinedPlan(durationDays: number) {
  const plan = createGeneratedPlan(durationDays);

  return {
    ...plan,
    title: `${durationDays} Day Family Vegetarian Plan - Refined`,
    recipes: [
      {
        ...plan.recipes[0],
        title: "Berry Protein Oat Bowl",
        estimatedMacros: {
          calories: 390,
          proteinGrams: 24,
          carbsGrams: 41,
          fatGrams: 11
        }
      },
      {
        ...plan.recipes[1],
        id: "recipe-dinner-refined",
        title: "Tofu Lentil Tomato Skillet",
        ingredients: [
          {
            name: "tofu",
            quantity: 220,
            unit: "g"
          },
          {
            name: "lentils",
            quantity: 180,
            unit: "g"
          },
          {
            name: "tomatoes",
            quantity: 350,
            unit: "g"
          }
        ],
        estimatedMacros: {
          calories: 540,
          proteinGrams: 35,
          carbsGrams: 46,
          fatGrams: 18
        }
      }
    ],
    days: Array.from({ length: durationDays }, (_, index) => ({
      dayNumber: index + 1,
      meals: [
        {
          slot: "breakfast" as const,
          recipeId: "recipe-breakfast"
        },
        {
          slot: "dinner" as const,
          recipeId: "recipe-dinner-refined"
        }
      ]
    })),
    metadata: {
      tags: ["family", "vegetarian", "refined"],
      estimatedMacros: {
        calories: durationDays * 930,
        proteinGrams: durationDays * 59,
        carbsGrams: durationDays * 87,
        fatGrams: durationDays * 29
      }
    }
  };
}

test("POST /plans creates and persists a meal plan template for the authenticated user", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-22T19:00:00.000Z");
  const user = createUser("planner-user-template", fixedNow);
  const session = await createUserSession(database.db as AuthDatabase, user, fixedNow);
  await seedProfile(database.db, user.id, fixedNow.toISOString());

  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    services: {
      ai: {
        name: "ai",
        status: "ready",
        implementation: createMealPlanAiDouble({
          plan: createGeneratedPlan(3),
          rawText: "{}",
          parseFailureReason: null,
          usage: {
            model: "claude-3-7-sonnet-latest",
            modelTier: "sonnet",
            routeReason: "test",
            inputTokens: 200,
            outputTokens: 300
          }
        })
      }
    },
    auth: {
      sessionVerifier: createFixedCurrentDateSessionVerifier(fixedNow),
      userRepository: createAuthUserRepository(database.db as AuthDatabase, {
        now: () => fixedNow
      })
    },
    profile: {
      repository: createHouseholdProfileRepository(database.db, {
        now: () => fixedNow
      })
    },
    planner: {
      repository: createPlannerRepository(database.db, {
        now: () => fixedNow,
        createId: (() => {
          let sequence = 0;

          return () => `planner-id-${++sequence}`;
        })()
      })
    }
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/plans",
    headers: {
      authorization: `Bearer ${session.accessToken}`
    },
    payload: {
      durationDays: 3,
      mealSlots: ["breakfast", "dinner"]
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().template.userId, user.id);
  assert.equal(response.json().template.durationDays, 3);
  assert.equal(response.json().instance, null);
  assert.equal(response.json().template.days.length, 3);

  const storedTemplates = await database.db
    .select()
    .from(databaseTables.mealPlanTemplates)
    .where(eq(databaseTables.mealPlanTemplates.userId, user.id));
  const storedInstances = await database.db
    .select()
    .from(databaseTables.mealPlanInstances)
    .where(eq(databaseTables.mealPlanInstances.userId, user.id));

  assert.equal(storedTemplates.length, 1);
  assert.equal(storedTemplates[0]?.title, "3 Day Family Vegetarian Plan");
  assert.equal(storedInstances.length, 0);
});

test("POST /plans optionally creates a dated meal plan instance when startDate is supplied", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-22T19:10:00.000Z");
  const user = createUser("planner-user-instance", fixedNow);
  const session = await createUserSession(database.db as AuthDatabase, user, fixedNow);
  await seedProfile(database.db, user.id, fixedNow.toISOString());

  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    services: {
      ai: {
        name: "ai",
        status: "ready",
        implementation: createMealPlanAiDouble({
          plan: createGeneratedPlan(2),
          rawText: "{}",
          parseFailureReason: null,
          usage: {
            model: "claude-3-7-sonnet-latest",
            modelTier: "sonnet",
            routeReason: "test",
            inputTokens: 200,
            outputTokens: 300
          }
        })
      }
    },
    auth: {
      sessionVerifier: createFixedCurrentDateSessionVerifier(fixedNow),
      userRepository: createAuthUserRepository(database.db as AuthDatabase, {
        now: () => fixedNow
      })
    },
    profile: {
      repository: createHouseholdProfileRepository(database.db, {
        now: () => fixedNow
      })
    },
    planner: {
      repository: createPlannerRepository(database.db, {
        now: () => fixedNow,
        createId: (() => {
          let sequence = 100;

          return () => `planner-id-${++sequence}`;
        })()
      })
    }
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/plans",
    headers: {
      authorization: `Bearer ${session.accessToken}`
    },
    payload: {
      durationDays: 2,
      mealSlots: ["breakfast", "dinner"],
      startDate: "2026-03-24"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().instance.startDate, "2026-03-24");
  assert.equal(response.json().instance.endDate, "2026-03-25");
  assert.equal(response.json().instance.templateId, response.json().template.id);

  const [storedInstance] = await database.db
    .select()
    .from(databaseTables.mealPlanInstances)
    .where(eq(databaseTables.mealPlanInstances.userId, user.id));

  assert.ok(storedInstance);
  assert.equal(storedInstance.startDate, "2026-03-24");
  assert.equal(storedInstance.endDate, "2026-03-25");
});

test("POST /plans rejects impossible startDate values with a request validation error", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-22T19:15:00.000Z");
  const user = createUser("planner-user-invalid-start-date", fixedNow);
  const session = await createUserSession(database.db as AuthDatabase, user, fixedNow);
  await seedProfile(database.db, user.id, fixedNow.toISOString());

  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    services: {
      ai: {
        name: "ai",
        status: "ready",
        implementation: createMealPlanAiDouble({
          plan: createGeneratedPlan(2),
          rawText: "{}",
          parseFailureReason: null,
          usage: {
            model: "claude-3-7-sonnet-latest",
            modelTier: "sonnet",
            routeReason: "test",
            inputTokens: 200,
            outputTokens: 300
          }
        })
      }
    },
    auth: {
      sessionVerifier: createFixedCurrentDateSessionVerifier(fixedNow),
      userRepository: createAuthUserRepository(database.db as AuthDatabase, {
        now: () => fixedNow
      })
    },
    profile: {
      repository: createHouseholdProfileRepository(database.db, {
        now: () => fixedNow
      })
    },
    planner: {
      repository: createPlannerRepository(database.db, {
        now: () => fixedNow
      })
    }
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/plans",
    headers: {
      authorization: `Bearer ${session.accessToken}`
    },
    payload: {
      durationDays: 2,
      mealSlots: ["breakfast", "dinner"],
      startDate: "2026-02-30"
    }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, "request.validation_failed");
  assert.deepEqual(response.json().issues, [
    {
      path: ["body", "startDate"],
      message: "startDate must be a real calendar date in YYYY-MM-DD format."
    }
  ]);

  const storedTemplates = await database.db
    .select()
    .from(databaseTables.mealPlanTemplates)
    .where(eq(databaseTables.mealPlanTemplates.userId, user.id));

  assert.equal(storedTemplates.length, 0);
});

test("POST /plans fails clearly when the authenticated user has no saved profile", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-22T19:20:00.000Z");
  const user = createUser("planner-user-missing-profile", fixedNow);
  const session = await createUserSession(database.db as AuthDatabase, user, fixedNow);

  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    services: {
      ai: {
        name: "ai",
        status: "ready",
        implementation: createMealPlanAiDouble({
          plan: createGeneratedPlan(1),
          rawText: "{}",
          parseFailureReason: null,
          usage: {
            model: "claude-3-7-sonnet-latest",
            modelTier: "sonnet",
            routeReason: "test",
            inputTokens: 200,
            outputTokens: 300
          }
        })
      }
    },
    auth: {
      sessionVerifier: createFixedCurrentDateSessionVerifier(fixedNow),
      userRepository: createAuthUserRepository(database.db as AuthDatabase, {
        now: () => fixedNow
      })
    },
    profile: {
      repository: createHouseholdProfileRepository(database.db, {
        now: () => fixedNow
      })
    },
    planner: {
      repository: createPlannerRepository(database.db, {
        now: () => fixedNow
      })
    }
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/plans",
    headers: {
      authorization: `Bearer ${session.accessToken}`
    },
    payload: {
      durationDays: 1,
      mealSlots: ["dinner"]
    }
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().code, "planner.profile_required");
});

test("POST /plans returns a planner-specific invalid generation error when the AI output is invalid", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-22T19:30:00.000Z");
  const user = createUser("planner-user-invalid-plan", fixedNow);
  const session = await createUserSession(database.db as AuthDatabase, user, fixedNow);
  await seedProfile(database.db, user.id, fixedNow.toISOString());

  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    services: {
      ai: {
        name: "ai",
        status: "ready",
        implementation: createMealPlanAiDouble({
          plan: null,
          rawText: "The model returned prose instead of JSON.",
          parseFailureReason: "missing_json",
          usage: {
            model: "claude-3-7-sonnet-latest",
            modelTier: "sonnet",
            routeReason: "test",
            inputTokens: 200,
            outputTokens: 300
          }
        })
      }
    },
    auth: {
      sessionVerifier: createFixedCurrentDateSessionVerifier(fixedNow),
      userRepository: createAuthUserRepository(database.db as AuthDatabase, {
        now: () => fixedNow
      })
    },
    profile: {
      repository: createHouseholdProfileRepository(database.db, {
        now: () => fixedNow
      })
    },
    planner: {
      repository: createPlannerRepository(database.db, {
        now: () => fixedNow
      })
    }
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/plans",
    headers: {
      authorization: `Bearer ${session.accessToken}`
    },
    payload: {
      durationDays: 2,
      mealSlots: ["breakfast", "dinner"]
    }
  });

  assert.equal(response.statusCode, 502);
  assert.equal(response.json().code, "planner.invalid_generated_plan");
  assert.equal(response.json().details.reason, "missing_json");

  const storedTemplates = await database.db
    .select()
    .from(databaseTables.mealPlanTemplates)
    .where(eq(databaseTables.mealPlanTemplates.userId, user.id));

  assert.equal(storedTemplates.length, 0);
});

test("POST /plans rejects AI-generated plans whose day numbers do not match 1 through durationDays", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-22T19:40:00.000Z");
  const user = createUser("planner-user-nonsequential-days", fixedNow);
  const session = await createUserSession(database.db as AuthDatabase, user, fixedNow);
  await seedProfile(database.db, user.id, fixedNow.toISOString());

  const invalidPlan = createGeneratedPlan(3);
  invalidPlan.days = invalidPlan.days.map((day, index) => ({
    ...day,
    dayNumber: index + 2
  }));

  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    services: {
      ai: {
        name: "ai",
        status: "ready",
        implementation: createMealPlanAiDouble({
          plan: invalidPlan,
          rawText: "{}",
          parseFailureReason: null,
          usage: {
            model: "claude-3-7-sonnet-latest",
            modelTier: "sonnet",
            routeReason: "test",
            inputTokens: 200,
            outputTokens: 300
          }
        })
      }
    },
    auth: {
      sessionVerifier: createFixedCurrentDateSessionVerifier(fixedNow),
      userRepository: createAuthUserRepository(database.db as AuthDatabase, {
        now: () => fixedNow
      })
    },
    profile: {
      repository: createHouseholdProfileRepository(database.db, {
        now: () => fixedNow
      })
    },
    planner: {
      repository: createPlannerRepository(database.db, {
        now: () => fixedNow
      })
    }
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/plans",
    headers: {
      authorization: `Bearer ${session.accessToken}`
    },
    payload: {
      durationDays: 3,
      mealSlots: ["breakfast", "dinner"]
    }
  });

  assert.equal(response.statusCode, 502);
  assert.equal(response.json().code, "planner.invalid_generated_plan");
  assert.equal(response.json().details.reason, "constraint_mismatch");
  assert.equal(response.json().details.validationMessage, "Expected dayNumber values 1..3 in sequence.");

  const storedTemplates = await database.db
    .select()
    .from(databaseTables.mealPlanTemplates)
    .where(eq(databaseTables.mealPlanTemplates.userId, user.id));

  assert.equal(storedTemplates.length, 0);
});

test("GET /plans/:id returns the authenticated user's plan detail and hides other users' plans", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-22T20:00:00.000Z");
  const owner = createUser("planner-get-owner", fixedNow);
  const otherUser = createUser("planner-get-other", fixedNow);
  const ownerSession = await createUserSession(database.db as AuthDatabase, owner, fixedNow);
  const otherSession = await createUserSession(database.db as AuthDatabase, otherUser, fixedNow);
  await seedProfile(database.db, owner.id, fixedNow.toISOString());
  await seedProfile(database.db, otherUser.id, fixedNow.toISOString());

  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    services: {
      ai: {
        name: "ai",
        status: "ready",
        implementation: createPlannerAiDouble({
          createMealPlanResult: {
            plan: createGeneratedPlan(3),
            rawText: "{}",
            parseFailureReason: null,
            usage: {
              model: "claude-3-7-sonnet-latest",
              modelTier: "sonnet",
              routeReason: "test",
              inputTokens: 200,
              outputTokens: 300
            }
          }
        })
      }
    },
    auth: {
      sessionVerifier: createFixedCurrentDateSessionVerifier(fixedNow),
      userRepository: createAuthUserRepository(database.db as AuthDatabase, {
        now: () => fixedNow
      })
    },
    profile: {
      repository: createHouseholdProfileRepository(database.db, {
        now: () => fixedNow
      })
    },
    planner: {
      repository: createPlannerRepository(database.db, {
        now: () => fixedNow,
        createId: (() => {
          let sequence = 200;

          return () => `planner-id-${++sequence}`;
        })()
      })
    }
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const createResponse = await app.inject({
    method: "POST",
    url: "/plans",
    headers: {
      authorization: `Bearer ${ownerSession.accessToken}`
    },
    payload: {
      durationDays: 3,
      mealSlots: ["breakfast", "dinner"],
      startDate: "2026-03-25"
    }
  });

  assert.equal(createResponse.statusCode, 200);

  const planId = createResponse.json().template.id;
  const getResponse = await app.inject({
    method: "GET",
    url: `/plans/${planId}`,
    headers: {
      authorization: `Bearer ${ownerSession.accessToken}`
    }
  });

  assert.equal(getResponse.statusCode, 200);
  assert.equal(getResponse.json().template.id, planId);
  assert.equal(getResponse.json().instance.startDate, "2026-03-25");
  assert.equal(getResponse.json().revisionHistory.length, 1);
  assert.equal(getResponse.json().revisionHistory[0].templateId, planId);
  assert.equal(getResponse.json().revisionHistory[0].parentTemplateId, null);
  assert.equal(getResponse.json().revisionHistory[0].title, "3 Day Family Vegetarian Plan");
  assert.ok(typeof getResponse.json().revisionHistory[0].createdAt === "string");
  assert.ok(getResponse.json().revisionHistory[0].createdAt.length > 0);
  assert.equal(getResponse.json().revisionHistory[0].instanceId, getResponse.json().instance.id);
  assert.equal(getResponse.json().revisionHistory[0].startDate, "2026-03-25");
  assert.equal(getResponse.json().revisionHistory[0].endDate, "2026-03-27");

  const wrongOwnerResponse = await app.inject({
    method: "GET",
    url: `/plans/${planId}`,
    headers: {
      authorization: `Bearer ${otherSession.accessToken}`
    }
  });

  assert.equal(wrongOwnerResponse.statusCode, 404);
  assert.equal(wrongOwnerResponse.json().code, "planner.plan_not_found");
});

test("POST /plans/:id/refine creates a new revision, preserves calendar binding, and keeps lineage retrievable", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-22T20:10:00.000Z");
  const user = createUser("planner-refine-user", fixedNow);
  const session = await createUserSession(database.db as AuthDatabase, user, fixedNow);
  await seedProfile(database.db, user.id, fixedNow.toISOString());

  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    services: {
      ai: {
        name: "ai",
        status: "ready",
        implementation: createPlannerAiDouble({
          createMealPlanResult: {
            plan: createGeneratedPlan(3),
            rawText: "{}",
            parseFailureReason: null,
            usage: {
              model: "claude-3-7-sonnet-latest",
              modelTier: "sonnet",
              routeReason: "test",
              inputTokens: 200,
              outputTokens: 300
            }
          },
          refineMealPlanResult: {
            plan: createRefinedPlan(3),
            rawText: "{}",
            parseFailureReason: null,
            usage: {
              model: "claude-3-7-sonnet-latest",
              modelTier: "sonnet",
              routeReason: "test",
              inputTokens: 220,
              outputTokens: 340
            }
          }
        })
      }
    },
    auth: {
      sessionVerifier: createFixedCurrentDateSessionVerifier(fixedNow),
      userRepository: createAuthUserRepository(database.db as AuthDatabase, {
        now: () => fixedNow
      })
    },
    profile: {
      repository: createHouseholdProfileRepository(database.db, {
        now: () => fixedNow
      })
    },
    planner: {
      repository: createPlannerRepository(database.db, {
        now: () => fixedNow,
        createId: (() => {
          let sequence = 300;

          return () => `planner-id-${++sequence}`;
        })()
      })
    }
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const createResponse = await app.inject({
    method: "POST",
    url: "/plans",
    headers: {
      authorization: `Bearer ${session.accessToken}`
    },
    payload: {
      durationDays: 3,
      mealSlots: ["breakfast", "dinner"],
      startDate: "2026-03-26"
    }
  });

  const sourcePlanId = createResponse.json().template.id;
  const refineResponse = await app.inject({
    method: "POST",
    url: `/plans/${sourcePlanId}/refine`,
    headers: {
      authorization: `Bearer ${session.accessToken}`
    },
    payload: {
      prompt: "Swap dinner to a tofu-based recipe and lower the total carbs."
    }
  });

  assert.equal(refineResponse.statusCode, 200);
  assert.equal(refineResponse.json().template.title, "3 Day Family Vegetarian Plan - Refined");
  assert.notEqual(refineResponse.json().template.id, sourcePlanId);
  assert.equal(refineResponse.json().instance.startDate, "2026-03-26");
  assert.equal(refineResponse.json().instance.endDate, "2026-03-28");
  assert.deepEqual(
    refineResponse.json().revisionHistory.map((revision: { templateId: string; parentTemplateId: string | null }) => ({
      templateId: revision.templateId,
      parentTemplateId: revision.parentTemplateId
    })),
    [
      {
        templateId: sourcePlanId,
        parentTemplateId: null
      },
      {
        templateId: refineResponse.json().template.id,
        parentTemplateId: sourcePlanId
      }
    ]
  );

  const getRefinedResponse = await app.inject({
    method: "GET",
    url: `/plans/${refineResponse.json().template.id}`,
    headers: {
      authorization: `Bearer ${session.accessToken}`
    }
  });

  assert.equal(getRefinedResponse.statusCode, 200);
  assert.equal(getRefinedResponse.json().revisionHistory.length, 2);
  assert.equal(getRefinedResponse.json().revisionHistory[1].parentTemplateId, sourcePlanId);
  assert.equal(getRefinedResponse.json().instance.startDate, "2026-03-26");

  const storedTemplates = await database.db
    .select()
    .from(databaseTables.mealPlanTemplates)
    .where(eq(databaseTables.mealPlanTemplates.userId, user.id));
  const storedInstances = await database.db
    .select()
    .from(databaseTables.mealPlanInstances)
    .where(eq(databaseTables.mealPlanInstances.userId, user.id));

  assert.equal(storedTemplates.length, 2);
  assert.equal(storedInstances.length, 2);
  assert.equal(
    storedTemplates.find((template) => template.id === refineResponse.json().template.id)?.parentTemplateId,
    sourcePlanId
  );
});

test("POST /plans/:id/refine sanitizes carried-forward instance overrides against the refined template", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-22T20:15:00.000Z");
  const user = createUser("planner-refine-overrides", fixedNow);
  const session = await createUserSession(database.db as AuthDatabase, user, fixedNow);
  await seedProfile(database.db, user.id, fixedNow.toISOString());

  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    services: {
      ai: {
        name: "ai",
        status: "ready",
        implementation: createPlannerAiDouble({
          createMealPlanResult: {
            plan: createGeneratedPlan(3),
            rawText: "{}",
            parseFailureReason: null,
            usage: {
              model: "claude-3-7-sonnet-latest",
              modelTier: "sonnet",
              routeReason: "test",
              inputTokens: 200,
              outputTokens: 300
            }
          },
          refineMealPlanResult: {
            plan: createRefinedPlan(3),
            rawText: "{}",
            parseFailureReason: null,
            usage: {
              model: "claude-3-7-sonnet-latest",
              modelTier: "sonnet",
              routeReason: "test",
              inputTokens: 220,
              outputTokens: 340
            }
          }
        })
      }
    },
    auth: {
      sessionVerifier: createFixedCurrentDateSessionVerifier(fixedNow),
      userRepository: createAuthUserRepository(database.db as AuthDatabase, {
        now: () => fixedNow
      })
    },
    profile: {
      repository: createHouseholdProfileRepository(database.db, {
        now: () => fixedNow
      })
    },
    planner: {
      repository: createPlannerRepository(database.db, {
        now: () => fixedNow,
        createId: (() => {
          let sequence = 350;

          return () => `planner-id-${++sequence}`;
        })()
      })
    }
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const createResponse = await app.inject({
    method: "POST",
    url: "/plans",
    headers: {
      authorization: `Bearer ${session.accessToken}`
    },
    payload: {
      durationDays: 3,
      mealSlots: ["breakfast", "dinner"],
      startDate: "2026-03-26"
    }
  });

  assert.equal(createResponse.statusCode, 200);

  const sourcePlanId = createResponse.json().template.id;
  const sourceInstanceId = createResponse.json().instance.id;
  const sourceOverrides = [
    {
      dayNumber: 1,
      slot: "dinner",
      recipeId: "recipe-dinner",
      notes: "Prefer extra spice."
    },
    {
      dayNumber: 1,
      slot: "breakfast",
      notes: "Prep the night before."
    },
    {
      dayNumber: 2,
      slot: "breakfast",
      recipeId: "recipe-breakfast",
      notes: "Double the yogurt."
    },
    {
      dayNumber: 3,
      slot: "dinner",
      recipeId: "recipe-dinner"
    }
  ];

  await database.db
    .update(databaseTables.mealPlanInstances)
    .set({
      overrides: sourceOverrides
    })
    .where(eq(databaseTables.mealPlanInstances.id, sourceInstanceId));

  const refineResponse = await app.inject({
    method: "POST",
    url: `/plans/${sourcePlanId}/refine`,
    headers: {
      authorization: `Bearer ${session.accessToken}`
    },
    payload: {
      prompt: "Swap dinner to a tofu-based recipe and lower the total carbs."
    }
  });

  assert.equal(refineResponse.statusCode, 200);
  assert.deepEqual(refineResponse.json().instance.overrides, [
    {
      dayNumber: 1,
      slot: "dinner",
      notes: "Prefer extra spice."
    },
    {
      dayNumber: 1,
      slot: "breakfast",
      notes: "Prep the night before."
    },
    {
      dayNumber: 2,
      slot: "breakfast",
      recipeId: "recipe-breakfast",
      notes: "Double the yogurt."
    }
  ]);

  const storedRefinedInstance = await database.db.query.mealPlanInstances.findFirst({
    where: eq(databaseTables.mealPlanInstances.templateId, refineResponse.json().template.id)
  });

  assert.deepEqual(storedRefinedInstance?.overrides, [
    {
      dayNumber: 1,
      slot: "dinner",
      notes: "Prefer extra spice."
    },
    {
      dayNumber: 1,
      slot: "breakfast",
      notes: "Prep the night before."
    },
    {
      dayNumber: 2,
      slot: "breakfast",
      recipeId: "recipe-breakfast",
      notes: "Double the yogurt."
    }
  ]);
});

test("POST /plans/:id/refine rejects missing sessions and wrong-owner plan access", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-22T20:20:00.000Z");
  const owner = createUser("planner-refine-owner", fixedNow);
  const otherUser = createUser("planner-refine-other", fixedNow);
  const ownerSession = await createUserSession(database.db as AuthDatabase, owner, fixedNow);
  const otherSession = await createUserSession(database.db as AuthDatabase, otherUser, fixedNow);
  await seedProfile(database.db, owner.id, fixedNow.toISOString());
  await seedProfile(database.db, otherUser.id, fixedNow.toISOString());

  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    services: {
      ai: {
        name: "ai",
        status: "ready",
        implementation: createPlannerAiDouble({
          createMealPlanResult: {
            plan: createGeneratedPlan(2),
            rawText: "{}",
            parseFailureReason: null,
            usage: {
              model: "claude-3-7-sonnet-latest",
              modelTier: "sonnet",
              routeReason: "test",
              inputTokens: 200,
              outputTokens: 300
            }
          },
          refineMealPlanResult: {
            plan: createRefinedPlan(2),
            rawText: "{}",
            parseFailureReason: null,
            usage: {
              model: "claude-3-7-sonnet-latest",
              modelTier: "sonnet",
              routeReason: "test",
              inputTokens: 210,
              outputTokens: 320
            }
          }
        })
      }
    },
    auth: {
      sessionVerifier: createFixedCurrentDateSessionVerifier(fixedNow),
      userRepository: createAuthUserRepository(database.db as AuthDatabase, {
        now: () => fixedNow
      })
    },
    profile: {
      repository: createHouseholdProfileRepository(database.db, {
        now: () => fixedNow
      })
    },
    planner: {
      repository: createPlannerRepository(database.db, {
        now: () => fixedNow,
        createId: (() => {
          let sequence = 400;

          return () => `planner-id-${++sequence}`;
        })()
      })
    }
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const createResponse = await app.inject({
    method: "POST",
    url: "/plans",
    headers: {
      authorization: `Bearer ${ownerSession.accessToken}`
    },
    payload: {
      durationDays: 2,
      mealSlots: ["breakfast", "dinner"]
    }
  });

  const sourcePlanId = createResponse.json().template.id;

  const unauthorizedResponse = await app.inject({
    method: "POST",
    url: `/plans/${sourcePlanId}/refine`,
    payload: {
      prompt: "Swap the dinner recipe."
    }
  });

  assert.equal(unauthorizedResponse.statusCode, 401);
  assert.equal(unauthorizedResponse.json().code, "auth.missing_app_session");

  const wrongOwnerResponse = await app.inject({
    method: "POST",
    url: `/plans/${sourcePlanId}/refine`,
    headers: {
      authorization: `Bearer ${otherSession.accessToken}`
    },
    payload: {
      prompt: "Swap the dinner recipe."
    }
  });

  assert.equal(wrongOwnerResponse.statusCode, 404);
  assert.equal(wrongOwnerResponse.json().code, "planner.plan_not_found");
});

test("POST /plans/:id/refine does not persist a new revision when the refined AI output is invalid", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-22T20:30:00.000Z");
  const user = createUser("planner-refine-invalid", fixedNow);
  const session = await createUserSession(database.db as AuthDatabase, user, fixedNow);
  await seedProfile(database.db, user.id, fixedNow.toISOString());

  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    services: {
      ai: {
        name: "ai",
        status: "ready",
        implementation: createPlannerAiDouble({
          createMealPlanResult: {
            plan: createGeneratedPlan(2),
            rawText: "{}",
            parseFailureReason: null,
            usage: {
              model: "claude-3-7-sonnet-latest",
              modelTier: "sonnet",
              routeReason: "test",
              inputTokens: 200,
              outputTokens: 300
            }
          },
          refineMealPlanResult: {
            plan: null,
            rawText: "I suggest changing dinner, but here is prose instead of JSON.",
            parseFailureReason: "missing_json",
            usage: {
              model: "claude-3-7-sonnet-latest",
              modelTier: "sonnet",
              routeReason: "test",
              inputTokens: 210,
              outputTokens: 320
            }
          }
        })
      }
    },
    auth: {
      sessionVerifier: createFixedCurrentDateSessionVerifier(fixedNow),
      userRepository: createAuthUserRepository(database.db as AuthDatabase, {
        now: () => fixedNow
      })
    },
    profile: {
      repository: createHouseholdProfileRepository(database.db, {
        now: () => fixedNow
      })
    },
    planner: {
      repository: createPlannerRepository(database.db, {
        now: () => fixedNow,
        createId: (() => {
          let sequence = 500;

          return () => `planner-id-${++sequence}`;
        })()
      })
    }
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const createResponse = await app.inject({
    method: "POST",
    url: "/plans",
    headers: {
      authorization: `Bearer ${session.accessToken}`
    },
    payload: {
      durationDays: 2,
      mealSlots: ["breakfast", "dinner"]
    }
  });

  const sourcePlanId = createResponse.json().template.id;
  const refineResponse = await app.inject({
    method: "POST",
    url: `/plans/${sourcePlanId}/refine`,
    headers: {
      authorization: `Bearer ${session.accessToken}`
    },
    payload: {
      prompt: "Swap dinner to a tofu recipe."
    }
  });

  assert.equal(refineResponse.statusCode, 502);
  assert.equal(refineResponse.json().code, "planner.invalid_refined_plan");
  assert.equal(refineResponse.json().details.reason, "missing_json");

  const storedTemplates = await database.db
    .select()
    .from(databaseTables.mealPlanTemplates)
    .where(eq(databaseTables.mealPlanTemplates.userId, user.id));
  const storedInstances = await database.db
    .select()
    .from(databaseTables.mealPlanInstances)
    .where(eq(databaseTables.mealPlanInstances.userId, user.id));

  assert.equal(storedTemplates.length, 1);
  assert.equal(storedInstances.length, 0);
});