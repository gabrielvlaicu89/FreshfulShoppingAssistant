import assert from "node:assert/strict";
import test from "node:test";

import type { FreshfulProduct, HouseholdProfile, MealPlanInstance, MealPlanTemplate, OnboardingTranscript } from "@freshful/contracts";

import { getDatabaseConfig } from "../apps/api/src/db/config.ts";
import { databaseTables, sensitiveTableColumns } from "../apps/api/src/db/schema.ts";
import { createMigratedTestDatabase } from "../apps/api/src/db/testing.ts";

const transcriptMessages: OnboardingTranscript["messages"] = [
  {
    id: "message-1",
    role: "assistant",
    content: "Tell me about your household.",
    createdAt: "2026-03-22T14:10:00Z"
  },
  {
    id: "message-2",
    role: "user",
    content: "We are a family of three and avoid peanuts.",
    createdAt: "2026-03-22T14:10:15Z"
  }
];

const profile: HouseholdProfile = {
  userId: "user-1",
  householdType: "family",
  numChildren: 1,
  dietaryRestrictions: ["vegetarian"],
  allergies: {
    normalized: ["peanuts"],
    freeText: ["cross-contamination"]
  },
  medicalFlags: {
    diabetes: false,
    hypertension: true
  },
  goals: ["maintenance"],
  cuisinePreferences: ["Romanian", "Mediterranean"],
  favoriteIngredients: ["tomatoes", "yogurt"],
  dislikedIngredients: ["celery"],
  budgetBand: "medium",
  maxPrepTimeMinutes: 35,
  cookingSkill: "intermediate",
  rawChatHistoryId: "transcript-1"
};

const mealPlanTemplate: MealPlanTemplate = {
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
      tags: ["vegetarian"],
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
};

const mealPlanInstance: MealPlanInstance = {
  id: "plan-instance-1",
  templateId: "plan-template-1",
  startDate: "2026-03-23",
  endDate: "2026-03-25",
  overrides: []
};

const product: FreshfulProduct = {
  id: "product-1",
  freshfulId: "freshful-1",
  name: "Freshful Organic Milk 1L",
  price: 9.25,
  currency: "RON",
  unit: "1 l",
  category: "Dairy",
  tags: ["organic"],
  imageUrl: "https://www.freshful.ro/products/milk-1.png",
  lastSeenAt: "2026-03-22T14:00:00Z",
  availability: "in_stock",
  searchMetadata: {
    query: "milk",
    rank: 0
  }
};

test("database config reads DATABASE_URL from environment overrides", () => {
  const config = getDatabaseConfig({
    DATABASE_URL: "postgres://freshful:freshful@localhost:5432/freshful_test"
  });

  assert.equal(config.DATABASE_URL, "postgres://freshful:freshful@localhost:5432/freshful_test");
});

test("generated migrations create the persistence tables and accept representative records", async () => {
  const database = await createMigratedTestDatabase();

  try {
    assert.ok(database.migrationFiles.length > 0, "Expected at least one generated migration file.");

    await database.db.insert(databaseTables.users).values({
      id: "user-1",
      googleSubject: "google-sub-1",
      email: "user@example.com",
      emailVerified: true,
      displayName: "Freshful User",
      photoUrl: "https://example.com/avatar.png",
      lastLoginAt: "2026-03-22T14:05:00Z"
    });

    await database.db.insert(databaseTables.onboardingTranscripts).values({
      id: "transcript-1",
      userId: "user-1",
      messages: transcriptMessages,
      containsSensitiveProfileSignals: true
    });

    await database.db.insert(databaseTables.householdProfiles).values({
      id: "profile-1",
      userId: profile.userId,
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
      rawChatHistoryId: profile.rawChatHistoryId,
      containsSensitiveHealthData: true
    });

    await database.db.insert(databaseTables.mealPlanTemplates).values({
      id: mealPlanTemplate.id,
      userId: mealPlanTemplate.userId,
      title: mealPlanTemplate.title,
      durationDays: mealPlanTemplate.durationDays,
      recipes: mealPlanTemplate.recipes,
      days: mealPlanTemplate.days,
      metadata: mealPlanTemplate.metadata
    });

    await database.db.insert(databaseTables.mealPlanInstances).values({
      id: mealPlanInstance.id,
      templateId: mealPlanInstance.templateId,
      userId: "user-1",
      startDate: mealPlanInstance.startDate,
      endDate: mealPlanInstance.endDate,
      overrides: mealPlanInstance.overrides
    });

    await database.db.insert(databaseTables.freshfulProducts).values({
      id: product.id,
      freshfulId: product.freshfulId,
      name: product.name,
      price: product.price,
      currency: product.currency,
      unit: product.unit,
      category: product.category,
      tags: product.tags,
      imageUrl: product.imageUrl,
      lastSeenAt: product.lastSeenAt,
      availability: product.availability,
      searchMetadata: product.searchMetadata
    });

    await database.db.insert(databaseTables.shoppingLists).values({
      id: "list-1",
      userId: "user-1",
      planId: mealPlanInstance.id,
      totalEstimatedCost: 129.5,
      status: "draft"
    });

    await database.db.insert(databaseTables.shoppingListItems).values({
      id: "item-1",
      listId: "list-1",
      ingredientName: "milk",
      requiredQuantity: 2,
      requiredUnit: "l",
      freshfulProductId: product.id,
      chosenQuantity: 2,
      chosenUnit: "l",
      estimatedPrice: 18.5,
      category: "Dairy",
      status: "pending"
    });

    await database.db.insert(databaseTables.cachedSearchResults).values({
      id: "cache-1",
      cacheKey: "milk::{}",
      query: "milk",
      filters: null,
      productIds: [product.id],
      fetchedAt: "2026-03-22T14:00:00Z",
      expiresAt: "2026-03-22T15:00:00Z",
      responseHash: "hash-1"
    });

    const [storedProfile] = await database.db.select().from(databaseTables.householdProfiles);
    const [storedList] = await database.db.select().from(databaseTables.shoppingLists);
    const [storedCacheEntry] = await database.db.select().from(databaseTables.cachedSearchResults);

    assert.equal(storedProfile.rawChatHistoryId, "transcript-1");
    assert.deepEqual(storedProfile.medicalFlags, profile.medicalFlags);
    assert.equal(storedList.planId, mealPlanInstance.id);
    assert.deepEqual(storedCacheEntry.productIds, [product.id]);
  } finally {
    await database.client.close();
  }
});

test("generated migrations reject unlinked profiles and originless shopping lists", async () => {
  const database = await createMigratedTestDatabase();

  try {
    await database.db.insert(databaseTables.users).values({
      id: "user-1",
      googleSubject: "google-sub-1",
      email: "user@example.com",
      emailVerified: true
    });

    await database.db.insert(databaseTables.onboardingTranscripts).values({
      id: "transcript-1",
      userId: "user-1",
      messages: transcriptMessages,
      containsSensitiveProfileSignals: true
    });

    await database.db.insert(databaseTables.mealPlanTemplates).values({
      id: mealPlanTemplate.id,
      userId: mealPlanTemplate.userId,
      title: mealPlanTemplate.title,
      durationDays: mealPlanTemplate.durationDays,
      recipes: mealPlanTemplate.recipes,
      days: mealPlanTemplate.days,
      metadata: mealPlanTemplate.metadata
    });

    await database.db.insert(databaseTables.mealPlanInstances).values({
      id: mealPlanInstance.id,
      templateId: mealPlanInstance.templateId,
      userId: "user-1",
      startDate: mealPlanInstance.startDate,
      endDate: mealPlanInstance.endDate,
      overrides: mealPlanInstance.overrides
    });

    await assert.rejects(
      database.db.insert(databaseTables.householdProfiles).values({
        id: "profile-missing-transcript-link",
        userId: profile.userId,
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
        containsSensitiveHealthData: true
      } as never)
    );

    await assert.rejects(
      database.db.insert(databaseTables.householdProfiles).values({
        id: "profile-bad-transcript-link",
        userId: profile.userId,
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
        rawChatHistoryId: "transcript-missing",
        containsSensitiveHealthData: true
      })
    );

    await assert.rejects(
      database.db.insert(databaseTables.shoppingLists).values({
        id: "list-missing-plan-origin",
        userId: "user-1",
        totalEstimatedCost: 129.5,
        status: "draft"
      } as never)
    );

    await assert.rejects(
      database.db.insert(databaseTables.shoppingLists).values({
        id: "list-bad-plan-origin",
        userId: "user-1",
        planId: "plan-instance-missing",
        totalEstimatedCost: 129.5,
        status: "draft"
      })
    );
  } finally {
    await database.client.close();
  }
});

test("generated migrations reject cross-user transcript, template, and shopping list ownership mismatches", async () => {
  const database = await createMigratedTestDatabase();

  try {
    await database.db.insert(databaseTables.users).values([
      {
        id: "user-1",
        googleSubject: "google-sub-1",
        email: "user-1@example.com",
        emailVerified: true
      },
      {
        id: "user-2",
        googleSubject: "google-sub-2",
        email: "user-2@example.com",
        emailVerified: true
      }
    ]);

    await database.db.insert(databaseTables.onboardingTranscripts).values([
      {
        id: "transcript-1",
        userId: "user-1",
        messages: transcriptMessages,
        containsSensitiveProfileSignals: true
      },
      {
        id: "transcript-2",
        userId: "user-2",
        messages: transcriptMessages,
        containsSensitiveProfileSignals: true
      }
    ]);

    await database.db.insert(databaseTables.mealPlanTemplates).values([
      {
        id: mealPlanTemplate.id,
        userId: "user-1",
        title: mealPlanTemplate.title,
        durationDays: mealPlanTemplate.durationDays,
        recipes: mealPlanTemplate.recipes,
        days: mealPlanTemplate.days,
        metadata: mealPlanTemplate.metadata
      },
      {
        id: "plan-template-2",
        userId: "user-2",
        title: "User 2 dinners",
        durationDays: mealPlanTemplate.durationDays,
        recipes: mealPlanTemplate.recipes,
        days: mealPlanTemplate.days,
        metadata: mealPlanTemplate.metadata
      }
    ]);

    await database.db.insert(databaseTables.mealPlanInstances).values([
      {
        id: mealPlanInstance.id,
        templateId: mealPlanInstance.templateId,
        userId: "user-1",
        startDate: mealPlanInstance.startDate,
        endDate: mealPlanInstance.endDate,
        overrides: mealPlanInstance.overrides
      },
      {
        id: "plan-instance-2",
        templateId: "plan-template-2",
        userId: "user-2",
        startDate: mealPlanInstance.startDate,
        endDate: mealPlanInstance.endDate,
        overrides: mealPlanInstance.overrides
      }
    ]);

    await assert.rejects(
      database.db.insert(databaseTables.householdProfiles).values({
        id: "profile-cross-user-transcript-link",
        userId: "user-1",
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
        rawChatHistoryId: "transcript-2",
        containsSensitiveHealthData: true
      })
    );

    await assert.rejects(
      database.db.insert(databaseTables.mealPlanInstances).values({
        id: "plan-instance-cross-user-template-link",
        templateId: "plan-template-2",
        userId: "user-1",
        startDate: mealPlanInstance.startDate,
        endDate: mealPlanInstance.endDate,
        overrides: mealPlanInstance.overrides
      })
    );

    await assert.rejects(
      database.db.insert(databaseTables.shoppingLists).values({
        id: "shopping-list-cross-user-plan-link",
        userId: "user-1",
        planId: "plan-instance-2",
        totalEstimatedCost: 129.5,
        status: "draft"
      })
    );
  } finally {
    await database.client.close();
  }
});

test("sensitive columns stay explicit in the persistence metadata", () => {
  assert.deepEqual(sensitiveTableColumns.users, ["email"]);
  assert.deepEqual(sensitiveTableColumns.householdProfiles, [
    "dietaryRestrictions",
    "allergies",
    "medicalFlags",
    "goals",
    "favoriteIngredients",
    "dislikedIngredients",
    "rawChatHistoryId"
  ]);
  assert.ok(sensitiveTableColumns.onboardingTranscripts.includes("messages"));
});