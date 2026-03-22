import {
  mealPlanDaySchema,
  mealPlanInstanceSchema,
  mealPlanMetadataSchema,
  mealPlanTemplateSchema,
  mealSlotValues,
  recipeSchema,
  type MealPlanTemplate
} from "@freshful/contracts";
import { z } from "zod";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

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

function isValidIsoCalendarDate(value: string): boolean {
  if (!isoDatePattern.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function hasSequentialDayNumbers(dayNumbers: number[], durationDays: number): boolean {
  if (dayNumbers.length !== durationDays) {
    return false;
  }

  const sortedDayNumbers = [...dayNumbers].sort((left, right) => left - right);

  return sortedDayNumbers.every((dayNumber, index) => dayNumber === index + 1);
}

export const createPlanRequestSchema = z
  .object({
    durationDays: z.number().int().min(1).max(7),
    mealSlots: z.array(z.enum(mealSlotValues)).min(1),
    startDate: z.string().regex(isoDatePattern, "Expected YYYY-MM-DD date format.").optional()
  })
  .strict()
  .superRefine((value, context) => {
    const duplicateSlots = findDuplicateValues(value.mealSlots);

    for (const duplicateSlot of duplicateSlots) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mealSlots"],
        message: `Duplicate meal slot '${duplicateSlot}' is not allowed.`
      });
    }

    if (value.startDate && !isValidIsoCalendarDate(value.startDate)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startDate"],
        message: "startDate must be a real calendar date in YYYY-MM-DD format."
      });
    }
  });

export type CreatePlanRequest = z.infer<typeof createPlanRequestSchema>;

export type GeneratedMealPlan = Omit<MealPlanTemplate, "id" | "userId">;

export const generatedMealPlanSchema: z.ZodType<GeneratedMealPlan> = z
  .object({
    title: z.string().trim().min(1),
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

    if (!hasSequentialDayNumbers(value.days.map((day) => day.dayNumber), value.durationDays)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["days"],
        message: "Meal plan dayNumber values must be sequential from 1 to durationDays."
      });
    }

    const dayNumbers = new Set<number>();
    const recipeIds = new Set(value.recipes.map((recipe) => recipe.id));

    value.days.forEach((day, dayIndex) => {
      if (dayNumbers.has(day.dayNumber)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["days", dayIndex, "dayNumber"],
          message: `Duplicate dayNumber '${day.dayNumber}' is not allowed.`
        });
      }

      dayNumbers.add(day.dayNumber);

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

export const createPlanResponseSchema = z
  .object({
    template: mealPlanTemplateSchema,
    instance: mealPlanInstanceSchema.nullable()
  })
  .strict();

export type CreatePlanResponse = z.infer<typeof createPlanResponseSchema>;

const identifierSchema = z.string().trim().min(1);
const nullableIsoDateSchema = z.string().regex(isoDatePattern, "Expected YYYY-MM-DD date format.").nullable();

export const planParamsSchema = z
  .object({
    id: identifierSchema
  })
  .strict();

export type PlanParams = z.infer<typeof planParamsSchema>;

export const refinePlanRequestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(2000)
  })
  .strict();

export type RefinePlanRequest = z.infer<typeof refinePlanRequestSchema>;

export const planRevisionSchema = z
  .object({
    templateId: identifierSchema,
    parentTemplateId: identifierSchema.nullable(),
    title: z.string().trim().min(1),
    createdAt: z.string().trim().min(1),
    instanceId: identifierSchema.nullable(),
    startDate: nullableIsoDateSchema,
    endDate: nullableIsoDateSchema
  })
  .strict();

export type PlanRevision = z.infer<typeof planRevisionSchema>;

export const planDetailResponseSchema = z
  .object({
    template: mealPlanTemplateSchema,
    instance: mealPlanInstanceSchema.nullable(),
    revisionHistory: z.array(planRevisionSchema).min(1)
  })
  .strict();

export type PlanDetailResponse = z.infer<typeof planDetailResponseSchema>;
