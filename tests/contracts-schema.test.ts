import assert from "node:assert/strict";
import test from "node:test";

import {
  errorPayloadSchema,
  householdProfileSchema,
  mealPlanTemplateSchema,
  onboardingTranscriptSchema,
  shoppingListSchema
} from "@freshful/contracts";

test("householdProfileSchema accepts the onboarding profile fields and rejects extras", () => {
  const result = householdProfileSchema.safeParse({
    userId: "user-1",
    householdType: "family",
    numChildren: 2,
    dietaryRestrictions: ["vegetarian"],
    allergies: {
      normalized: ["peanuts"],
      freeText: ["must avoid cross-contamination"]
    },
    medicalFlags: {
      diabetes: false,
      hypertension: true
    },
    goals: ["maintenance"],
    cuisinePreferences: ["Romanian", "Mediterranean"],
    favoriteIngredients: ["tomatoes", "feta"],
    dislikedIngredients: ["cilantro"],
    budgetBand: "medium",
    maxPrepTimeMinutes: 30,
    cookingSkill: "intermediate",
    rawChatHistoryId: "transcript-1"
  });

  assert.equal(result.success, true);

  const missingRequiredFields = householdProfileSchema.safeParse({
    userId: "user-1",
    householdType: "family",
    numChildren: 2,
    dietaryRestrictions: [],
    allergies: {
      normalized: [],
      freeText: []
    },
    medicalFlags: {
      diabetes: false,
      hypertension: false
    },
    goals: [],
    cuisinePreferences: [],
    budgetBand: "low",
    cookingSkill: "beginner",
    rawChatHistoryId: "transcript-1"
  });

  assert.equal(missingRequiredFields.success, false);

  const invalidPrepTime = householdProfileSchema.safeParse({
    userId: "user-1",
    householdType: "family",
    numChildren: 2,
    dietaryRestrictions: [],
    allergies: {
      normalized: [],
      freeText: []
    },
    medicalFlags: {
      diabetes: false,
      hypertension: false
    },
    goals: [],
    cuisinePreferences: [],
    favoriteIngredients: [],
    dislikedIngredients: [],
    budgetBand: "low",
    maxPrepTimeMinutes: 0,
    cookingSkill: "beginner",
    rawChatHistoryId: "transcript-1"
  });

  assert.equal(invalidPrepTime.success, false);
});

test("onboardingTranscriptSchema requires well-formed chat messages", () => {
  const result = onboardingTranscriptSchema.safeParse({
    id: "transcript-1",
    householdProfileId: "profile-1",
    messages: [
      {
        id: "message-1",
        role: "assistant",
        content: "Tell me about your household.",
        createdAt: "2026-03-22T13:40:00Z"
      },
      {
        id: "message-2",
        role: "user",
        content: "We are a family of four.",
        createdAt: "2026-03-22T13:40:12Z"
      }
    ]
  });

  assert.equal(result.success, true);

  const invalidRole = onboardingTranscriptSchema.safeParse({
    id: "transcript-1",
    messages: [
      {
        id: "message-1",
        role: "planner",
        content: "Invalid role",
        createdAt: "2026-03-22T13:40:00Z"
      }
    ]
  });

  assert.equal(invalidRole.success, false);
});

test("mealPlanTemplateSchema enforces duration and recipe linkage", () => {
  const validPlan = mealPlanTemplateSchema.safeParse({
    id: "plan-template-1",
    userId: "user-1",
    title: "3 day family dinners",
    durationDays: 3,
    recipes: [
      {
        id: "recipe-1",
        title: "Vegetable pasta",
        ingredients: [
          {
            name: "pasta",
            quantity: 500,
            unit: "g"
          }
        ],
        instructions: ["Boil pasta", "Mix with vegetables"],
        tags: ["vegetarian", "quick"],
        estimatedMacros: {
          calories: 620,
          proteinGrams: 18,
          carbsGrams: 90,
          fatGrams: 19
        }
      }
    ],
    days: [
      { dayNumber: 1, meals: [{ slot: "dinner", recipeId: "recipe-1" }] },
      { dayNumber: 2, meals: [{ slot: "dinner", recipeId: "recipe-1" }] },
      { dayNumber: 3, meals: [{ slot: "dinner", recipeId: "recipe-1" }] }
    ],
    metadata: {
      tags: ["family"],
      estimatedMacros: {
        calories: 1860,
        proteinGrams: 54,
        carbsGrams: 270,
        fatGrams: 57
      }
    }
  });

  assert.equal(validPlan.success, true);

  const invalidPlan = mealPlanTemplateSchema.safeParse({
    id: "plan-template-1",
    userId: "user-1",
    title: "broken plan",
    durationDays: 2,
    recipes: [
      {
        id: "recipe-1",
        title: "Vegetable pasta",
        ingredients: [
          {
            name: "pasta",
            quantity: 500,
            unit: "g"
          }
        ],
        instructions: ["Boil pasta"],
        tags: [],
        estimatedMacros: {
          calories: 620,
          proteinGrams: 18,
          carbsGrams: 90,
          fatGrams: 19
        }
      }
    ],
    days: [
      { dayNumber: 1, meals: [{ slot: "dinner", recipeId: "recipe-1" }] },
      { dayNumber: 2, meals: [{ slot: "dinner", recipeId: "recipe-missing" }] },
      { dayNumber: 3, meals: [{ slot: "dinner", recipeId: "recipe-1" }] }
    ],
    metadata: {
      tags: [],
      estimatedMacros: {
        calories: 1240,
        proteinGrams: 36,
        carbsGrams: 180,
        fatGrams: 38
      }
    }
  });

  assert.equal(invalidPlan.success, false);
});

test("shoppingListSchema and errorPayloadSchema cover product linkage and service errors", () => {
  const shoppingListResult = shoppingListSchema.safeParse({
    id: "list-1",
    userId: "user-1",
    planId: "plan-instance-1",
    createdAt: "2026-03-22T14:00:00Z",
    totalEstimatedCost: 129.5,
    status: "draft",
    items: [
      {
        id: "item-1",
        listId: "list-1",
        ingredientName: "milk",
        requiredQuantity: 2,
        requiredUnit: "l",
        freshfulProductId: "product-1",
        chosenQuantity: 2,
        chosenUnit: "l",
        estimatedPrice: 18.5,
        category: "Dairy",
        status: "pending",
        matchedProduct: {
          id: "product-1",
          freshfulId: "freshful-1",
          name: "Freshful Organic Milk 1L",
          price: 9.25,
          currency: "RON",
          unit: "1 l",
          category: "Dairy",
          tags: ["organic"],
          imageUrl: "https://www.freshful.ro/products/milk-1.png",
          lastSeenAt: "2026-03-22T13:55:00Z",
          availability: "in_stock",
          searchMetadata: {
            query: "milk",
            rank: 0
          }
        }
      }
    ]
  });

  assert.equal(shoppingListResult.success, true);

  const errorResult = errorPayloadSchema.safeParse({
    code: "freshful.search_failed",
    message: "Freshful search request failed.",
    statusCode: 502,
    requestId: "request-1",
    issues: [
      {
        path: ["shoppingList", "items", "0"],
        message: "No product candidates were available."
      }
    ]
  });

  assert.equal(errorResult.success, true);
});