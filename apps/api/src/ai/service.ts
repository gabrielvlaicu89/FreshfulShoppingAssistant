import type { OnboardingChatMessage } from "@freshful/contracts";
import { z } from "zod";

import {
  partialProfileWriteSchema,
  profileWriteSchema,
  type PartialProfileWriteInput,
  type ProfileWriteInput
} from "../profile/contracts.js";
import { generatedMealPlanSchema, type CreatePlanRequest, type GeneratedMealPlan } from "../planner/contracts.js";
import { type AnthropicConfig } from "../config.js";
import { getRequestContext, getRequestLogger } from "../request-context.js";
import { type ClaudeClient, createAnthropicClient } from "./client.js";
import { createAiUsageMeter, type AiUsageMeter } from "./budget.js";
import { ClaudeBudgetLimitError, ClaudeUsageLimitError } from "./errors.js";
import { parseStructuredResponse } from "./parser.js";
import {
  assembleMealPlanPrompt,
  assembleMealPlanRefinementPrompt,
  assembleOnboardingReplyPrompt,
  assembleProfileExtractionPrompt,
  assembleShoppingProductSelectionPrompt
} from "./prompts.js";
import { selectClaudeModel, type ClaudeModelTier, type ClaudeTask } from "./routing.js";

const profileExtractionEnvelopeSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("complete"),
      profile: profileWriteSchema
    })
    .strict(),
  z
    .object({
      status: z.literal("incomplete"),
      knownProfile: partialProfileWriteSchema.optional(),
      missingFields: z.array(z.string().trim().min(1)).min(1)
    })
    .strict()
]);

const shoppingProductSelectionSchema = z
  .object({
    selectedProductId: z.string().trim().min(1).nullable(),
    reason: z.string().trim().min(1)
  })
  .strict();

export type ExtractedProfileData = ProfileWriteInput | PartialProfileWriteInput;

export interface ClaudeServiceUsage {
  model: string;
  modelTier: ClaudeModelTier;
  routeReason: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface OnboardingReplyRequest {
  transcript: OnboardingChatMessage[];
}

export interface OnboardingReplyResponse {
  assistantMessage: string;
  usage: ClaudeServiceUsage;
}

export interface ProfileExtractionRequest {
  transcript: OnboardingChatMessage[];
}

export interface ProfileExtractionResponse {
  profile: ExtractedProfileData | null;
  rawText: string;
  missingFields: string[];
  parseFailureReason: "incomplete" | "missing_json" | "invalid_json" | "schema_mismatch" | null;
  usage: ClaudeServiceUsage;
}

export interface MealPlanGenerationRequest {
  profile: {
    householdType: string;
    numChildren: number;
    dietaryRestrictions: string[];
    allergies: {
      normalized: string[];
      freeText: string[];
    };
    medicalFlags: {
      diabetes: boolean;
      hypertension: boolean;
    };
    goals: string[];
    cuisinePreferences: string[];
    favoriteIngredients: string[];
    dislikedIngredients: string[];
    budgetBand: string;
    maxPrepTimeMinutes: number;
    cookingSkill: string;
  };
  options: CreatePlanRequest;
}

export interface MealPlanGenerationResponse {
  plan: GeneratedMealPlan | null;
  rawText: string;
  parseFailureReason: "missing_json" | "invalid_json" | "schema_mismatch" | null;
  usage: ClaudeServiceUsage;
}

export interface MealPlanRefinementRequest {
  profile: MealPlanGenerationRequest["profile"];
  currentPlan: GeneratedMealPlan;
  refinementPrompt: string;
}

export interface MealPlanRefinementResponse {
  plan: GeneratedMealPlan | null;
  rawText: string;
  parseFailureReason: "missing_json" | "invalid_json" | "schema_mismatch" | null;
  usage: ClaudeServiceUsage;
}

export interface ShoppingProductSelectionRequest {
  ingredientName: string;
  requiredQuantity: number;
  requiredUnit: string;
  profile: {
    dietaryRestrictions: string[];
    allergies: {
      normalized: string[];
      freeText: string[];
    };
    favoriteIngredients: string[];
    dislikedIngredients: string[];
    cuisinePreferences: string[];
    budgetBand: string;
  } | null;
  candidates: Array<{
    id: string;
    name: string;
    price: number;
    currency: string;
    unit: string;
    category: string;
    tags: string[];
    availability: string;
    searchRank: number | null;
  }>;
}

export interface ShoppingProductSelectionResponse {
  selectedProductId: string | null;
  reason: string;
  rawText: string;
  parseFailureReason: "missing_json" | "invalid_json" | "schema_mismatch" | null;
  usage: ClaudeServiceUsage;
}

export interface ClaudeService {
  createOnboardingReply(request: OnboardingReplyRequest): Promise<OnboardingReplyResponse>;
  extractProfile(request: ProfileExtractionRequest): Promise<ProfileExtractionResponse>;
  createMealPlan(request: MealPlanGenerationRequest): Promise<MealPlanGenerationResponse>;
  refineMealPlan(request: MealPlanRefinementRequest): Promise<MealPlanRefinementResponse>;
  selectShoppingProduct(request: ShoppingProductSelectionRequest): Promise<ShoppingProductSelectionResponse>;
}

export interface CreateClaudeServiceOptions {
  config: AnthropicConfig;
  client?: ClaudeClient;
  usageMeter?: AiUsageMeter;
  now?: () => Date;
}

function enforcePromptLimit(promptChars: number, maxPromptChars: number): void {
  if (promptChars > maxPromptChars) {
    throw new ClaudeUsageLimitError(
      `Prompt exceeded the configured maximum size of ${maxPromptChars} characters.`
    );
  }
}

function createUsageMetadata(
  modelTier: ClaudeModelTier,
  model: string,
  routeReason: string,
  usage: { inputTokens: number; outputTokens: number } | null
): ClaudeServiceUsage {
  return {
    model,
    modelTier,
    routeReason,
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null
  };
}

function resolveModel(config: AnthropicConfig, task: ClaudeTask, transcriptMessageCount: number, promptChars: number) {
  const decision = selectClaudeModel(config.routing, {
    task,
    transcriptMessageCount,
    promptChars
  });
  const model = decision.tier === "haiku" ? config.models.haiku : config.models.sonnet;

  return {
    model,
    modelTier: decision.tier,
    routeReason: decision.reason
  };
}

export function createClaudeService(options: CreateClaudeServiceOptions): ClaudeService {
  const client =
    options.client ??
    createAnthropicClient({
      apiKey: options.config.apiKey,
      baseUrl: options.config.baseUrl,
      apiVersion: options.config.apiVersion,
      requestTimeoutMs: options.config.requestTimeoutMs
    });
  const promptLimits = {
    maxTranscriptMessages: options.config.usage.maxTranscriptMessages,
    maxPromptChars: options.config.usage.maxPromptChars
  };
  const usageMeter = options.usageMeter ?? createAiUsageMeter({
    budget: options.config.budget,
    now: options.now
  });

  async function executeClaudeRequest(args: {
    operation: string;
    task: ClaudeTask;
    transcriptMessageCount: number;
    promptChars: number;
    system: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  }) {
    enforcePromptLimit(args.promptChars, options.config.usage.maxPromptChars);

    const route = resolveModel(options.config, args.task, args.transcriptMessageCount, args.promptChars);
    const requestContext = getRequestContext();
    const requestLogger = getRequestLogger({
      provider: "anthropic",
      operation: args.operation,
      model: route.model,
      modelTier: route.modelTier
    });

    let execution;

    try {
      execution = await usageMeter.executeWithinBudget(
        {
          userId: requestContext?.userId ?? null,
          operation: args.operation
        },
        async (budgetSnapshot) => {
          requestLogger?.info?.(
            {
              routeReason: route.routeReason,
              globalSpentUsd: budgetSnapshot.globalSpentUsd,
              globalUsdLimit: budgetSnapshot.globalUsdLimit,
              perUserSpentUsd: budgetSnapshot.perUserSpentUsd,
              perUserUsdLimit: budgetSnapshot.perUserUsdLimit
            },
            "Calling Anthropic."
          );

          const response = await client.createMessage({
            model: route.model,
            system: args.system,
            maxTokens: options.config.usage.maxOutputTokens,
            messages: args.messages
          });
          const usage = createUsageMetadata(route.modelTier, route.model, route.routeReason, response.usage);

          return {
            result: {
              response,
              usage
            },
            usageToRecord:
              usage.inputTokens !== null && usage.outputTokens !== null
                ? {
                    userId: requestContext?.userId ?? null,
                    operation: args.operation,
                    model: route.model,
                    modelTier: route.modelTier,
                    inputTokens: usage.inputTokens,
                    outputTokens: usage.outputTokens
                  }
                : undefined
          };
        }
      );
    } catch (error) {
      if (error instanceof ClaudeBudgetLimitError) {
        requestLogger?.warn?.(
          {
            err: error,
            routeReason: route.routeReason
          },
          "Blocked Anthropic call because the configured budget window is exhausted."
        );
      }

      throw error;
    }

    if (execution.recordedUsage) {
      requestLogger?.info?.(
        {
          inputTokens: execution.recordedUsage.inputTokens,
          outputTokens: execution.recordedUsage.outputTokens,
          estimatedCostUsd: execution.recordedUsage.estimatedCostUsd,
          recordedAt: execution.recordedUsage.recordedAt,
          routeReason: route.routeReason,
          userId: requestContext?.userId ?? null
        },
        "Anthropic call completed."
      );
    }

    return {
      response: execution.result.response,
      usage: execution.result.usage,
      route
    };
  }

  return {
    async createOnboardingReply(request) {
      const prompt = assembleOnboardingReplyPrompt(request, promptLimits);

      const execution = await executeClaudeRequest({
        operation: "onboarding-reply",
        task: "onboarding-turn",
        transcriptMessageCount: prompt.transcriptMessageCount,
        promptChars: prompt.promptChars,
        system: prompt.system,
        messages: prompt.messages
      });

      return {
        assistantMessage: execution.response.text.trim(),
        usage: execution.usage
      };
    },

    async extractProfile(request) {
      const prompt = assembleProfileExtractionPrompt(request, promptLimits);

      const execution = await executeClaudeRequest({
        operation: "profile-extraction",
        task: "profile-structuring",
        transcriptMessageCount: prompt.transcriptMessageCount,
        promptChars: prompt.promptChars,
        system: prompt.system,
        messages: prompt.messages
      });
      const parsed = parseStructuredResponse(execution.response.text, profileExtractionEnvelopeSchema);

      if (parsed.data?.status === "complete") {
        return {
          profile: parsed.data.profile,
          rawText: execution.response.text.trim(),
          missingFields: [],
          parseFailureReason: null,
          usage: execution.usage
        };
      }

      if (parsed.data?.status === "incomplete") {
        return {
          profile: parsed.data.knownProfile ?? null,
          rawText: execution.response.text.trim(),
          missingFields: parsed.data.missingFields,
          parseFailureReason: "incomplete",
          usage: execution.usage
        };
      }

      return {
        profile: null,
        rawText: execution.response.text.trim(),
        missingFields: [],
        parseFailureReason: parsed.failureReason,
        usage: execution.usage
      };
    },

    async createMealPlan(request) {
      const prompt = assembleMealPlanPrompt(request);

      const execution = await executeClaudeRequest({
        operation: "meal-plan-generation",
        task: "meal-plan-generation",
        transcriptMessageCount: prompt.transcriptMessageCount,
        promptChars: prompt.promptChars,
        system: prompt.system,
        messages: prompt.messages
      });
      const parsed = parseStructuredResponse(execution.response.text, generatedMealPlanSchema);

      return {
        plan: parsed.data,
        rawText: execution.response.text.trim(),
        parseFailureReason: parsed.failureReason,
        usage: execution.usage
      };
    },

    async refineMealPlan(request) {
      const prompt = assembleMealPlanRefinementPrompt(request);

      const execution = await executeClaudeRequest({
        operation: "meal-plan-refinement",
        task: "meal-plan-refinement",
        transcriptMessageCount: prompt.transcriptMessageCount,
        promptChars: prompt.promptChars,
        system: prompt.system,
        messages: prompt.messages
      });
      const parsed = parseStructuredResponse(execution.response.text, generatedMealPlanSchema);

      return {
        plan: parsed.data,
        rawText: execution.response.text.trim(),
        parseFailureReason: parsed.failureReason,
        usage: execution.usage
      };
    },

    async selectShoppingProduct(request) {
      const prompt = assembleShoppingProductSelectionPrompt(request);

      const execution = await executeClaudeRequest({
        operation: "shopping-product-selection",
        task: "shopping-product-selection",
        transcriptMessageCount: 0,
        promptChars: prompt.promptChars,
        system: prompt.system,
        messages: prompt.messages
      });
      const parsed = parseStructuredResponse(execution.response.text, shoppingProductSelectionSchema);
      const candidateIds = new Set(request.candidates.map((candidate) => candidate.id));
      const selectedProductId = parsed.data?.selectedProductId ?? null;
      const isValidSelection = selectedProductId === null || candidateIds.has(selectedProductId);

      return {
        selectedProductId: isValidSelection ? selectedProductId : null,
        reason:
          parsed.data?.reason ??
          "Claude did not return a valid shopping product selection response.",
        rawText: execution.response.text.trim(),
        parseFailureReason: isValidSelection ? parsed.failureReason : "schema_mismatch",
        usage: execution.usage
      };
    }
  };
}