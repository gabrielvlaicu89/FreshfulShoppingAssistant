import assert from "node:assert/strict";
import test from "node:test";

import type { HouseholdProfile } from "@freshful/contracts";
import { asc } from "drizzle-orm";
import { eq } from "drizzle-orm";

import {
  aggregateIngredientsFromPlan,
  ClaudeUsageLimitError,
  createApiApp,
  createAppSessionIssuer,
  createAppSessionVerifier,
  createAuthUserRepository,
  createFreshfulCatalogRepository,
  createHouseholdProfileRepository,
  createPlannerRepository,
  createShoppingListRepository,
  type ClaudeService,
  type FreshfulCatalogAdapter,
  type ApiConfig,
  type AuthDatabase,
  type AuthenticatedUser,
  type PlanDetailResponse
} from "../apps/api/src/index.ts";
import { databaseTables } from "../apps/api/src/db/schema.ts";
import { createMigratedTestDatabase } from "../apps/api/src/db/testing.ts";

const sessionSecret = "abcdefghijklmnopqrstuvwxyz123456";

function createTestApiConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    appEnv: "test",
    port: 3107,
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

function createBarrier(targetCount: number) {
  let participantCount = 0;
  let releaseBarrier: (() => void) | undefined;
  const barrierReleased = new Promise<void>((resolve) => {
    releaseBarrier = resolve;
  });

  return {
    async wait() {
      participantCount += 1;

      if (participantCount >= targetCount) {
        releaseBarrier?.();
      }

      await barrierReleased;
    }
  };
}

function createTestProfileRepository(
  database: Awaited<ReturnType<typeof createMigratedTestDatabase>>["db"],
  now: Date
) {
  return createHouseholdProfileRepository(database, {
    now: () => now,
    createId: () => `profile-generated-${now.getTime()}`
  });
}

function createPlanDetail(userId: string, withInstance: boolean): PlanDetailResponse {
  return {
    template: {
      id: "plan-template-1",
      userId,
      title: "2 Day Shopping Draft Plan",
      durationDays: 2,
      recipes: [
        {
          id: "recipe-breakfast",
          title: "Oats and Eggs",
          ingredients: [
            {
              name: "Oats",
              quantity: 80,
              unit: "g"
            },
            {
              name: "Milk",
              quantity: 0.5,
              unit: "l"
            },
            {
              name: "Eggs",
              quantity: 2,
              unit: "pcs"
            }
          ],
          instructions: ["Cook oats.", "Serve with eggs."],
          tags: ["quick"],
          estimatedMacros: {
            calories: 520,
            proteinGrams: 24,
            carbsGrams: 50,
            fatGrams: 20
          }
        },
        {
          id: "recipe-dinner",
          title: "Tomato Skillet",
          ingredients: [
            {
              name: "Tomatoes",
              quantity: 400,
              unit: "g"
            },
            {
              name: "Olive Oil",
              quantity: 2,
              unit: "tbsp"
            }
          ],
          instructions: ["Cook tomatoes.", "Finish with oil."],
          tags: ["vegetarian"],
          estimatedMacros: {
            calories: 430,
            proteinGrams: 8,
            carbsGrams: 28,
            fatGrams: 30
          }
        },
        {
          id: "recipe-dinner-override",
          title: "Tomato Skillet With Eggs",
          ingredients: [
            {
              name: "tomatoes",
              quantity: 0.6,
              unit: "kg"
            },
            {
              name: "Olive Oil",
              quantity: 1,
              unit: "tablespoon"
            },
            {
              name: "Eggs",
              quantity: 1,
              unit: "piece"
            }
          ],
          instructions: ["Cook tomatoes.", "Add eggs.", "Finish with oil."],
          tags: ["vegetarian"],
          estimatedMacros: {
            calories: 510,
            proteinGrams: 16,
            carbsGrams: 30,
            fatGrams: 34
          }
        }
      ],
      days: [
        {
          dayNumber: 1,
          meals: [
            {
              slot: "breakfast",
              recipeId: "recipe-breakfast"
            },
            {
              slot: "dinner",
              recipeId: "recipe-dinner"
            }
          ]
        },
        {
          dayNumber: 2,
          meals: [
            {
              slot: "breakfast",
              recipeId: "recipe-breakfast"
            },
            {
              slot: "dinner",
              recipeId: "recipe-dinner"
            }
          ]
        }
      ],
      metadata: {
        tags: ["shopping-draft"],
        estimatedMacros: {
          calories: 1900,
          proteinGrams: 72,
          carbsGrams: 158,
          fatGrams: 104
        }
      }
    },
    instance: withInstance
      ? {
          id: "plan-instance-1",
          templateId: "plan-template-1",
          startDate: "2026-03-24",
          endDate: "2026-03-25",
          overrides: [
            {
              dayNumber: 2,
              slot: "dinner",
              recipeId: "recipe-dinner-override"
            }
          ]
        }
      : null,
    revisionHistory: [
      {
        templateId: "plan-template-1",
        parentTemplateId: null,
        title: "2 Day Shopping Draft Plan",
        createdAt: "2026-03-23T10:00:00.000Z",
        instanceId: withInstance ? "plan-instance-1" : null,
        startDate: withInstance ? "2026-03-24" : null,
        endDate: withInstance ? "2026-03-25" : null
      }
    ]
  };
}

async function seedPlan(database: Awaited<ReturnType<typeof createMigratedTestDatabase>>["db"], plan: PlanDetailResponse) {
  await database.insert(databaseTables.mealPlanTemplates).values({
    id: plan.template.id,
    userId: plan.template.userId,
    parentTemplateId: null,
    title: plan.template.title,
    durationDays: plan.template.durationDays,
    recipes: plan.template.recipes,
    days: plan.template.days,
    metadata: plan.template.metadata,
    createdAt: "2026-03-23T10:00:00.000Z",
    updatedAt: "2026-03-23T10:00:00.000Z"
  });

  if (!plan.instance) {
    return;
  }

  await database.insert(databaseTables.mealPlanInstances).values({
    id: plan.instance.id,
    templateId: plan.instance.templateId,
    userId: plan.template.userId,
    startDate: plan.instance.startDate,
    endDate: plan.instance.endDate,
    overrides: plan.instance.overrides,
    createdAt: "2026-03-23T10:05:00.000Z",
    updatedAt: "2026-03-23T10:05:00.000Z"
  });
}

async function seedProfile(
  database: Awaited<ReturnType<typeof createMigratedTestDatabase>>["db"],
  userId: string,
  profile: Omit<HouseholdProfile, "userId" | "rawChatHistoryId">
) {
  await database.insert(databaseTables.onboardingTranscripts).values({
    id: `transcript-${userId}`,
    userId,
    messages: [
      {
        id: `message-${userId}`,
        role: "user",
        content: "We want simple shopping support.",
        createdAt: "2026-03-23T09:55:00.000Z"
      }
    ],
    householdProfileId: null,
    containsSensitiveProfileSignals: true,
    createdAt: "2026-03-23T09:55:00.000Z",
    updatedAt: "2026-03-23T09:55:00.000Z"
  });

  await database.insert(databaseTables.householdProfiles).values({
    id: `profile-${userId}`,
    userId,
    householdType: profile.householdType,
    numChildren: profile.numChildren,
    dietaryRestrictions: profile.dietaryRestrictions,
    allergies: profile.allergies,
    medicalFlags: profile.medicalFlags,
    goals: profile.goals,
    cuisinePreferences: profile.cuisinePreferences,
    favoriteIngredients: profile.favoriteIngredients,
    dislikedIngredients: profile.dislikedIngredients,
    budgetBand: profile.budgetBand,
    maxPrepTimeMinutes: profile.maxPrepTimeMinutes,
    cookingSkill: profile.cookingSkill,
    rawChatHistoryId: `transcript-${userId}`,
    containsSensitiveHealthData: true,
    createdAt: "2026-03-23T09:56:00.000Z",
    updatedAt: "2026-03-23T09:56:00.000Z"
  });
}

function createProductSelectionPlan(userId: string): PlanDetailResponse {
  return {
    template: {
      id: "plan-template-products-1",
      userId,
      title: "Product Selection Plan",
      durationDays: 1,
      recipes: [
        {
          id: "recipe-products-1",
          title: "Tomato Soup",
          ingredients: [
            {
              name: "Milk",
              quantity: 1,
              unit: "l"
            },
            {
              name: "Tomatoes",
              quantity: 1000,
              unit: "g"
            },
            {
              name: "Fresh Basil",
              quantity: 1,
              unit: "piece"
            }
          ],
          instructions: ["Cook everything together."],
          tags: ["quick"],
          estimatedMacros: {
            calories: 420,
            proteinGrams: 14,
            carbsGrams: 48,
            fatGrams: 18
          }
        }
      ],
      days: [
        {
          dayNumber: 1,
          meals: [
            {
              slot: "dinner",
              recipeId: "recipe-products-1"
            }
          ]
        }
      ],
      metadata: {
        tags: ["selection"],
        estimatedMacros: {
          calories: 420,
          proteinGrams: 14,
          carbsGrams: 48,
          fatGrams: 18
        }
      }
    },
    instance: {
      id: "plan-instance-products-1",
      templateId: "plan-template-products-1",
      startDate: "2026-03-24",
      endDate: "2026-03-24",
      overrides: []
    },
    revisionHistory: [
      {
        templateId: "plan-template-products-1",
        parentTemplateId: null,
        title: "Product Selection Plan",
        createdAt: "2026-03-23T10:00:00.000Z",
        instanceId: "plan-instance-products-1",
        startDate: "2026-03-24",
        endDate: "2026-03-24"
      }
    ]
  };
}

function createSingleIngredientSelectionPlan(args: {
  userId: string;
  planId: string;
  planTitle: string;
  recipeId: string;
  instanceId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
}): PlanDetailResponse {
  return {
    template: {
      id: args.planId,
      userId: args.userId,
      title: args.planTitle,
      durationDays: 1,
      recipes: [
        {
          id: args.recipeId,
          title: `${args.ingredientName} Test Recipe`,
          ingredients: [
            {
              name: args.ingredientName,
              quantity: args.quantity,
              unit: args.unit
            }
          ],
          instructions: ["Prepare the ingredient."],
          tags: ["test"],
          estimatedMacros: {
            calories: 100,
            proteinGrams: 5,
            carbsGrams: 5,
            fatGrams: 5
          }
        }
      ],
      days: [
        {
          dayNumber: 1,
          meals: [
            {
              slot: "dinner",
              recipeId: args.recipeId
            }
          ]
        }
      ],
      metadata: {
        tags: ["shopping-test"],
        estimatedMacros: {
          calories: 100,
          proteinGrams: 5,
          carbsGrams: 5,
          fatGrams: 5
        }
      }
    },
    instance: {
      id: args.instanceId,
      templateId: args.planId,
      startDate: "2026-03-24",
      endDate: "2026-03-24",
      overrides: []
    },
    revisionHistory: [
      {
        templateId: args.planId,
        parentTemplateId: null,
        title: args.planTitle,
        createdAt: "2026-03-23T10:00:00.000Z",
        instanceId: args.instanceId,
        startDate: "2026-03-24",
        endDate: "2026-03-24"
      }
    ]
  };
}

function createSearchCandidate(args: {
  id: string;
  freshfulId: string;
  name: string;
  price: number;
  unit: string;
  category: string;
  tags?: string[];
  availability?: "in_stock" | "low_stock" | "out_of_stock" | "unknown";
  rank?: number;
}) {
  const slug = `${args.freshfulId}-${args.name.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}`;

  return {
    id: args.id,
    freshfulId: args.freshfulId,
    name: args.name,
    price: args.price,
    currency: "RON" as const,
    unit: args.unit,
    category: args.category,
    tags: args.tags ?? [],
    imageUrl: `https://www.freshful.ro/products/${args.freshfulId}.png`,
    lastSeenAt: "2026-03-23T10:00:00.000Z",
    availability: args.availability ?? "in_stock",
    searchMetadata: {
      query: "test",
      rank: args.rank ?? 0
    },
    productReference: {
      freshfulId: args.freshfulId,
      slug,
      detailPath: `/p/${slug}`,
      detailUrl: `https://www.freshful.ro/p/${slug}`
    }
  };
}

function summarizeResolvedItem(item: {
  ingredientName: string;
  freshfulProductId: string | null;
  chosenQuantity: number | null;
  chosenUnit: string | null;
  estimatedPrice: number | null;
  category: string | null;
  resolutionSource: string;
  resolutionReason: string;
  matchedProduct?: {
    name: string;
  } | null;
}) {
  return {
    ingredientName: item.ingredientName,
    freshfulProductId: item.freshfulProductId,
    chosenQuantity: item.chosenQuantity,
    chosenUnit: item.chosenUnit,
    estimatedPrice: item.estimatedPrice,
    category: item.category,
    resolutionSource: item.resolutionSource,
    resolutionReason: item.resolutionReason,
    matchedProductName: item.matchedProduct?.name ?? null
  };
}

test("aggregateIngredientsFromPlan merges repeated ingredients, normalizes units, and applies plan overrides", () => {
  const plan = createPlanDetail("aggregate-user", true);

  assert.deepEqual(aggregateIngredientsFromPlan(plan), [
    {
      ingredientName: "eggs",
      requiredQuantity: 5,
      requiredUnit: "piece"
    },
    {
      ingredientName: "milk",
      requiredQuantity: 1000,
      requiredUnit: "ml"
    },
    {
      ingredientName: "oats",
      requiredQuantity: 160,
      requiredUnit: "g"
    },
    {
      ingredientName: "olive oil",
      requiredQuantity: 3,
      requiredUnit: "tbsp"
    },
    {
      ingredientName: "tomatoes",
      requiredQuantity: 1000,
      requiredUnit: "g"
    }
  ]);
});

test("POST /plans/:id/shopping-list creates or refreshes a persisted draft and GET /shopping-lists/:id returns it", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-23T11:00:00.000Z");
  const user = createUser("shopping-list-user", fixedNow);
  const session = await createUserSession(database.db as AuthDatabase, user, fixedNow);
  const plan = createPlanDetail(user.id, true);
  await seedPlan(database.db, plan);

  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    auth: {
      sessionVerifier: createFixedCurrentDateSessionVerifier(fixedNow),
      userRepository: createAuthUserRepository(database.db as AuthDatabase, {
        now: () => fixedNow
      })
    },
    profile: {
      repository: createTestProfileRepository(database.db, fixedNow)
    },
    planner: {
      repository: createPlannerRepository(database.db, {
        now: () => fixedNow
      })
    },
    shopping: {
      repository: createShoppingListRepository(database.db, {
        now: () => fixedNow,
        createId: (() => {
          let sequence = 0;

          return () => `shopping-id-${++sequence}`;
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
    url: `/plans/${plan.template.id}/shopping-list`,
    headers: {
      authorization: `Bearer ${session.accessToken}`
    }
  });

  assert.equal(createResponse.statusCode, 200, createResponse.body);
  assert.equal(createResponse.json().id, "shopping-id-1");
  assert.equal(createResponse.json().planId, plan.instance?.id);
  assert.equal(createResponse.json().status, "draft");
  assert.equal(createResponse.json().totalEstimatedCost, 0);
  assert.deepEqual(
    createResponse.json().items.map((item: { ingredientName: string; requiredQuantity: number; requiredUnit: string }) => ({
      ingredientName: item.ingredientName,
      requiredQuantity: item.requiredQuantity,
      requiredUnit: item.requiredUnit
    })),
    [
      {
        ingredientName: "eggs",
        requiredQuantity: 5,
        requiredUnit: "piece"
      },
      {
        ingredientName: "milk",
        requiredQuantity: 1000,
        requiredUnit: "ml"
      },
      {
        ingredientName: "oats",
        requiredQuantity: 160,
        requiredUnit: "g"
      },
      {
        ingredientName: "olive oil",
        requiredQuantity: 3,
        requiredUnit: "tbsp"
      },
      {
        ingredientName: "tomatoes",
        requiredQuantity: 1000,
        requiredUnit: "g"
      }
    ]
  );

  const repeatResponse = await app.inject({
    method: "POST",
    url: `/plans/${plan.template.id}/shopping-list`,
    headers: {
      authorization: `Bearer ${session.accessToken}`
    }
  });

  assert.equal(repeatResponse.statusCode, 200, repeatResponse.body);
  assert.equal(repeatResponse.json().id, "shopping-id-1");

  const [storedList] = await database.db
    .select()
    .from(databaseTables.shoppingLists)
    .where(eq(databaseTables.shoppingLists.id, "shopping-id-1"));
  const storedItems = await database.db
    .select()
    .from(databaseTables.shoppingListItems)
    .where(eq(databaseTables.shoppingListItems.listId, "shopping-id-1"));

  assert.ok(storedList);
  assert.equal(storedList.planId, plan.instance?.id);
  assert.equal(storedItems.length, 5);

  const getResponse = await app.inject({
    method: "GET",
    url: "/shopping-lists/shopping-id-1",
    headers: {
      authorization: `Bearer ${session.accessToken}`
    }
  });

  assert.equal(getResponse.statusCode, 200, getResponse.body);
  assert.deepEqual(
    getResponse.json().items.map((item: { ingredientName: string; requiredQuantity: number; requiredUnit: string }) => ({
      ingredientName: item.ingredientName,
      requiredQuantity: item.requiredQuantity,
      requiredUnit: item.requiredUnit
    })),
    [
      {
        ingredientName: "eggs",
        requiredQuantity: 5,
        requiredUnit: "piece"
      },
      {
        ingredientName: "milk",
        requiredQuantity: 1000,
        requiredUnit: "ml"
      },
      {
        ingredientName: "oats",
        requiredQuantity: 160,
        requiredUnit: "g"
      },
      {
        ingredientName: "olive oil",
        requiredQuantity: 3,
        requiredUnit: "tbsp"
      },
      {
        ingredientName: "tomatoes",
        requiredQuantity: 1000,
        requiredUnit: "g"
      }
    ]
  );
});

test("POST /plans/:id/shopping-list converges overlapping first-draft requests into one persisted draft", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-23T11:07:00.000Z");
  const user = createUser("shopping-list-concurrent-user", fixedNow);
  const session = await createUserSession(database.db as AuthDatabase, user, fixedNow);
  const plan = createPlanDetail(user.id, true);
  const firstDraftBarrier = createBarrier(2);
  await seedPlan(database.db, plan);

  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    auth: {
      sessionVerifier: createFixedCurrentDateSessionVerifier(fixedNow),
      userRepository: createAuthUserRepository(database.db as AuthDatabase, {
        now: () => fixedNow
      })
    },
    profile: {
      repository: createTestProfileRepository(database.db, fixedNow)
    },
    planner: {
      repository: createPlannerRepository(database.db, {
        now: () => fixedNow
      })
    },
    shopping: {
      repository: createShoppingListRepository(database.db, {
        now: () => fixedNow,
        createId: (() => {
          let sequence = 0;

          return () => `shopping-concurrent-id-${++sequence}`;
        })(),
        onActiveDraftLoadedForUpsert(draftListId) {
          if (draftListId === null) {
            return firstDraftBarrier.wait();
          }

          return undefined;
        }
      })
    }
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const [firstResponse, secondResponse] = await Promise.all([
    app.inject({
      method: "POST",
      url: `/plans/${plan.template.id}/shopping-list`,
      headers: {
        authorization: `Bearer ${session.accessToken}`
      }
    }),
    app.inject({
      method: "POST",
      url: `/plans/${plan.template.id}/shopping-list`,
      headers: {
        authorization: `Bearer ${session.accessToken}`
      }
    })
  ]);

  assert.equal(firstResponse.statusCode, 200, firstResponse.body);
  assert.equal(secondResponse.statusCode, 200, secondResponse.body);
  assert.equal(firstResponse.json().id, secondResponse.json().id);
  assert.equal(firstResponse.json().status, "draft");
  assert.equal(secondResponse.json().status, "draft");

  const storedLists = await database.db
    .select()
    .from(databaseTables.shoppingLists)
    .where(eq(databaseTables.shoppingLists.userId, user.id));
  const storedItems = await database.db
    .select()
    .from(databaseTables.shoppingListItems)
    .where(eq(databaseTables.shoppingListItems.listId, firstResponse.json().id));

  assert.equal(storedLists.length, 1);
  assert.equal(storedLists[0]?.planId, plan.instance?.id);
  assert.equal(storedLists[0]?.status, "draft");
  assert.equal(storedItems.length, 5);
});

test("POST /plans/:id/shopping-list serializes overlapping refreshes for an existing persisted draft", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-23T11:11:00.000Z");
  const user = createUser("shopping-list-concurrent-refresh-user", fixedNow);
  const session = await createUserSession(database.db as AuthDatabase, user, fixedNow);
  const plan = createPlanDetail(user.id, true);
  const refreshBarrier = createBarrier(2);
  await seedPlan(database.db, plan);

  let firstDraftCreated = false;

  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    auth: {
      sessionVerifier: createFixedCurrentDateSessionVerifier(fixedNow),
      userRepository: createAuthUserRepository(database.db as AuthDatabase, {
        now: () => fixedNow
      })
    },
    profile: {
      repository: createTestProfileRepository(database.db, fixedNow)
    },
    planner: {
      repository: createPlannerRepository(database.db, {
        now: () => fixedNow
      })
    },
    shopping: {
      repository: createShoppingListRepository(database.db, {
        now: () => fixedNow,
        createId: (() => {
          let sequence = 0;

          return () => `shopping-refresh-id-${++sequence}`;
        })(),
        onActiveDraftLoadedForUpsert(draftListId) {
          if (draftListId !== null && firstDraftCreated) {
            return refreshBarrier.wait();
          }

          return undefined;
        }
      })
    }
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const initialResponse = await app.inject({
    method: "POST",
    url: `/plans/${plan.template.id}/shopping-list`,
    headers: {
      authorization: `Bearer ${session.accessToken}`
    }
  });

  assert.equal(initialResponse.statusCode, 200, initialResponse.body);
  assert.equal(initialResponse.json().id, "shopping-refresh-id-1");
  firstDraftCreated = true;

  const [firstRefreshResponse, secondRefreshResponse] = await Promise.all([
    app.inject({
      method: "POST",
      url: `/plans/${plan.template.id}/shopping-list`,
      headers: {
        authorization: `Bearer ${session.accessToken}`
      }
    }),
    app.inject({
      method: "POST",
      url: `/plans/${plan.template.id}/shopping-list`,
      headers: {
        authorization: `Bearer ${session.accessToken}`
      }
    })
  ]);

  assert.equal(firstRefreshResponse.statusCode, 200, firstRefreshResponse.body);
  assert.equal(secondRefreshResponse.statusCode, 200, secondRefreshResponse.body);
  assert.equal(firstRefreshResponse.json().id, "shopping-refresh-id-1");
  assert.equal(secondRefreshResponse.json().id, "shopping-refresh-id-1");

  const storedLists = await database.db
    .select()
    .from(databaseTables.shoppingLists)
    .where(eq(databaseTables.shoppingLists.userId, user.id));
  const storedItems = await database.db
    .select()
    .from(databaseTables.shoppingListItems)
    .where(eq(databaseTables.shoppingListItems.listId, "shopping-refresh-id-1"));

  assert.equal(storedLists.length, 1);
  assert.equal(storedLists[0]?.status, "draft");
  assert.deepEqual(
    storedItems.map((item) => ({
      ingredientName: item.ingredientName,
      requiredQuantity: item.requiredQuantity,
      requiredUnit: item.requiredUnit
    })),
    [
      {
        ingredientName: "eggs",
        requiredQuantity: 5,
        requiredUnit: "piece"
      },
      {
        ingredientName: "milk",
        requiredQuantity: 1000,
        requiredUnit: "ml"
      },
      {
        ingredientName: "oats",
        requiredQuantity: 160,
        requiredUnit: "g"
      },
      {
        ingredientName: "olive oil",
        requiredQuantity: 3,
        requiredUnit: "tbsp"
      },
      {
        ingredientName: "tomatoes",
        requiredQuantity: 1000,
        requiredUnit: "g"
      }
    ]
  );
  assert.equal(new Set(storedItems.map((item) => item.ingredientName)).size, storedItems.length);
});

test("POST /plans/:id/shopping-list rejects plan templates that do not have a dated instance", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-23T11:15:00.000Z");
  const user = createUser("shopping-list-undated-user", fixedNow);
  const session = await createUserSession(database.db as AuthDatabase, user, fixedNow);
  const plan = createPlanDetail(user.id, false);
  await seedPlan(database.db, plan);

  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    auth: {
      sessionVerifier: createFixedCurrentDateSessionVerifier(fixedNow),
      userRepository: createAuthUserRepository(database.db as AuthDatabase, {
        now: () => fixedNow
      })
    },
    profile: {
      repository: createTestProfileRepository(database.db, fixedNow)
    },
    planner: {
      repository: createPlannerRepository(database.db, {
        now: () => fixedNow
      })
    },
    shopping: {
      repository: createShoppingListRepository(database.db, {
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
    url: `/plans/${plan.template.id}/shopping-list`,
    headers: {
      authorization: `Bearer ${session.accessToken}`
    }
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().code, "shopping_list.plan_instance_required");

  const storedLists = await database.db
    .select()
    .from(databaseTables.shoppingLists)
    .where(eq(databaseTables.shoppingLists.userId, user.id));

  assert.equal(storedLists.length, 0);
});

test("POST /plans/:id/shopping-list persists and returns resolution metadata for deterministic, AI, and unresolved items", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-23T12:00:00.000Z");
  const user = createUser("shopping-list-resolution-user", fixedNow);
  const session = await createUserSession(database.db as AuthDatabase, user, fixedNow);
  const plan = createProductSelectionPlan(user.id);
  await seedPlan(database.db, plan);
  await seedProfile(database.db, user.id, {
    householdType: "family",
    numChildren: 1,
    dietaryRestrictions: ["vegetarian"],
    allergies: {
      normalized: [],
      freeText: []
    },
    medicalFlags: {
      diabetes: false,
      hypertension: false
    },
    goals: ["maintenance"],
    cuisinePreferences: ["Mediterranean"],
    favoriteIngredients: ["tomatoes"],
    dislikedIngredients: ["celery"],
    budgetBand: "medium",
    maxPrepTimeMinutes: 30,
    cookingSkill: "intermediate"
  });

  const searchCalls: string[] = [];
  const aiCalls: string[] = [];
  const freshfulRepository = createFreshfulCatalogRepository(database.db);
  const freshfulService: FreshfulCatalogAdapter = {
    async searchProducts(input) {
      searchCalls.push(input.query);

      if (input.query === "milk") {
        const product = createSearchCandidate({
          id: "product-milk-1",
          freshfulId: "freshful-milk-1",
          name: "Milk 1L",
          price: 10.5,
          unit: "1l",
          category: "Dairy",
          rank: 0
        });

        await freshfulRepository.saveSearchResult({
          cacheKey: `search::${input.query}`,
          input,
          products: [product],
          fetchedAt: fixedNow.toISOString(),
          expiresAt: new Date(fixedNow.getTime() + 60_000).toISOString(),
          responseHash: `hash::${input.query}`
        });

        return {
          products: [product],
          cache: {
            source: "network",
            isStale: false,
            fetchedAt: fixedNow.toISOString(),
            expiresAt: new Date(fixedNow.getTime() + 60_000).toISOString(),
            recency: {
              policy: "search",
              status: "fresh",
              ageMs: 0,
              maxAgeMs: 60_000
            }
          }
        };
      }

      if (input.query === "tomatoes" || input.query === "tomato") {
        const products = [
          createSearchCandidate({
            id: "product-tomato-1",
            freshfulId: "freshful-tomato-1",
            name: "Cherry Tomatoes 500 g",
            price: 8.99,
            unit: "500 g",
            category: "Vegetables",
            rank: 0
          }),
          createSearchCandidate({
            id: "product-tomato-2",
            freshfulId: "freshful-tomato-2",
            name: "Diced Tomatoes 500 g",
            price: 7.49,
            unit: "500 g",
            category: "Pantry",
            rank: 1
          })
        ];

        await freshfulRepository.saveSearchResult({
          cacheKey: `search::${input.query}`,
          input,
          products,
          fetchedAt: fixedNow.toISOString(),
          expiresAt: new Date(fixedNow.getTime() + 60_000).toISOString(),
          responseHash: `hash::${input.query}`
        });

        return {
          products,
          cache: {
            source: "network",
            isStale: false,
            fetchedAt: fixedNow.toISOString(),
            expiresAt: new Date(fixedNow.getTime() + 60_000).toISOString(),
            recency: {
              policy: "search",
              status: "fresh",
              ageMs: 0,
              maxAgeMs: 60_000
            }
          }
        };
      }

      if (input.query === "fresh basil") {
        const products = [
          createSearchCandidate({
            id: "product-basil-1",
            freshfulId: "freshful-basil-1",
              name: "Living Herb Pot 1 pc",
            price: 6.2,
              unit: "1 pc",
              category: "Home Gardening",
              availability: "unknown",
              rank: 4
          }),
          createSearchCandidate({
            id: "product-basil-2",
            freshfulId: "freshful-basil-2",
              name: "Pesto Verde 190 g",
            price: 9.4,
            unit: "190 g",
            category: "Sauces",
              availability: "out_of_stock",
              rank: 5
          })
        ];

        await freshfulRepository.saveSearchResult({
          cacheKey: `search::${input.query}`,
          input,
          products,
          fetchedAt: fixedNow.toISOString(),
          expiresAt: new Date(fixedNow.getTime() + 60_000).toISOString(),
          responseHash: `hash::${input.query}`
        });

        return {
          products,
          cache: {
            source: "network",
            isStale: false,
            fetchedAt: fixedNow.toISOString(),
            expiresAt: new Date(fixedNow.getTime() + 60_000).toISOString(),
            recency: {
              policy: "search",
              status: "fresh",
              ageMs: 0,
              maxAgeMs: 60_000
            }
          }
        };
      }

      return {
        products: [],
        cache: {
          source: "network",
          isStale: false,
          fetchedAt: fixedNow.toISOString(),
          expiresAt: new Date(fixedNow.getTime() + 60_000).toISOString(),
          recency: {
            policy: "search",
            status: "fresh",
            ageMs: 0,
            maxAgeMs: 60_000
          }
        }
      };
    },
    async getProductDetails(reference) {
      const persisted = await freshfulRepository.getProductByReference(reference);

      assert.ok(persisted);

      return {
        product: persisted.product,
        productReference: persisted.productReference,
        cache: {
          source: "cache",
          isStale: false,
          fetchedAt: fixedNow.toISOString(),
          expiresAt: new Date(fixedNow.getTime() + 60_000).toISOString(),
          recency: {
            policy: "detail",
            status: "fresh",
            ageMs: 0,
            maxAgeMs: 60_000
          }
        }
      };
    }
  };
  const aiService: ClaudeService = {
    async createOnboardingReply() {
      throw new Error("Unexpected onboarding reply call.");
    },
    async extractProfile() {
      throw new Error("Unexpected profile extraction call.");
    },
    async createMealPlan() {
      throw new Error("Unexpected meal-plan generation call.");
    },
    async refineMealPlan() {
      throw new Error("Unexpected meal-plan refinement call.");
    },
    async selectShoppingProduct(request) {
      aiCalls.push(request.ingredientName);

      if (request.ingredientName === "tomatoes") {
        return {
          selectedProductId: "product-tomato-2",
          reason: "Canned diced tomatoes fit the recipe and required quantity better.",
          rawText: JSON.stringify({
            selectedProductId: "product-tomato-2",
            reason: "Canned diced tomatoes fit the recipe and required quantity better."
          }),
          parseFailureReason: null,
          usage: {
            model: "claude-3-5-haiku-latest",
            modelTier: "haiku",
            routeReason: "Shopping product tie-breakers stay on Haiku unless prompt size requires escalation.",
            inputTokens: 40,
            outputTokens: 15
          }
        };
      }

      return {
        selectedProductId: null,
        reason: "None of the candidates look like fresh basil leaves.",
        rawText: JSON.stringify({
          selectedProductId: null,
          reason: "None of the candidates look like fresh basil leaves."
        }),
        parseFailureReason: null,
        usage: {
          model: "claude-3-5-haiku-latest",
          modelTier: "haiku",
          routeReason: "Shopping product tie-breakers stay on Haiku unless prompt size requires escalation.",
          inputTokens: 38,
          outputTokens: 13
        }
      };
    }
  };

  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    services: {
      ai: {
        name: "ai",
        status: "ready",
        implementation: aiService
      }
    },
    auth: {
      sessionVerifier: createFixedCurrentDateSessionVerifier(fixedNow),
      userRepository: createAuthUserRepository(database.db as AuthDatabase, {
        now: () => fixedNow
      })
    },
    profile: {
      repository: createTestProfileRepository(database.db, fixedNow)
    },
    planner: {
      repository: createPlannerRepository(database.db, {
        now: () => fixedNow
      })
    },
    freshful: {
      repository: freshfulRepository,
      service: freshfulService
    },
    shopping: {
      repository: createShoppingListRepository(database.db, {
        now: () => fixedNow,
        createId: (() => {
          let sequence = 0;

          return () => `shopping-resolution-id-${++sequence}`;
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
    url: `/plans/${plan.template.id}/shopping-list`,
    headers: {
      authorization: `Bearer ${session.accessToken}`
    }
  });

  assert.equal(createResponse.statusCode, 200, createResponse.body);
  assert.deepEqual(searchCalls, ["fresh basil", "milk", "tomatoes"]);
  assert.deepEqual(aiCalls, ["tomatoes"]);
  assert.equal(createResponse.json().totalEstimatedCost, 25.48);
  assert.deepEqual(
    createResponse
      .json()
      .items.map((item: Parameters<typeof summarizeResolvedItem>[0]) => summarizeResolvedItem(item)),
    [
      {
        ingredientName: "fresh basil",
        freshfulProductId: null,
        chosenQuantity: null,
        chosenUnit: null,
        estimatedPrice: null,
        category: null,
        resolutionSource: "unresolved",
        resolutionReason: "Only \"Living Herb Pot 1 pc\" remained, but the deterministic score was too weak for an automatic match.",
        matchedProductName: null
      },
      {
        ingredientName: "milk",
        freshfulProductId: "product-milk-1",
        chosenQuantity: 1,
        chosenUnit: "1l",
        estimatedPrice: 10.5,
        category: "Dairy",
        resolutionSource: "deterministic",
        resolutionReason: "Deterministic rules selected \"Milk 1L\" as the only viable Freshful candidate.",
        matchedProductName: "Milk 1L"
      },
      {
        ingredientName: "tomatoes",
        freshfulProductId: "product-tomato-2",
        chosenQuantity: 2,
        chosenUnit: "500 g",
        estimatedPrice: 14.98,
        category: "Pantry",
        resolutionSource: "ai",
        resolutionReason: "Canned diced tomatoes fit the recipe and required quantity better.",
        matchedProductName: "Diced Tomatoes 500 g"
      }
    ]
  );

  const getResponse = await app.inject({
    method: "GET",
    url: "/shopping-lists/shopping-resolution-id-1",
    headers: {
      authorization: `Bearer ${session.accessToken}`
    }
  });

  assert.equal(getResponse.statusCode, 200, getResponse.body);
  assert.equal(getResponse.json().totalEstimatedCost, 25.48);
  assert.deepEqual(
    getResponse
      .json()
      .items.map((item: Parameters<typeof summarizeResolvedItem>[0]) => summarizeResolvedItem(item)),
    [
      {
        ingredientName: "fresh basil",
        freshfulProductId: null,
        chosenQuantity: null,
        chosenUnit: null,
        estimatedPrice: null,
        category: null,
        resolutionSource: "unresolved",
        resolutionReason: "Only \"Living Herb Pot 1 pc\" remained, but the deterministic score was too weak for an automatic match.",
        matchedProductName: null
      },
      {
        ingredientName: "milk",
        freshfulProductId: "product-milk-1",
        chosenQuantity: 1,
        chosenUnit: "1l",
        estimatedPrice: 10.5,
        category: "Dairy",
        resolutionSource: "deterministic",
        resolutionReason: "Deterministic rules selected \"Milk 1L\" as the only viable Freshful candidate.",
        matchedProductName: "Milk 1L"
      },
      {
        ingredientName: "tomatoes",
        freshfulProductId: "product-tomato-2",
        chosenQuantity: 2,
        chosenUnit: "500 g",
        estimatedPrice: 14.98,
        category: "Pantry",
        resolutionSource: "ai",
        resolutionReason: "Canned diced tomatoes fit the recipe and required quantity better.",
        matchedProductName: "Diced Tomatoes 500 g"
      }
    ]
  );

  const storedItems = await database.db
    .select({
      ingredientName: databaseTables.shoppingListItems.ingredientName,
      resolutionSource: databaseTables.shoppingListItems.resolutionSource,
      resolutionReason: databaseTables.shoppingListItems.resolutionReason,
      freshfulProductId: databaseTables.shoppingListItems.freshfulProductId
    })
    .from(databaseTables.shoppingListItems)
    .where(eq(databaseTables.shoppingListItems.listId, "shopping-resolution-id-1"))
    .orderBy(asc(databaseTables.shoppingListItems.ingredientName));

  assert.deepEqual(storedItems, [
    {
      ingredientName: "fresh basil",
      resolutionSource: "unresolved",
      resolutionReason: "Only \"Living Herb Pot 1 pc\" remained, but the deterministic score was too weak for an automatic match.",
      freshfulProductId: null
    },
    {
      ingredientName: "milk",
      resolutionSource: "deterministic",
      resolutionReason: "Deterministic rules selected \"Milk 1L\" as the only viable Freshful candidate.",
      freshfulProductId: "product-milk-1"
    },
    {
      ingredientName: "tomatoes",
      resolutionSource: "ai",
      resolutionReason: "Canned diced tomatoes fit the recipe and required quantity better.",
      freshfulProductId: "product-tomato-2"
    }
  ]);

  const [storedList] = await database.db
    .select()
    .from(databaseTables.shoppingLists)
    .where(eq(databaseTables.shoppingLists.id, "shopping-resolution-id-1"));

  assert.equal(storedList?.totalEstimatedCost, 25.48);
});

test("POST /plans/:id/shopping-list returns unresolved when the only candidate violates hard dietary or allergy constraints", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-23T12:30:00.000Z");
  const user = createUser("shopping-list-unsafe-single-user", fixedNow);
  const session = await createUserSession(database.db as AuthDatabase, user, fixedNow);
  const plan = createSingleIngredientSelectionPlan({
    userId: user.id,
    planId: "plan-template-unsafe-single-1",
    planTitle: "Unsafe Single Candidate Plan",
    recipeId: "recipe-unsafe-single-1",
    instanceId: "plan-instance-unsafe-single-1",
    ingredientName: "Milk",
    quantity: 1,
    unit: "l"
  });
  await seedPlan(database.db, plan);
  await seedProfile(database.db, user.id, {
    householdType: "single",
    numChildren: 0,
    dietaryRestrictions: [],
    allergies: {
      normalized: ["dairy"],
      freeText: []
    },
    medicalFlags: {
      diabetes: false,
      hypertension: false
    },
    goals: ["maintenance"],
    cuisinePreferences: ["Mediterranean"],
    favoriteIngredients: [],
    dislikedIngredients: [],
    budgetBand: "medium",
    maxPrepTimeMinutes: 30,
    cookingSkill: "intermediate"
  });

  const aiCalls: string[] = [];
  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    services: {
      ai: {
        name: "ai",
        status: "ready",
        implementation: {
          async createOnboardingReply() {
            throw new Error("Unexpected onboarding reply call.");
          },
          async extractProfile() {
            throw new Error("Unexpected profile extraction call.");
          },
          async createMealPlan() {
            throw new Error("Unexpected meal-plan generation call.");
          },
          async refineMealPlan() {
            throw new Error("Unexpected meal-plan refinement call.");
          },
          async selectShoppingProduct(request) {
            aiCalls.push(request.ingredientName);
            throw new Error("AI tie-break should not run for filtered candidates.");
          }
        } satisfies ClaudeService
      }
    },
    auth: {
      sessionVerifier: createFixedCurrentDateSessionVerifier(fixedNow),
      userRepository: createAuthUserRepository(database.db as AuthDatabase, {
        now: () => fixedNow
      })
    },
    profile: {
      repository: createTestProfileRepository(database.db, fixedNow)
    },
    planner: {
      repository: createPlannerRepository(database.db, {
        now: () => fixedNow
      })
    },
    freshful: {
      repository: createFreshfulCatalogRepository(database.db),
      service: {
        async searchProducts(input) {
          assert.equal(input.query, "milk");

          return {
            products: [
              createSearchCandidate({
                id: "product-milk-unsafe-1",
                freshfulId: "freshful-milk-unsafe-1",
                name: "Milk 1L",
                price: 10.5,
                unit: "1l",
                category: "Dairy",
                rank: 0
              })
            ],
            cache: {
              source: "network",
              isStale: false,
              fetchedAt: fixedNow.toISOString(),
              expiresAt: new Date(fixedNow.getTime() + 60_000).toISOString(),
              recency: {
                policy: "search",
                status: "fresh",
                ageMs: 0,
                maxAgeMs: 60_000
              }
            }
          };
        },
        async getProductDetails() {
          throw new Error("Unexpected product details call.");
        }
      } satisfies FreshfulCatalogAdapter
    },
    shopping: {
      repository: createShoppingListRepository(database.db, {
        now: () => fixedNow,
        createId: () => "shopping-unsafe-single-id-1"
      })
    }
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const response = await app.inject({
    method: "POST",
    url: `/plans/${plan.template.id}/shopping-list`,
    headers: {
      authorization: `Bearer ${session.accessToken}`
    }
  });

  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().totalEstimatedCost, 0);
  assert.deepEqual(aiCalls, []);
  assert.deepEqual(
    response
      .json()
      .items.map((item: Parameters<typeof summarizeResolvedItem>[0]) => summarizeResolvedItem(item)),
    [
      {
        ingredientName: "milk",
        freshfulProductId: null,
        chosenQuantity: null,
        chosenUnit: null,
        estimatedPrice: null,
        category: null,
        resolutionSource: "unresolved",
        resolutionReason: "No safe Freshful candidates remained after applying hard dietary and allergy constraints for this household.",
        matchedProductName: null
      }
    ]
  );
});

test("POST /plans/:id/shopping-list keeps ambiguous items unresolved when the AI tie-break hits a usage limit", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-23T14:30:00.000Z");
  const user = createUser("shopping-list-ai-budget-user", fixedNow);
  const session = await createUserSession(database.db as AuthDatabase, user, fixedNow);
  const plan = createProductSelectionPlan(user.id);

  await seedPlan(database.db, plan);
  await seedProfile(database.db, user.id, {
    householdType: "family",
    numChildren: 1,
    dietaryRestrictions: ["vegetarian"],
    allergies: {
      normalized: [],
      freeText: []
    },
    medicalFlags: {
      diabetes: false,
      hypertension: false
    },
    goals: ["maintenance"],
    cuisinePreferences: ["Romanian"],
    favoriteIngredients: ["tomatoes"],
    dislikedIngredients: [],
    budgetBand: "medium",
    maxPrepTimeMinutes: 30,
    cookingSkill: "intermediate"
  });

  const freshfulService: FreshfulCatalogAdapter = {
    async searchProducts(input) {
      if (input.query.toLowerCase() === "tomatoes") {
        return {
          products: [
            {
              id: "product-tomato-1",
              freshfulId: "freshful-tomato-1",
              name: "Tomatoes 1 kg",
              price: 12.99,
              currency: "RON",
              unit: "1 kg",
              category: "Produce",
              tags: [],
              imageUrl: "https://cdn.example.com/tomatoes-1kg.jpg",
              lastSeenAt: fixedNow.toISOString(),
              availability: "in_stock",
              searchMetadata: {
                query: input.query,
                rank: 0,
                matchedTerm: "tomatoes"
              },
              productReference: {
                freshfulId: "freshful-tomato-1",
                slug: "tomatoes-1kg",
                detailPath: "/p/tomatoes-1kg",
                detailUrl: "https://www.freshful.ro/p/tomatoes-1kg"
              }
            },
            {
              id: "product-tomato-2",
              freshfulId: "freshful-tomato-2",
              name: "Diced Tomatoes 500 g",
              price: 7.49,
              currency: "RON",
              unit: "500 g",
              category: "Pantry",
              tags: [],
              imageUrl: "https://cdn.example.com/diced-tomatoes-500g.jpg",
              lastSeenAt: fixedNow.toISOString(),
              availability: "in_stock",
              searchMetadata: {
                query: input.query,
                rank: 1,
                matchedTerm: "tomatoes"
              },
              productReference: {
                freshfulId: "freshful-tomato-2",
                slug: "diced-tomatoes-500g",
                detailPath: "/p/diced-tomatoes-500g",
                detailUrl: "https://www.freshful.ro/p/diced-tomatoes-500g"
              }
            }
          ],
          cache: {
            source: "network",
            isStale: false,
            fetchedAt: fixedNow.toISOString(),
            expiresAt: new Date(fixedNow.getTime() + 60_000).toISOString(),
            recency: {
              policy: "search",
              status: "fresh",
              ageMs: 0,
              maxAgeMs: 60_000
            }
          }
        };
      }

      return {
        products: [],
        cache: {
          source: "network",
          isStale: false,
          fetchedAt: fixedNow.toISOString(),
          expiresAt: new Date(fixedNow.getTime() + 60_000).toISOString(),
          recency: {
            policy: "search",
            status: "fresh",
            ageMs: 0,
            maxAgeMs: 60_000
          }
        }
      };
    },
    async getProductDetails() {
      throw new Error("unused");
    }
  };
  const aiService: ClaudeService = {
    async createOnboardingReply() {
      throw new Error("unused");
    },
    async extractProfile() {
      throw new Error("unused");
    },
    async createMealPlan() {
      throw new Error("unused");
    },
    async refineMealPlan() {
      throw new Error("unused");
    },
    async selectShoppingProduct() {
      throw new ClaudeUsageLimitError("AI tie-break budget exhausted.");
    }
  };

  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    services: {
      ai: {
        name: "ai",
        status: "ready",
        implementation: aiService
      }
    },
    auth: {
      sessionVerifier: createFixedCurrentDateSessionVerifier(fixedNow),
      userRepository: createAuthUserRepository(database.db as AuthDatabase, {
        now: () => fixedNow
      })
    },
    profile: {
      repository: createTestProfileRepository(database.db, fixedNow)
    },
    planner: {
      repository: createPlannerRepository(database.db, {
        now: () => fixedNow
      })
    },
    shopping: {
      repository: createShoppingListRepository(database.db, {
        now: () => fixedNow
      })
    },
    freshful: {
      service: freshfulService
    }
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const response = await app.inject({
    method: "POST",
    url: `/plans/${plan.template.id}/shopping-list`,
    headers: {
      authorization: `Bearer ${session.accessToken}`
    }
  });

  assert.equal(response.statusCode, 200, response.body);
  const tomatoItem = response.json().items.find((item: { ingredientName: string }) => item.ingredientName === "tomatoes");

  assert.equal(tomatoItem?.resolutionSource, "unresolved");
  assert.match(tomatoItem?.resolutionReason ?? "", /usage budget is currently exhausted/u);
});

test("POST /plans/:id/shopping-list never invokes AI when every ambiguous candidate is filtered by hard constraints", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-23T12:45:00.000Z");
  const user = createUser("shopping-list-all-unsafe-user", fixedNow);
  const session = await createUserSession(database.db as AuthDatabase, user, fixedNow);
  const plan = createSingleIngredientSelectionPlan({
    userId: user.id,
    planId: "plan-template-all-unsafe-1",
    planTitle: "All Unsafe Candidate Plan",
    recipeId: "recipe-all-unsafe-1",
    instanceId: "plan-instance-all-unsafe-1",
    ingredientName: "Yogurt",
    quantity: 2,
    unit: "pcs"
  });
  await seedPlan(database.db, plan);
  await seedProfile(database.db, user.id, {
    householdType: "single",
    numChildren: 0,
    dietaryRestrictions: [],
    allergies: {
      normalized: ["dairy"],
      freeText: []
    },
    medicalFlags: {
      diabetes: false,
      hypertension: false
    },
    goals: ["maintenance"],
    cuisinePreferences: ["Mediterranean"],
    favoriteIngredients: [],
    dislikedIngredients: [],
    budgetBand: "medium",
    maxPrepTimeMinutes: 30,
    cookingSkill: "intermediate"
  });

  const aiCalls: string[] = [];
  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    services: {
      ai: {
        name: "ai",
        status: "ready",
        implementation: {
          async createOnboardingReply() {
            throw new Error("Unexpected onboarding reply call.");
          },
          async extractProfile() {
            throw new Error("Unexpected profile extraction call.");
          },
          async createMealPlan() {
            throw new Error("Unexpected meal-plan generation call.");
          },
          async refineMealPlan() {
            throw new Error("Unexpected meal-plan refinement call.");
          },
          async selectShoppingProduct(request) {
            aiCalls.push(request.ingredientName);
            throw new Error("AI tie-break should not run when all candidates are filtered out.");
          }
        } satisfies ClaudeService
      }
    },
    auth: {
      sessionVerifier: createFixedCurrentDateSessionVerifier(fixedNow),
      userRepository: createAuthUserRepository(database.db as AuthDatabase, {
        now: () => fixedNow
      })
    },
    profile: {
      repository: createTestProfileRepository(database.db, fixedNow)
    },
    planner: {
      repository: createPlannerRepository(database.db, {
        now: () => fixedNow
      })
    },
    freshful: {
      repository: createFreshfulCatalogRepository(database.db),
      service: {
        async searchProducts(input) {
          assert.equal(input.query, "yogurt");

          return {
            products: [
              createSearchCandidate({
                id: "product-yogurt-unsafe-1",
                freshfulId: "freshful-yogurt-unsafe-1",
                name: "Greek Yogurt 400 g",
                price: 9.9,
                unit: "400 g",
                category: "Dairy",
                rank: 0
              }),
              createSearchCandidate({
                id: "product-yogurt-unsafe-2",
                freshfulId: "freshful-yogurt-unsafe-2",
                name: "Drinkable Yogurt 330 ml",
                price: 7.4,
                unit: "330 ml",
                category: "Dairy Drinks",
                rank: 1
              })
            ],
            cache: {
              source: "network",
              isStale: false,
              fetchedAt: fixedNow.toISOString(),
              expiresAt: new Date(fixedNow.getTime() + 60_000).toISOString(),
              recency: {
                policy: "search",
                status: "fresh",
                ageMs: 0,
                maxAgeMs: 60_000
              }
            }
          };
        },
        async getProductDetails() {
          throw new Error("Unexpected product details call.");
        }
      } satisfies FreshfulCatalogAdapter
    },
    shopping: {
      repository: createShoppingListRepository(database.db, {
        now: () => fixedNow,
        createId: () => "shopping-all-unsafe-id-1"
      })
    }
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const response = await app.inject({
    method: "POST",
    url: `/plans/${plan.template.id}/shopping-list`,
    headers: {
      authorization: `Bearer ${session.accessToken}`
    }
  });

  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().totalEstimatedCost, 0);
  assert.deepEqual(aiCalls, []);
  assert.deepEqual(
    response
      .json()
      .items.map((item: Parameters<typeof summarizeResolvedItem>[0]) => summarizeResolvedItem(item)),
    [
      {
        ingredientName: "yogurt",
        freshfulProductId: null,
        chosenQuantity: null,
        chosenUnit: null,
        estimatedPrice: null,
        category: null,
        resolutionSource: "unresolved",
        resolutionReason: "No safe Freshful candidates remained after applying hard dietary and allergy constraints for this household.",
        matchedProductName: null
      }
    ]
  );
});