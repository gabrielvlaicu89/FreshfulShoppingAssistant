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