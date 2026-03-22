import type { HouseholdProfile } from "@freshful/contracts";
import { mealSlotValues } from "@freshful/contracts";

import { ClaudeUpstreamError, ClaudeUsageLimitError } from "../ai/errors.js";
import type { ClaudeService } from "../ai/service.js";
import type { ProfileService } from "../profile/service.js";
import {
  createInvalidGeneratedPlanError,
  createPlannerProfileRequiredError,
  createPlannerServiceUnavailableError,
  createPlannerUpstreamError,
  createPlannerUsageLimitError
} from "./errors.js";
import { createPlanResponseSchema, type CreatePlanRequest, type CreatePlanResponse, type GeneratedMealPlan } from "./contracts.js";
import type { PlannerRepository } from "./repository.js";

export interface PlannerService {
  createPlan(userId: string, input: CreatePlanRequest): Promise<CreatePlanResponse>;
}

export interface CreatePlannerServiceOptions {
  repository: PlannerRepository;
  profileService: ProfileService;
  aiService: ClaudeService | null;
}

type MealSlot = (typeof mealSlotValues)[number];

function sortSlots(slots: MealSlot[]): MealSlot[] {
  return [...slots].sort((left, right) => left.localeCompare(right));
}

function hasSequentialDayNumbers(dayNumbers: number[], durationDays: number): boolean {
  if (dayNumbers.length !== durationDays) {
    return false;
  }

  const sortedDayNumbers = [...dayNumbers].sort((left, right) => left - right);

  return sortedDayNumbers.every((dayNumber, index) => dayNumber === index + 1);
}

function validateGeneratedPlanAgainstRequest(plan: GeneratedMealPlan, input: CreatePlanRequest): string | null {
  if (plan.durationDays !== input.durationDays) {
    return `Expected durationDays ${input.durationDays}, received ${plan.durationDays}.`;
  }

  if (!hasSequentialDayNumbers(plan.days.map((day) => day.dayNumber), input.durationDays)) {
    return `Expected dayNumber values 1..${input.durationDays} in sequence.`;
  }

  const requestedSlots = sortSlots(input.mealSlots);

  for (const day of plan.days) {
    const actualSlots = sortSlots(day.meals.map((meal) => meal.slot));

    if (actualSlots.length !== requestedSlots.length) {
      return `Day ${day.dayNumber} contains ${actualSlots.length} meal slots, expected ${requestedSlots.length}.`;
    }

    if (actualSlots.some((slot, index) => slot !== requestedSlots[index])) {
      return `Day ${day.dayNumber} meal slots do not match the requested meal slot set.`;
    }
  }

  return null;
}

function buildPlannerContext(profile: HouseholdProfile) {
  return {
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
    cookingSkill: profile.cookingSkill
  };
}

export function createPlannerService(options: CreatePlannerServiceOptions): PlannerService {
  return {
    async createPlan(userId, input) {
      const aiService = options.aiService;

      if (!aiService) {
        throw createPlannerServiceUnavailableError();
      }

      const profile = await options.profileService.getProfile(userId);

      if (!profile) {
        throw createPlannerProfileRequiredError();
      }

      let generation;

      try {
        generation = await aiService.createMealPlan({
          profile: buildPlannerContext(profile),
          options: input
        });
      } catch (error) {
        if (error instanceof ClaudeUsageLimitError) {
          throw createPlannerUsageLimitError(error.message, error);
        }

        if (error instanceof ClaudeUpstreamError) {
          throw createPlannerUpstreamError(error.statusCode, error.retryable, error);
        }

        throw error;
      }

      if (!generation.plan) {
        throw createInvalidGeneratedPlanError(generation.parseFailureReason ?? "unknown", {
          rawText: generation.rawText
        });
      }

      const constraintFailure = validateGeneratedPlanAgainstRequest(generation.plan, input);

      if (constraintFailure) {
        throw createInvalidGeneratedPlanError("constraint_mismatch", {
          validationMessage: constraintFailure
        });
      }

      return createPlanResponseSchema.parse(
        await options.repository.createForUser(userId, generation.plan, input.startDate)
      );
    }
  };
}
