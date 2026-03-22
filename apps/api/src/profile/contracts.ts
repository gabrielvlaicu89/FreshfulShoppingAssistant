import {
  allergyValues,
  allergiesSchema,
  budgetBandValues,
  cookingSkillValues,
  dietaryRestrictionValues,
  healthGoalValues,
  householdProfileSchema,
  householdTypeValues,
  medicalFlagsSchema
} from "@freshful/contracts";
import { z } from "zod";

const trimmedStringSchema = z.string().trim().min(1);

export const profileWriteSchema = z
  .object({
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
    cookingSkill: z.enum(cookingSkillValues)
  })
  .strict();

export type ProfileWriteInput = z.infer<typeof profileWriteSchema>;

const partialAllergiesSchema = z
  .object({
    normalized: z.array(z.enum(allergyValues)).optional(),
    freeText: z.array(trimmedStringSchema).optional()
  })
  .strict();

const partialMedicalFlagsSchema = z
  .object({
    diabetes: z.boolean().optional(),
    hypertension: z.boolean().optional()
  })
  .strict();

export const partialProfileWriteSchema = profileWriteSchema
  .extend({
    allergies: partialAllergiesSchema.optional(),
    medicalFlags: partialMedicalFlagsSchema.optional()
  })
  .partial();

export type PartialProfileWriteInput = z.infer<typeof partialProfileWriteSchema>;

export const profileResponseSchema = z
  .object({
    profile: householdProfileSchema.nullable()
  })
  .strict();

export type ProfileResponse = z.infer<typeof profileResponseSchema>;

export const profileUpsertResponseSchema = z
  .object({
    profile: householdProfileSchema
  })
  .strict();

export type ProfileUpsertResponse = z.infer<typeof profileUpsertResponseSchema>;