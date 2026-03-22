import { randomUUID } from "node:crypto";

import type { HouseholdProfile, OnboardingTranscript } from "@freshful/contracts";
import { householdProfileSchema } from "@freshful/contracts";
import { eq } from "drizzle-orm";

import { createApiDatabase } from "../db/client.js";
import { databaseTables } from "../db/schema.js";
import type { ProfileWriteInput } from "./contracts.js";

export type ProfileDatabase = ReturnType<typeof createApiDatabase>["db"];

export interface HouseholdProfileRepository {
  getByUserId(userId: string): Promise<HouseholdProfile | null>;
  upsertForUser(userId: string, input: ProfileWriteInput): Promise<HouseholdProfile>;
}

export interface CreateHouseholdProfileRepositoryOptions {
  now?: () => Date;
}

function buildProfilePlaceholderTranscript(createdAt: string): OnboardingTranscript["messages"] {
  return [
    {
      id: randomUUID(),
      role: "system",
      content:
        "Profile saved through the authenticated profile endpoint. Sensitive dietary and health-related fields are stored only in structured profile storage and are not duplicated into transcript history.",
      createdAt
    }
  ];
}

function toHouseholdProfile(record: {
  userId: string;
  householdType: HouseholdProfile["householdType"];
  numChildren: number;
  dietaryRestrictions: HouseholdProfile["dietaryRestrictions"];
  allergies: HouseholdProfile["allergies"];
  medicalFlags: HouseholdProfile["medicalFlags"];
  goals: HouseholdProfile["goals"];
  cuisinePreferences: HouseholdProfile["cuisinePreferences"];
  favoriteIngredients: HouseholdProfile["favoriteIngredients"];
  dislikedIngredients: HouseholdProfile["dislikedIngredients"];
  budgetBand: HouseholdProfile["budgetBand"];
  maxPrepTimeMinutes: number;
  cookingSkill: HouseholdProfile["cookingSkill"];
  rawChatHistoryId: string;
}): HouseholdProfile {
  return householdProfileSchema.parse(record);
}

function hasSensitiveHealthSignals(input: ProfileWriteInput): boolean {
  return (
    input.goals.length > 0 ||
    input.dietaryRestrictions.length > 0 ||
    input.allergies.normalized.length > 0 ||
    input.allergies.freeText.length > 0 ||
    Object.values(input.medicalFlags).some(Boolean)
  );
}

export function createHouseholdProfileRepository(
  database: ProfileDatabase,
  options: CreateHouseholdProfileRepositoryOptions = {}
): HouseholdProfileRepository {
  const now = options.now ?? (() => new Date());

  return {
    async getByUserId(userId: string): Promise<HouseholdProfile | null> {
      const [profile] = await database
        .select({
          userId: databaseTables.householdProfiles.userId,
          householdType: databaseTables.householdProfiles.householdType,
          numChildren: databaseTables.householdProfiles.numChildren,
          dietaryRestrictions: databaseTables.householdProfiles.dietaryRestrictions,
          allergies: databaseTables.householdProfiles.allergies,
          medicalFlags: databaseTables.householdProfiles.medicalFlags,
          goals: databaseTables.householdProfiles.goals,
          cuisinePreferences: databaseTables.householdProfiles.cuisinePreferences,
          favoriteIngredients: databaseTables.householdProfiles.favoriteIngredients,
          dislikedIngredients: databaseTables.householdProfiles.dislikedIngredients,
          budgetBand: databaseTables.householdProfiles.budgetBand,
          maxPrepTimeMinutes: databaseTables.householdProfiles.maxPrepTimeMinutes,
          cookingSkill: databaseTables.householdProfiles.cookingSkill,
          rawChatHistoryId: databaseTables.householdProfiles.rawChatHistoryId
        })
        .from(databaseTables.householdProfiles)
        .where(eq(databaseTables.householdProfiles.userId, userId))
        .limit(1);

      return profile ? toHouseholdProfile(profile) : null;
    },

    async upsertForUser(userId: string, input: ProfileWriteInput): Promise<HouseholdProfile> {
      return database.transaction(async (transaction) => {
        const [existingProfile] = await transaction
          .select({
            id: databaseTables.householdProfiles.id,
            rawChatHistoryId: databaseTables.householdProfiles.rawChatHistoryId
          })
          .from(databaseTables.householdProfiles)
          .where(eq(databaseTables.householdProfiles.userId, userId))
          .limit(1);
        const updatedAt = now().toISOString();
        let rawChatHistoryId = existingProfile?.rawChatHistoryId;

        if (!rawChatHistoryId) {
          rawChatHistoryId = randomUUID();

          await transaction.insert(databaseTables.onboardingTranscripts).values({
            id: rawChatHistoryId,
            userId,
            messages: buildProfilePlaceholderTranscript(updatedAt),
            containsSensitiveProfileSignals: false
          });
        }

        const [profile] = await transaction
          .insert(databaseTables.householdProfiles)
          .values({
            id: existingProfile?.id ?? randomUUID(),
            userId,
            householdType: input.householdType,
            numChildren: input.numChildren,
            dietaryRestrictions: input.dietaryRestrictions,
            allergies: input.allergies,
            medicalFlags: input.medicalFlags,
            goals: input.goals,
            cuisinePreferences: input.cuisinePreferences,
            favoriteIngredients: input.favoriteIngredients,
            dislikedIngredients: input.dislikedIngredients,
            budgetBand: input.budgetBand,
            maxPrepTimeMinutes: input.maxPrepTimeMinutes,
            cookingSkill: input.cookingSkill,
            rawChatHistoryId,
            containsSensitiveHealthData: hasSensitiveHealthSignals(input)
          })
          .onConflictDoUpdate({
            target: databaseTables.householdProfiles.userId,
            set: {
              householdType: input.householdType,
              numChildren: input.numChildren,
              dietaryRestrictions: input.dietaryRestrictions,
              allergies: input.allergies,
              medicalFlags: input.medicalFlags,
              goals: input.goals,
              cuisinePreferences: input.cuisinePreferences,
              favoriteIngredients: input.favoriteIngredients,
              dislikedIngredients: input.dislikedIngredients,
              budgetBand: input.budgetBand,
              maxPrepTimeMinutes: input.maxPrepTimeMinutes,
              cookingSkill: input.cookingSkill,
              rawChatHistoryId,
              containsSensitiveHealthData: hasSensitiveHealthSignals(input),
              updatedAt
            }
          })
          .returning({
            userId: databaseTables.householdProfiles.userId,
            householdType: databaseTables.householdProfiles.householdType,
            numChildren: databaseTables.householdProfiles.numChildren,
            dietaryRestrictions: databaseTables.householdProfiles.dietaryRestrictions,
            allergies: databaseTables.householdProfiles.allergies,
            medicalFlags: databaseTables.householdProfiles.medicalFlags,
            goals: databaseTables.householdProfiles.goals,
            cuisinePreferences: databaseTables.householdProfiles.cuisinePreferences,
            favoriteIngredients: databaseTables.householdProfiles.favoriteIngredients,
            dislikedIngredients: databaseTables.householdProfiles.dislikedIngredients,
            budgetBand: databaseTables.householdProfiles.budgetBand,
            maxPrepTimeMinutes: databaseTables.householdProfiles.maxPrepTimeMinutes,
            cookingSkill: databaseTables.householdProfiles.cookingSkill,
            rawChatHistoryId: databaseTables.householdProfiles.rawChatHistoryId
          });

        return toHouseholdProfile(profile);
      });
    }
  };
}