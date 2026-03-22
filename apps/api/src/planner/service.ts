import type { HouseholdProfile } from "@freshful/contracts";
import { mealSlotValues } from "@freshful/contracts";

import { ClaudeUpstreamError, ClaudeUsageLimitError } from "../ai/errors.js";
import type { ClaudeService } from "../ai/service.js";
import type { ProfileService } from "../profile/service.js";
import {
  createInvalidGeneratedPlanError,
  createInvalidRefinedPlanError,
  createPlannerPlanNotFoundError,
  createPlannerProfileRequiredError,
  createPlannerServiceUnavailableError,
  createPlannerUpstreamError,
  createPlannerUsageLimitError
} from "./errors.js";
import {
  createPlanResponseSchema,
  planDetailResponseSchema,
  type CreatePlanRequest,
  type CreatePlanResponse,
  type GeneratedMealPlan,
  type PlanDetailResponse,
  type RefinePlanRequest
} from "./contracts.js";
import type { PersistedPlanDetail, PlannerRepository } from "./repository.js";

export interface PlannerService {
  createPlan(userId: string, input: CreatePlanRequest): Promise<CreatePlanResponse>;
  getPlan(userId: string, planId: string): Promise<PlanDetailResponse>;
  refinePlan(userId: string, planId: string, input: RefinePlanRequest): Promise<PlanDetailResponse>;
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

function validateRefinedPlanAgainstSource(plan: GeneratedMealPlan, sourcePlan: PersistedPlanDetail): string | null {
  if (plan.durationDays !== sourcePlan.template.durationDays) {
    return `Expected durationDays ${sourcePlan.template.durationDays}, received ${plan.durationDays}.`;
  }

  if (!hasSequentialDayNumbers(plan.days.map((day) => day.dayNumber), sourcePlan.template.durationDays)) {
    return `Expected dayNumber values 1..${sourcePlan.template.durationDays} in sequence.`;
  }

  const sourceSlotsByDay = new Map(
    sourcePlan.template.days.map((day) => [day.dayNumber, sortSlots(day.meals.map((meal) => meal.slot))])
  );

  for (const day of plan.days) {
    const expectedSlots = sourceSlotsByDay.get(day.dayNumber);

    if (!expectedSlots) {
      return `Day ${day.dayNumber} is not present in the source meal plan.`;
    }

    const actualSlots = sortSlots(day.meals.map((meal) => meal.slot));

    if (actualSlots.length !== expectedSlots.length) {
      return `Day ${day.dayNumber} contains ${actualSlots.length} meal slots, expected ${expectedSlots.length}.`;
    }

    if (actualSlots.some((slot, index) => slot !== expectedSlots[index])) {
      return `Day ${day.dayNumber} meal slots do not match the source meal plan.`;
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
    },

    async getPlan(userId, planId) {
      const plan = await options.repository.getForUser(userId, planId);

      if (!plan) {
        throw createPlannerPlanNotFoundError();
      }

      return planDetailResponseSchema.parse(plan);
    },

    async refinePlan(userId, planId, input) {
      const aiService = options.aiService;

      if (!aiService) {
        throw createPlannerServiceUnavailableError();
      }

      const profile = await options.profileService.getProfile(userId);

      if (!profile) {
        throw createPlannerProfileRequiredError();
      }

      const sourcePlan = await options.repository.getForUser(userId, planId);

      if (!sourcePlan) {
        throw createPlannerPlanNotFoundError();
      }

      let refinement;

      try {
        refinement = await aiService.refineMealPlan({
          profile: buildPlannerContext(profile),
          currentPlan: {
            title: sourcePlan.template.title,
            durationDays: sourcePlan.template.durationDays,
            recipes: sourcePlan.template.recipes,
            days: sourcePlan.template.days,
            metadata: sourcePlan.template.metadata
          },
          refinementPrompt: input.prompt
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

      if (!refinement.plan) {
        throw createInvalidRefinedPlanError(refinement.parseFailureReason ?? "unknown", {
          rawText: refinement.rawText
        });
      }

      const constraintFailure = validateRefinedPlanAgainstSource(refinement.plan, sourcePlan);

      if (constraintFailure) {
        throw createInvalidRefinedPlanError("constraint_mismatch", {
          validationMessage: constraintFailure
        });
      }

      return planDetailResponseSchema.parse(
        await options.repository.createRevisionForUser(userId, sourcePlan, refinement.plan)
      );
    }
  };
}
