import type {
  FreshfulProduct,
  FreshfulSearchFilters,
  HouseholdProfile,
  MealPlanInstance,
  MealPlanTemplate,
  OnboardingTranscript
} from "@freshful/contracts";
import {
  budgetBandValues,
  cookingSkillValues,
  freshfulAvailabilityValues,
  householdTypeValues,
  shoppingListItemStatusValues,
  shoppingListStatusValues
} from "@freshful/contracts";
import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex
} from "drizzle-orm/pg-core";

const timestampColumns = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull()
};

export const householdTypeEnum = pgEnum("household_type", householdTypeValues);
export const budgetBandEnum = pgEnum("budget_band", budgetBandValues);
export const cookingSkillEnum = pgEnum("cooking_skill", cookingSkillValues);
export const productAvailabilityEnum = pgEnum("product_availability", freshfulAvailabilityValues);
export const shoppingListStatusEnum = pgEnum("shopping_list_status", shoppingListStatusValues);
export const shoppingListItemStatusEnum = pgEnum("shopping_list_item_status", shoppingListItemStatusValues);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    googleSubject: text("google_subject").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    displayName: text("display_name"),
    photoUrl: text("photo_url"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "string" }),
    ...timestampColumns
  },
  (table) => ({
    googleSubjectUniqueIndex: uniqueIndex("users_google_subject_idx").on(table.googleSubject),
    emailUniqueIndex: uniqueIndex("users_email_idx").on(table.email)
  })
);

export const onboardingTranscripts = pgTable(
  "onboarding_transcripts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    householdProfileId: text("household_profile_id"),
    messages: jsonb("messages").$type<OnboardingTranscript["messages"]>().notNull(),
    containsSensitiveProfileSignals: boolean("contains_sensitive_profile_signals").notNull().default(true),
    ...timestampColumns
  },
  (table) => ({
    userOwnedTranscriptUniqueConstraint: unique("onboarding_transcripts_user_id_id_key").on(table.userId, table.id),
    userIdIndex: index("onboarding_transcripts_user_id_idx").on(table.userId)
  })
);

export const householdProfiles = pgTable(
  "household_profiles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    householdType: householdTypeEnum("household_type").notNull(),
    numChildren: integer("num_children").notNull(),
    dietaryRestrictions: jsonb("dietary_restrictions").$type<HouseholdProfile["dietaryRestrictions"]>().notNull(),
    allergies: jsonb("allergies").$type<HouseholdProfile["allergies"]>().notNull(),
    medicalFlags: jsonb("medical_flags").$type<HouseholdProfile["medicalFlags"]>().notNull(),
    goals: jsonb("goals").$type<HouseholdProfile["goals"]>().notNull(),
    cuisinePreferences: jsonb("cuisine_preferences").$type<HouseholdProfile["cuisinePreferences"]>().notNull(),
    favoriteIngredients: jsonb("favorite_ingredients").$type<HouseholdProfile["favoriteIngredients"]>().notNull(),
    dislikedIngredients: jsonb("disliked_ingredients").$type<HouseholdProfile["dislikedIngredients"]>().notNull(),
    budgetBand: budgetBandEnum("budget_band").notNull(),
    maxPrepTimeMinutes: integer("max_prep_time_minutes").notNull(),
    cookingSkill: cookingSkillEnum("cooking_skill").notNull(),
    rawChatHistoryId: text("raw_chat_history_id")
      .notNull()
      .references(() => onboardingTranscripts.id),
    containsSensitiveHealthData: boolean("contains_sensitive_health_data").notNull().default(true),
    ...timestampColumns
  },
  (table) => ({
    rawChatHistoryOwnerForeignKey: foreignKey({
      columns: [table.userId, table.rawChatHistoryId],
      foreignColumns: [onboardingTranscripts.userId, onboardingTranscripts.id],
      name: "household_profiles_user_id_raw_chat_history_owner_fk"
    }),
    userIdUniqueIndex: uniqueIndex("household_profiles_user_id_idx").on(table.userId),
    rawChatHistoryIndex: index("household_profiles_raw_chat_history_idx").on(table.rawChatHistoryId)
  })
);

export const mealPlanTemplates = pgTable(
  "meal_plan_templates",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    durationDays: integer("duration_days").notNull(),
    recipes: jsonb("recipes").$type<MealPlanTemplate["recipes"]>().notNull(),
    days: jsonb("days").$type<MealPlanTemplate["days"]>().notNull(),
    metadata: jsonb("metadata").$type<MealPlanTemplate["metadata"]>().notNull(),
    ...timestampColumns
  },
  (table) => ({
    userOwnedTemplateUniqueConstraint: unique("meal_plan_templates_user_id_id_key").on(table.userId, table.id),
    userIdIndex: index("meal_plan_templates_user_id_idx").on(table.userId)
  })
);

export const mealPlanInstances = pgTable(
  "meal_plan_instances",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id")
      .notNull()
      .references(() => mealPlanTemplates.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    overrides: jsonb("overrides").$type<MealPlanInstance["overrides"]>().notNull(),
    ...timestampColumns
  },
  (table) => ({
    templateOwnerForeignKey: foreignKey({
      columns: [table.userId, table.templateId],
      foreignColumns: [mealPlanTemplates.userId, mealPlanTemplates.id],
      name: "meal_plan_instances_user_id_template_owner_fk"
    }),
    templateIdIndex: index("meal_plan_instances_template_id_idx").on(table.templateId),
    userOwnedInstanceUniqueConstraint: unique("meal_plan_instances_user_id_id_key").on(table.userId, table.id),
    userIdIndex: index("meal_plan_instances_user_id_idx").on(table.userId)
  })
);

export const freshfulProducts = pgTable(
  "freshful_products",
  {
    id: text("id").primaryKey(),
    freshfulId: text("freshful_id").notNull(),
    name: text("name").notNull(),
    price: numeric("price", { precision: 10, scale: 2, mode: "number" }).notNull(),
    currency: text("currency").notNull().default("RON"),
    unit: text("unit").notNull(),
    category: text("category").notNull(),
    tags: jsonb("tags").$type<FreshfulProduct["tags"]>().notNull(),
    imageUrl: text("image_url").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "string" }).notNull(),
    availability: productAvailabilityEnum("availability").notNull(),
    searchMetadata: jsonb("search_metadata").$type<FreshfulProduct["searchMetadata"] | null>(),
    ...timestampColumns
  },
  (table) => ({
    freshfulIdUniqueIndex: uniqueIndex("freshful_products_freshful_id_idx").on(table.freshfulId),
    categoryIndex: index("freshful_products_category_idx").on(table.category)
  })
);

export const shoppingLists = pgTable(
  "shopping_lists",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => mealPlanInstances.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    totalEstimatedCost: numeric("total_estimated_cost", { precision: 10, scale: 2, mode: "number" }).notNull(),
    status: shoppingListStatusEnum("status").notNull()
  },
  (table) => ({
    planOwnerForeignKey: foreignKey({
      columns: [table.userId, table.planId],
      foreignColumns: [mealPlanInstances.userId, mealPlanInstances.id],
      name: "shopping_lists_user_id_plan_owner_fk"
    }),
    userIdIndex: index("shopping_lists_user_id_idx").on(table.userId),
    planIdIndex: index("shopping_lists_plan_id_idx").on(table.planId)
  })
);

export const shoppingListItems = pgTable(
  "shopping_list_items",
  {
    id: text("id").primaryKey(),
    listId: text("list_id")
      .notNull()
      .references(() => shoppingLists.id, { onDelete: "cascade" }),
    ingredientName: text("ingredient_name").notNull(),
    requiredQuantity: numeric("required_quantity", { precision: 10, scale: 2, mode: "number" }).notNull(),
    requiredUnit: text("required_unit").notNull(),
    freshfulProductId: text("freshful_product_id").references(() => freshfulProducts.id, { onDelete: "set null" }),
    chosenQuantity: numeric("chosen_quantity", { precision: 10, scale: 2, mode: "number" }),
    chosenUnit: text("chosen_unit"),
    estimatedPrice: numeric("estimated_price", { precision: 10, scale: 2, mode: "number" }),
    category: text("category"),
    status: shoppingListItemStatusEnum("status").notNull(),
    ...timestampColumns
  },
  (table) => ({
    listIdIndex: index("shopping_list_items_list_id_idx").on(table.listId),
    freshfulProductIdIndex: index("shopping_list_items_freshful_product_id_idx").on(table.freshfulProductId)
  })
);

export const cachedSearchResults = pgTable(
  "cached_search_results",
  {
    id: text("id").primaryKey(),
    cacheKey: text("cache_key").notNull(),
    query: text("query").notNull(),
    filters: jsonb("filters").$type<FreshfulSearchFilters | null>(),
    productIds: jsonb("product_ids").$type<string[]>().notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: "string" }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
    source: text("source").notNull().default("freshful.search"),
    responseHash: text("response_hash"),
    ...timestampColumns
  },
  (table) => ({
    cacheKeyUniqueIndex: uniqueIndex("cached_search_results_cache_key_idx").on(table.cacheKey),
    expiryIndex: index("cached_search_results_expires_at_idx").on(table.expiresAt)
  })
);

export const usersRelations = relations(users, ({ many }) => ({
  householdProfiles: many(householdProfiles),
  onboardingTranscripts: many(onboardingTranscripts),
  mealPlanTemplates: many(mealPlanTemplates),
  mealPlanInstances: many(mealPlanInstances),
  shoppingLists: many(shoppingLists)
}));

export const householdProfilesRelations = relations(householdProfiles, ({ one }) => ({
  user: one(users, {
    fields: [householdProfiles.userId],
    references: [users.id]
  }),
  rawChatHistory: one(onboardingTranscripts, {
    fields: [householdProfiles.rawChatHistoryId],
    references: [onboardingTranscripts.id]
  })
}));

export const onboardingTranscriptsRelations = relations(onboardingTranscripts, ({ one }) => ({
  user: one(users, {
    fields: [onboardingTranscripts.userId],
    references: [users.id]
  })
}));

export const mealPlanTemplatesRelations = relations(mealPlanTemplates, ({ many, one }) => ({
  user: one(users, {
    fields: [mealPlanTemplates.userId],
    references: [users.id]
  }),
  instances: many(mealPlanInstances),
  shoppingLists: many(shoppingLists)
}));

export const mealPlanInstancesRelations = relations(mealPlanInstances, ({ many, one }) => ({
  template: one(mealPlanTemplates, {
    fields: [mealPlanInstances.templateId],
    references: [mealPlanTemplates.id]
  }),
  user: one(users, {
    fields: [mealPlanInstances.userId],
    references: [users.id]
  }),
  shoppingLists: many(shoppingLists)
}));

export const shoppingListsRelations = relations(shoppingLists, ({ many, one }) => ({
  user: one(users, {
    fields: [shoppingLists.userId],
    references: [users.id]
  }),
  items: many(shoppingListItems),
  plan: one(mealPlanInstances, {
    fields: [shoppingLists.planId],
    references: [mealPlanInstances.id]
  })
}));

export const shoppingListItemsRelations = relations(shoppingListItems, ({ one }) => ({
  list: one(shoppingLists, {
    fields: [shoppingListItems.listId],
    references: [shoppingLists.id]
  }),
  product: one(freshfulProducts, {
    fields: [shoppingListItems.freshfulProductId],
    references: [freshfulProducts.id]
  })
}));

export const databaseTables = {
  cachedSearchResults,
  freshfulProducts,
  householdProfiles,
  mealPlanInstances,
  mealPlanTemplates,
  onboardingTranscripts,
  shoppingListItems,
  shoppingLists,
  users
} as const;

export const sensitiveTableColumns = {
  householdProfiles: ["dietaryRestrictions", "allergies", "medicalFlags", "goals", "favoriteIngredients", "dislikedIngredients", "rawChatHistoryId"],
  onboardingTranscripts: ["messages"],
  users: ["email"]
} as const;