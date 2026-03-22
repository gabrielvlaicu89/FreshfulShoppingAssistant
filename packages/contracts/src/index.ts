import { z } from "zod";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const isoDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const trimmedStringSchema = z.string().trim().min(1);
const identifierSchema = trimmedStringSchema;
const isoDateSchema = z.string().regex(isoDatePattern, "Expected YYYY-MM-DD date format.");
const isoDateTimeSchema = z.string().regex(isoDateTimePattern, "Expected UTC ISO datetime format.");
const nonNegativeNumberSchema = z.number().finite().min(0);
const positiveNumberSchema = z.number().finite().positive();

function findDuplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }

    seen.add(value);
  }

  return [...duplicates];
}

export const workspaceNameValues = ["@freshful/api", "@freshful/mobile", "@freshful/contracts"] as const;
export const workspacePathValues = ["apps/api", "apps/mobile", "packages/contracts"] as const;
export const householdTypeValues = ["single", "couple", "family"] as const;
export const dietaryRestrictionValues = ["vegetarian", "vegan", "gluten-free"] as const;
export const allergyValues = ["gluten", "dairy", "eggs", "peanuts", "tree-nuts", "soy", "fish", "shellfish", "sesame"] as const;
export const healthGoalValues = ["weight_loss", "maintenance", "muscle_gain"] as const;
export const budgetBandValues = ["low", "medium", "high"] as const;
export const cookingSkillValues = ["beginner", "intermediate", "advanced"] as const;
export const onboardingRoleValues = ["system", "assistant", "user"] as const;
export const mealSlotValues = ["breakfast", "lunch", "dinner", "snack"] as const;
export const freshfulAvailabilityValues = ["in_stock", "low_stock", "out_of_stock", "unknown"] as const;
export const shoppingListStatusValues = ["draft", "final"] as const;
export const shoppingListItemStatusValues = ["pending", "bought", "replaced"] as const;

export const workspaceDescriptorSchema = z
  .object({
    name: z.enum(workspaceNameValues),
    path: z.enum(workspacePathValues)
  })
  .strict();

export type WorkspaceDescriptor = z.infer<typeof workspaceDescriptorSchema>;

export const workspaceCatalogSchema = z.array(workspaceDescriptorSchema);

export const workspaceCatalog: WorkspaceDescriptor[] = workspaceCatalogSchema.parse([
  {
    name: "@freshful/api",
    path: "apps/api"
  },
  {
    name: "@freshful/mobile",
    path: "apps/mobile"
  },
  {
    name: "@freshful/contracts",
    path: "packages/contracts"
  }
]);

export const allergiesSchema = z
  .object({
    normalized: z.array(z.enum(allergyValues)),
    freeText: z.array(trimmedStringSchema)
  })
  .strict();

export type Allergies = z.infer<typeof allergiesSchema>;

export const medicalFlagsSchema = z
  .object({
    diabetes: z.boolean(),
    hypertension: z.boolean()
  })
  .strict();

export type MedicalFlags = z.infer<typeof medicalFlagsSchema>;

export const householdProfileSchema = z
  .object({
    userId: identifierSchema,
    householdType: z.enum(householdTypeValues),
    numChildren: z.number().int().min(0),
    dietaryRestrictions: z.array(z.enum(dietaryRestrictionValues)),
    allergies: allergiesSchema,
    medicalFlags: medicalFlagsSchema,
    goals: z.array(z.enum(healthGoalValues)),
    cuisinePreferences: z.array(trimmedStringSchema),
    favoriteIngredients: z.array(trimmedStringSchema),
    dislikedIngredients: z.array(trimmedStringSchema),
    budgetBand: z.enum(budgetBandValues),
    maxPrepTimeMinutes: z.number().int().positive(),
    cookingSkill: z.enum(cookingSkillValues),
    rawChatHistoryId: identifierSchema
  })
  .strict();

export type HouseholdProfile = z.infer<typeof householdProfileSchema>;

export const onboardingChatMessageSchema = z
  .object({
    id: identifierSchema,
    role: z.enum(onboardingRoleValues),
    content: trimmedStringSchema,
    createdAt: isoDateTimeSchema
  })
  .strict();

export type OnboardingChatMessage = z.infer<typeof onboardingChatMessageSchema>;

export const onboardingTranscriptSchema = z
  .object({
    id: identifierSchema,
    householdProfileId: identifierSchema.optional(),
    messages: z.array(onboardingChatMessageSchema).min(1)
  })
  .strict();

export type OnboardingTranscript = z.infer<typeof onboardingTranscriptSchema>;

export const macroEstimateSchema = z
  .object({
    calories: nonNegativeNumberSchema,
    proteinGrams: nonNegativeNumberSchema,
    carbsGrams: nonNegativeNumberSchema,
    fatGrams: nonNegativeNumberSchema
  })
  .strict();

export type MacroEstimate = z.infer<typeof macroEstimateSchema>;

export const recipeIngredientSchema = z
  .object({
    name: trimmedStringSchema,
    quantity: positiveNumberSchema,
    unit: trimmedStringSchema
  })
  .strict();

export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;

export const recipeSchema = z
  .object({
    id: identifierSchema,
    title: trimmedStringSchema,
    ingredients: z.array(recipeIngredientSchema).min(1),
    instructions: z.array(trimmedStringSchema).min(1),
    tags: z.array(trimmedStringSchema),
    estimatedMacros: macroEstimateSchema
  })
  .strict();

export type Recipe = z.infer<typeof recipeSchema>;

export const mealPlanMealSchema = z
  .object({
    slot: z.enum(mealSlotValues),
    recipeId: identifierSchema
  })
  .strict();

export type MealPlanMeal = z.infer<typeof mealPlanMealSchema>;

export const mealPlanDaySchema = z
  .object({
    dayNumber: z.number().int().min(1).max(7),
    meals: z.array(mealPlanMealSchema).min(1)
  })
  .strict()
  .superRefine((value, context) => {
    const duplicateSlots = findDuplicateValues(value.meals.map((meal) => meal.slot));

    for (const duplicateSlot of duplicateSlots) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["meals"],
        message: `Duplicate meal slot '${duplicateSlot}' is not allowed within a single day.`
      });
    }
  });

export type MealPlanDay = z.infer<typeof mealPlanDaySchema>;

export const mealPlanMetadataSchema = z
  .object({
    tags: z.array(trimmedStringSchema),
    estimatedMacros: macroEstimateSchema
  })
  .strict();

export type MealPlanMetadata = z.infer<typeof mealPlanMetadataSchema>;

export const mealPlanTemplateSchema = z
  .object({
    id: identifierSchema,
    userId: identifierSchema,
    title: trimmedStringSchema,
    durationDays: z.number().int().min(1).max(7),
    recipes: z.array(recipeSchema).min(1),
    days: z.array(mealPlanDaySchema).min(1).max(7),
    metadata: mealPlanMetadataSchema
  })
  .strict()
  .superRefine((value, context) => {
    if (value.days.length !== value.durationDays) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["days"],
        message: "Meal plan day count must match durationDays."
      });
    }

    const duplicateDayNumbers = findDuplicateValues(value.days.map((day) => String(day.dayNumber)));

    for (const duplicateDayNumber of duplicateDayNumbers) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["days"],
        message: `Duplicate dayNumber '${duplicateDayNumber}' is not allowed.`
      });
    }

    const recipeIds = new Set(value.recipes.map((recipe) => recipe.id));

    value.days.forEach((day, dayIndex) => {
      day.meals.forEach((meal, mealIndex) => {
        if (!recipeIds.has(meal.recipeId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["days", dayIndex, "meals", mealIndex, "recipeId"],
            message: `Recipe '${meal.recipeId}' is not defined in recipes.`
          });
        }
      });
    });
  });

export type MealPlanTemplate = z.infer<typeof mealPlanTemplateSchema>;

export const mealPlanOverrideSchema = z
  .object({
    dayNumber: z.number().int().min(1).max(7),
    slot: z.enum(mealSlotValues),
    recipeId: identifierSchema.optional(),
    notes: trimmedStringSchema.optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.recipeId && !value.notes) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An override must include a recipeId or explanatory notes."
      });
    }
  });

export type MealPlanOverride = z.infer<typeof mealPlanOverrideSchema>;

export const mealPlanInstanceSchema = z
  .object({
    id: identifierSchema,
    templateId: identifierSchema,
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    overrides: z.array(mealPlanOverrideSchema)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.endDate < value.startDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "endDate must be on or after startDate."
      });
    }
  });

export type MealPlanInstance = z.infer<typeof mealPlanInstanceSchema>;

export const freshfulSearchFiltersSchema = z
  .object({
    category: trimmedStringSchema.optional(),
    brand: trimmedStringSchema.optional(),
    maxPriceRon: nonNegativeNumberSchema.optional()
  })
  .strict();

export type FreshfulSearchFilters = z.infer<typeof freshfulSearchFiltersSchema>;

export const freshfulSearchMetadataSchema = z
  .object({
    query: trimmedStringSchema,
    rank: z.number().int().min(0),
    matchedTerm: trimmedStringSchema.optional()
  })
  .strict();

export type FreshfulSearchMetadata = z.infer<typeof freshfulSearchMetadataSchema>;

export const freshfulProductSchema = z
  .object({
    id: identifierSchema,
    freshfulId: identifierSchema,
    name: trimmedStringSchema,
    price: nonNegativeNumberSchema,
    currency: z.literal("RON"),
    unit: trimmedStringSchema,
    category: trimmedStringSchema,
    tags: z.array(trimmedStringSchema),
    imageUrl: z.string().url(),
    lastSeenAt: isoDateTimeSchema,
    availability: z.enum(freshfulAvailabilityValues),
    searchMetadata: freshfulSearchMetadataSchema.optional()
  })
  .strict();

export type FreshfulProduct = z.infer<typeof freshfulProductSchema>;

export const shoppingListItemSchema = z
  .object({
    id: identifierSchema,
    listId: identifierSchema,
    ingredientName: trimmedStringSchema,
    requiredQuantity: positiveNumberSchema,
    requiredUnit: trimmedStringSchema,
    freshfulProductId: identifierSchema.nullable(),
    chosenQuantity: positiveNumberSchema.nullable(),
    chosenUnit: trimmedStringSchema.nullable(),
    estimatedPrice: nonNegativeNumberSchema.nullable(),
    category: trimmedStringSchema.nullable(),
    status: z.enum(shoppingListItemStatusValues),
    matchedProduct: freshfulProductSchema.nullable().optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.matchedProduct && value.freshfulProductId && value.matchedProduct.id !== value.freshfulProductId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["matchedProduct", "id"],
        message: "matchedProduct.id must align with freshfulProductId when both are present."
      });
    }
  });

export type ShoppingListItem = z.infer<typeof shoppingListItemSchema>;

export const shoppingListSchema = z
  .object({
    id: identifierSchema,
    userId: identifierSchema,
    planId: identifierSchema,
    createdAt: isoDateTimeSchema,
    totalEstimatedCost: nonNegativeNumberSchema,
    status: z.enum(shoppingListStatusValues),
    items: z.array(shoppingListItemSchema).min(1)
  })
  .strict();

export type ShoppingList = z.infer<typeof shoppingListSchema>;

export const errorIssueSchema = z
  .object({
    path: z.array(trimmedStringSchema).min(1),
    message: trimmedStringSchema
  })
  .strict();

export type ErrorIssue = z.infer<typeof errorIssueSchema>;

export const errorPayloadSchema = z
  .object({
    code: trimmedStringSchema,
    message: trimmedStringSchema,
    statusCode: z.number().int().min(400).max(599),
    requestId: identifierSchema.optional(),
    details: z.record(z.unknown()).optional(),
    issues: z.array(errorIssueSchema).optional()
  })
  .strict();

export type ErrorPayload = z.infer<typeof errorPayloadSchema>;

export const contractSchemas = {
  allergies: allergiesSchema,
  errorIssue: errorIssueSchema,
  errorPayload: errorPayloadSchema,
  freshfulProduct: freshfulProductSchema,
  freshfulSearchFilters: freshfulSearchFiltersSchema,
  freshfulSearchMetadata: freshfulSearchMetadataSchema,
  householdProfile: householdProfileSchema,
  macroEstimate: macroEstimateSchema,
  mealPlanDay: mealPlanDaySchema,
  mealPlanInstance: mealPlanInstanceSchema,
  mealPlanMeal: mealPlanMealSchema,
  mealPlanMetadata: mealPlanMetadataSchema,
  mealPlanOverride: mealPlanOverrideSchema,
  mealPlanTemplate: mealPlanTemplateSchema,
  medicalFlags: medicalFlagsSchema,
  onboardingChatMessage: onboardingChatMessageSchema,
  onboardingTranscript: onboardingTranscriptSchema,
  recipe: recipeSchema,
  recipeIngredient: recipeIngredientSchema,
  shoppingList: shoppingListSchema,
  shoppingListItem: shoppingListItemSchema,
  workspaceCatalog: workspaceCatalogSchema,
  workspaceDescriptor: workspaceDescriptorSchema
} as const;