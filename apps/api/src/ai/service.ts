import type { OnboardingChatMessage } from "@freshful/contracts";
import { z } from "zod";

import {
  partialProfileWriteSchema,
  profileWriteSchema,
  type PartialProfileWriteInput,
  type ProfileWriteInput
} from "../profile/contracts.js";
import { type AnthropicConfig } from "../config.js";
import { type ClaudeClient, createAnthropicClient } from "./client.js";
import { ClaudeUsageLimitError } from "./errors.js";
import { parseStructuredResponse } from "./parser.js";
import { assembleOnboardingReplyPrompt, assembleProfileExtractionPrompt } from "./prompts.js";
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

export interface ClaudeService {
  createOnboardingReply(request: OnboardingReplyRequest): Promise<OnboardingReplyResponse>;
  extractProfile(request: ProfileExtractionRequest): Promise<ProfileExtractionResponse>;
}

export interface CreateClaudeServiceOptions {
  config: AnthropicConfig;
  client?: ClaudeClient;
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

  return {
    async createOnboardingReply(request) {
      const prompt = assembleOnboardingReplyPrompt(request, promptLimits);

      enforcePromptLimit(prompt.promptChars, options.config.usage.maxPromptChars);

      const route = resolveModel(options.config, "onboarding-turn", prompt.transcriptMessageCount, prompt.promptChars);
      const response = await client.createMessage({
        model: route.model,
        system: prompt.system,
        maxTokens: options.config.usage.maxOutputTokens,
        messages: prompt.messages
      });

      return {
        assistantMessage: response.text.trim(),
        usage: createUsageMetadata(route.modelTier, route.model, route.routeReason, response.usage)
      };
    },

    async extractProfile(request) {
      const prompt = assembleProfileExtractionPrompt(request, promptLimits);

      enforcePromptLimit(prompt.promptChars, options.config.usage.maxPromptChars);

      const route = resolveModel(options.config, "profile-structuring", prompt.transcriptMessageCount, prompt.promptChars);
      const response = await client.createMessage({
        model: route.model,
        system: prompt.system,
        maxTokens: options.config.usage.maxOutputTokens,
        messages: prompt.messages
      });
      const parsed = parseStructuredResponse(response.text, profileExtractionEnvelopeSchema);

      if (parsed.data?.status === "complete") {
        return {
          profile: parsed.data.profile,
          rawText: response.text.trim(),
          missingFields: [],
          parseFailureReason: null,
          usage: createUsageMetadata(route.modelTier, route.model, route.routeReason, response.usage)
        };
      }

      if (parsed.data?.status === "incomplete") {
        return {
          profile: parsed.data.knownProfile ?? null,
          rawText: response.text.trim(),
          missingFields: parsed.data.missingFields,
          parseFailureReason: "incomplete",
          usage: createUsageMetadata(route.modelTier, route.model, route.routeReason, response.usage)
        };
      }

      return {
        profile: null,
        rawText: response.text.trim(),
        missingFields: [],
        parseFailureReason: parsed.failureReason,
        usage: createUsageMetadata(route.modelTier, route.model, route.routeReason, response.usage)
      };
    }
  };
}