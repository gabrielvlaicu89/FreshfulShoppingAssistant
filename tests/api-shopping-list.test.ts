import assert from "node:assert/strict";
import test from "node:test";

import { eq } from "drizzle-orm";

import {
  aggregateIngredientsFromPlan,
  createApiApp,
  createAppSessionIssuer,
  createAppSessionVerifier,
  createAuthUserRepository,
  createPlannerRepository,
  createShoppingListRepository,
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