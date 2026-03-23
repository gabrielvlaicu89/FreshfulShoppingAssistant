import assert from "node:assert/strict";
import test from "node:test";

import type { OnboardingChatMessage } from "@freshful/contracts";

import {
  assembleMealPlanPrompt,
  assembleProfileExtractionPrompt,
  assembleShoppingProductSelectionPrompt,
  ClaudeUpstreamError,
  ClaudeUsageLimitError,
  assembleOnboardingReplyPrompt,
  createAnthropicClient,
  createClaudeService,
  partialProfileWriteSchema,
  parseStructuredResponse,
  selectClaudeModel,
  type ApiConfig,
  type ClaudeClient
} from "../apps/api/src/index.ts";
import { profileWriteSchema } from "../apps/api/src/profile/contracts.ts";

function createTestApiConfig(): ApiConfig {
  return {
    appEnv: "test",
    port: 3104,
    databaseUrl: "postgres://freshful:freshful@localhost:5432/freshful_test",
    session: {
      secret: "abcdefghijklmnopqrstuvwxyz123456",
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
        maxPromptChars: 6000,
        maxOutputTokens: 900,
        maxTranscriptMessages: 3
      },
      routing: {
        sonnetTranscriptMessageThreshold: 4,
        sonnetPromptCharThreshold: 1200
      }
    },
    freshful: {
      baseUrl: "https://www.freshful.ro",
      searchPath: "/search",
      requestTimeoutMs: 10000
    }
  };
}

function createAnthropicTestConfig(): NonNullable<ApiConfig["anthropic"]> {
  const anthropicConfig = createTestApiConfig().anthropic;

  assert.ok(anthropicConfig);

  return anthropicConfig;
}

function createTranscript(): OnboardingChatMessage[] {
  return [
    {
      id: "1",
      role: "assistant",
      content: "Salut, cu cine facem planificarea meselor?",
      createdAt: "2026-03-22T10:00:00.000Z"
    },
    {
      id: "2",
      role: "user",
      content: "Suntem doi adulți și un copil.",
      createdAt: "2026-03-22T10:00:05.000Z"
    },
    {
      id: "3",
      role: "assistant",
      content: "Aveți alergii sau restricții alimentare?",
      createdAt: "2026-03-22T10:00:10.000Z"
    },
    {
      id: "4",
      role: "user",
      content: "Fără gluten și vrem rețete rapide.",
      createdAt: "2026-03-22T10:00:15.000Z"
    }
  ];
}

test("assembleOnboardingReplyPrompt trims the transcript and includes the onboarding field checklist", () => {
  const prompt = assembleOnboardingReplyPrompt(
    {
      transcript: createTranscript()
    },
    {
      maxPromptChars: 6000,
      maxTranscriptMessages: 3
    }
  );

  assert.equal(prompt.transcriptMessageCount, 3);
  assert.equal(prompt.messages[0]?.content.includes("remaining profile fields"), true);
  assert.equal(prompt.messages[0]?.content.includes("Salut, cu cine facem planificarea meselor?"), false);
  assert.equal(prompt.messages[0]?.content.includes("Suntem doi adulți și un copil."), true);
  assert.equal(prompt.messages[0]?.content.includes("Fără gluten și vrem rețete rapide."), true);
});

test("selectClaudeModel keeps short onboarding turns on Haiku and routes structured extraction to Sonnet", () => {
  const routing = createAnthropicTestConfig().routing;

  assert.deepEqual(
    selectClaudeModel(routing, {
      task: "onboarding-turn",
      transcriptMessageCount: 2,
      promptChars: 300
    }),
    {
      tier: "haiku",
      reason: "Short interactive onboarding turns stay on Haiku to minimize cost."
    }
  );
  assert.equal(
    selectClaudeModel(routing, {
      task: "onboarding-turn",
      transcriptMessageCount: 5,
      promptChars: 300
    }).tier,
    "sonnet"
  );
  assert.equal(
    selectClaudeModel(routing, {
      task: "profile-structuring",
      transcriptMessageCount: 1,
      promptChars: 100
    }).tier,
    "sonnet"
  );
  assert.equal(
    selectClaudeModel(routing, {
      task: "meal-plan-generation",
      transcriptMessageCount: 0,
      promptChars: 100
    }).tier,
    "sonnet"
  );
  assert.equal(
    selectClaudeModel(routing, {
      task: "shopping-product-selection",
      transcriptMessageCount: 0,
      promptChars: 300
    }).tier,
    "haiku"
  );
});

test("createClaudeService parses shopping product selections and routes larger tie-breaker prompts to Sonnet", async () => {
  const calls: Array<{ model: string; system: string; content: string }> = [];
  const service = createClaudeService({
    config: createAnthropicTestConfig(),
    client: {
      async createMessage(request) {
        calls.push({
          model: request.model,
          system: request.system,
          content: request.messages[0]?.content ?? ""
        });

        return {
          id: "msg_shopping_1",
          model: request.model,
          text: JSON.stringify({
            selectedProductId: "product-2",
            reason: "The 500 g canned tomatoes best match the ingredient and required quantity."
          }),
          stopReason: "end_turn",
          usage: {
            inputTokens: 75,
            outputTokens: 22
          }
        };
      }
    }
  });

  const result = await service.selectShoppingProduct({
    ingredientName: "tomatoes",
    requiredQuantity: 1000,
    requiredUnit: "g",
    profile: {
      dietaryRestrictions: ["vegetarian"],
      allergies: {
        normalized: [],
        freeText: []
      },
      favoriteIngredients: ["tomatoes"],
      dislikedIngredients: [],
      cuisinePreferences: ["Mediterranean"],
      budgetBand: "medium"
    },
    candidates: [
      {
        id: "product-1",
        name: "Rosii cherry 250 g",
        price: 7.99,
        currency: "RON",
        unit: "250 g",
        category: "Legume",
        tags: [],
        availability: "in_stock",
        searchRank: 0
      },
      {
        id: "product-2",
        name: "Rosii cuburi 500 g",
        price: 8.49,
        currency: "RON",
        unit: "500 g",
        category: "Conserve",
        tags: [],
        availability: "in_stock",
        searchRank: 1
      }
    ]
  });

  assert.equal(calls[0]?.model, "claude-3-7-sonnet-latest");
  assert.equal(calls[0]?.system.includes("best Freshful catalog candidate"), true);
  assert.equal(calls[0]?.content.includes('"ingredientName":"tomatoes"'), true);
  assert.equal(result.selectedProductId, "product-2");
  assert.equal(result.parseFailureReason, null);
  assert.equal(result.usage.modelTier, "sonnet");
});

test("assembleShoppingProductSelectionPrompt includes ingredient, profile, and candidate constraints", () => {
  const prompt = assembleShoppingProductSelectionPrompt({
    ingredientName: "tomatoes",
    requiredQuantity: 1000,
    requiredUnit: "g",
    profile: {
      dietaryRestrictions: ["vegetarian"],
      allergies: {
        normalized: [],
        freeText: []
      },
      favoriteIngredients: ["tomatoes"],
      dislikedIngredients: ["celery"],
      cuisinePreferences: ["Romanian"],
      budgetBand: "medium"
    },
    candidates: [
      {
        id: "product-1",
        name: "Rosii cuburi 500 g",
        price: 8.49,
        currency: "RON",
        unit: "500 g",
        category: "Conserve",
        tags: ["romanesc"],
        availability: "in_stock",
        searchRank: 0
      }
    ]
  });

  assert.equal(prompt.system.includes("selectedProductId"), true);
  assert.equal(prompt.messages[0]?.content.includes('"ingredientName":"tomatoes"'), true);
  assert.equal(prompt.messages[0]?.content.includes('"id":"product-1"'), true);
});

test("assembleMealPlanPrompt embeds request constraints and profile context", () => {
  const prompt = assembleMealPlanPrompt({
    options: {
      durationDays: 3,
      mealSlots: ["breakfast", "dinner"],
      startDate: "2026-03-23"
    },
    profile: {
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
      cuisinePreferences: ["Romanian"],
      favoriteIngredients: ["tomatoes"],
      dislikedIngredients: ["celery"],
      budgetBand: "medium",
      maxPrepTimeMinutes: 30,
      cookingSkill: "intermediate"
    }
  });

  assert.equal(prompt.system.includes("Return valid JSON only"), true);
  assert.equal(prompt.system.includes("include each requested meal slot exactly once"), true);
  assert.equal(prompt.messages[0]?.content.includes('"durationDays":3'), true);
  assert.equal(prompt.messages[0]?.content.includes('"mealSlots":["breakfast","dinner"]'), true);
  assert.equal(prompt.messages[0]?.content.includes('"dietaryRestrictions":["vegetarian"]'), true);
});

test("assembleProfileExtractionPrompt forbids invented allergies and medical flags", () => {
  const prompt = assembleProfileExtractionPrompt(
    {
      transcript: createTranscript()
    },
    {
      maxPromptChars: 6000,
      maxTranscriptMessages: 3
    }
  );

  assert.equal(prompt.system.includes("Never invent, infer, or default unknown profile values."), true);
  assert.equal(prompt.system.includes("leave them unknown instead of outputting empty arrays or false values"), true);
  assert.equal(prompt.messages[0]?.content.includes('"status":"incomplete"'), true);
  assert.equal(prompt.messages[0]?.content.includes("omit unknown fields from knownProfile instead of guessing them"), true);
});

test("parseStructuredResponse extracts valid fenced JSON and reports fallback details for invalid payloads", () => {
  const parsed = parseStructuredResponse(
    [
      "Here is the structured profile:",
      "```json",
      '{"householdType":"family","numChildren":1,"dietaryRestrictions":["gluten-free"],"allergies":{"normalized":["gluten"],"freeText":[]},"medicalFlags":{"diabetes":false,"hypertension":false},"goals":["maintenance"],"cuisinePreferences":["Romanian"],"favoriteIngredients":["chicken"],"dislikedIngredients":["olives"],"budgetBand":"medium","maxPrepTimeMinutes":30,"cookingSkill":"intermediate"}',
      "```"
    ].join("\n"),
    profileWriteSchema
  );

  assert.equal(parsed.data?.householdType, "family");
  assert.equal(parsed.failureReason, null);

  const invalid = parseStructuredResponse(
    "I could not create valid JSON for this transcript yet.",
    profileWriteSchema
  );

  assert.equal(invalid.data, null);
  assert.equal(invalid.failureReason, "missing_json");
});

test("partialProfileWriteSchema accepts partial nested profile data and rejects invalid enum or shape values", () => {
  const valid = partialProfileWriteSchema.safeParse({
    householdType: "family",
    medicalFlags: {
      diabetes: true
    },
    allergies: {
      normalized: ["gluten"]
    }
  });

  assert.equal(valid.success, true);

  const invalidEnum = partialProfileWriteSchema.safeParse({
    householdType: "roommates"
  });

  assert.equal(invalidEnum.success, false);

  const invalidShape = partialProfileWriteSchema.safeParse({
    medicalFlags: {
      diabetes: "yes"
    }
  });

  assert.equal(invalidShape.success, false);
});

test("createClaudeService falls back to raw text when structured parsing fails", async () => {
  const calls: Array<{ model: string; system: string; content: string }> = [];
  const client: ClaudeClient = {
    async createMessage(request) {
      calls.push({
        model: request.model,
        system: request.system,
        content: request.messages[0]?.content ?? ""
      });

      return {
        id: "msg_123",
        model: request.model,
        text: "I still need a clearer allergy answer before I can produce valid JSON.",
        stopReason: "end_turn",
        usage: {
          inputTokens: 111,
          outputTokens: 27
        }
      };
    }
  };
  const service = createClaudeService({
    config: createAnthropicTestConfig(),
    client
  });

  const result = await service.extractProfile({
    transcript: createTranscript()
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.model, "claude-3-7-sonnet-latest");
  assert.equal(calls[0]?.system.includes("Return valid JSON only"), true);
  assert.equal(result.profile, null);
  assert.deepEqual(result.missingFields, []);
  assert.equal(result.rawText, "I still need a clearer allergy answer before I can produce valid JSON.");
  assert.equal(result.parseFailureReason, "missing_json");
  assert.equal(result.usage.modelTier, "sonnet");
});

test("createClaudeService preserves incomplete profile extraction output instead of fabricating missing values", async () => {
  const service = createClaudeService({
    config: createAnthropicTestConfig(),
    client: {
      async createMessage(request) {
        return {
          id: "msg_456",
          model: request.model,
          text: JSON.stringify({
            status: "incomplete",
            knownProfile: {
              householdType: "family",
              dietaryRestrictions: ["gluten-free"],
              allergies: {
                normalized: ["gluten"],
                freeText: []
              }
            },
            missingFields: ["numChildren", "medicalFlags"]
          }),
          stopReason: "end_turn",
          usage: {
            inputTokens: 122,
            outputTokens: 31
          }
        };
      }
    }
  });

  const result = await service.extractProfile({
    transcript: createTranscript()
  });

  assert.deepEqual(result.profile, {
    householdType: "family",
    dietaryRestrictions: ["gluten-free"],
    allergies: {
      normalized: ["gluten"],
      freeText: []
    }
  });
  assert.deepEqual(result.missingFields, ["numChildren", "medicalFlags"]);
  assert.equal(result.parseFailureReason, "incomplete");
  assert.equal(result.rawText.includes('"status":"incomplete"'), true);
});

test("createClaudeService rejects invalid partial profile data in incomplete extraction payloads", async () => {
  const service = createClaudeService({
    config: createAnthropicTestConfig(),
    client: {
      async createMessage(request) {
        return {
          id: "msg_457",
          model: request.model,
          text: JSON.stringify({
            status: "incomplete",
            knownProfile: {
              householdType: "roommates",
              medicalFlags: {
                diabetes: "yes"
              }
            },
            missingFields: ["numChildren"]
          }),
          stopReason: "end_turn",
          usage: {
            inputTokens: 122,
            outputTokens: 31
          }
        };
      }
    }
  });

  const result = await service.extractProfile({
    transcript: createTranscript()
  });

  assert.equal(result.profile, null);
  assert.deepEqual(result.missingFields, []);
  assert.equal(result.parseFailureReason, "schema_mismatch");
});

test("createClaudeService parses structured meal plan output and routes plan generation to Sonnet", async () => {
  const calls: Array<{ model: string; system: string; content: string }> = [];
  const service = createClaudeService({
    config: createAnthropicTestConfig(),
    client: {
      async createMessage(request) {
        calls.push({
          model: request.model,
          system: request.system,
          content: request.messages[0]?.content ?? ""
        });

        return {
          id: "msg_plan_1",
          model: request.model,
          text: JSON.stringify({
            title: "3 Day Vegetarian Family Plan",
            durationDays: 3,
            recipes: [
              {
                id: "recipe-1",
                title: "Tomato Oat Breakfast Bowl",
                ingredients: [
                  {
                    name: "oats",
                    quantity: 80,
                    unit: "g"
                  }
                ],
                instructions: ["Cook oats", "Top and serve"],
                tags: ["vegetarian"],
                estimatedMacros: {
                  calories: 420,
                  proteinGrams: 14,
                  carbsGrams: 55,
                  fatGrams: 12
                }
              }
            ],
            days: [
              {
                dayNumber: 1,
                meals: [
                  {
                    slot: "breakfast",
                    recipeId: "recipe-1"
                  }
                ]
              },
              {
                dayNumber: 2,
                meals: [
                  {
                    slot: "breakfast",
                    recipeId: "recipe-1"
                  }
                ]
              },
              {
                dayNumber: 3,
                meals: [
                  {
                    slot: "breakfast",
                    recipeId: "recipe-1"
                  }
                ]
              }
            ],
            metadata: {
              tags: ["family", "vegetarian"],
              estimatedMacros: {
                calories: 1260,
                proteinGrams: 42,
                carbsGrams: 165,
                fatGrams: 36
              }
            }
          }),
          stopReason: "end_turn",
          usage: {
            inputTokens: 210,
            outputTokens: 320
          }
        };
      }
    }
  });

  const result = await service.createMealPlan({
    options: {
      durationDays: 3,
      mealSlots: ["breakfast"]
    },
    profile: {
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
      dislikedIngredients: ["celery"],
      budgetBand: "medium",
      maxPrepTimeMinutes: 30,
      cookingSkill: "intermediate"
    }
  });

  assert.equal(calls[0]?.model, "claude-3-7-sonnet-latest");
  assert.equal(calls[0]?.system.includes("structured meal plans"), true);
  assert.equal(calls[0]?.content.includes('"mealSlots":["breakfast"]'), true);
  assert.equal(result.plan?.durationDays, 3);
  assert.equal(result.parseFailureReason, null);
  assert.equal(result.usage.modelTier, "sonnet");
});

test("createClaudeService rejects oversized prompts before calling Anthropic", async () => {
  let callCount = 0;
  const service = createClaudeService({
    config: {
      ...createAnthropicTestConfig(),
      usage: {
        ...createAnthropicTestConfig().usage,
        maxPromptChars: 120
      }
    },
    client: {
      async createMessage() {
        callCount += 1;

        return {
          id: "msg_789",
          model: "claude-3-7-sonnet-latest",
          text: "{}",
          stopReason: "end_turn",
          usage: null
        };
      }
    }
  });

  await assert.rejects(
    async () => {
      await service.extractProfile({
        transcript: [
          {
            id: "large-1",
            role: "user",
            content: "a".repeat(500),
            createdAt: "2026-03-22T10:01:00.000Z"
          }
        ]
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof ClaudeUsageLimitError);
      assert.equal(error.message.includes("configured maximum size"), true);

      return true;
    }
  );

  assert.equal(callCount, 0);
});

test("createAnthropicClient maps 429 responses to retryable upstream errors", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({
      error: {
        message: "Rate limit exceeded."
      }
    }), {
      status: 429,
      headers: {
        "content-type": "application/json"
      }
    })) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const client = createAnthropicClient({
    apiKey: "test-anthropic-key",
    baseUrl: "https://api.anthropic.com",
    apiVersion: "2023-06-01",
    requestTimeoutMs: 100
  });

  await assert.rejects(
    async () => {
      await client.createMessage({
        model: "claude-3-5-haiku-latest",
        system: "test",
        maxTokens: 100,
        messages: [
          {
            role: "user",
            content: "Hello"
          }
        ]
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof ClaudeUpstreamError);
      assert.equal(error.statusCode, 429);
      assert.equal(error.retryable, true);
      assert.equal(error.message, "Rate limit exceeded.");

      return true;
    }
  );
});