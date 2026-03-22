import { randomUUID } from "node:crypto";

import { onboardingChatMessageSchema } from "@freshful/contracts";

import { ClaudeUpstreamError, ClaudeUsageLimitError } from "../ai/errors.js";
import type { ClaudeService } from "../ai/service.js";
import { profileWriteSchema } from "../profile/contracts.js";
import type { ProfileService } from "../profile/service.js";
import { createOnboardingServiceUnavailableError, createOnboardingUpstreamError, createOnboardingUsageLimitError } from "./errors.js";
import { onboardingChatResponseSchema, type OnboardingChatRequest, type OnboardingChatResponse } from "./contracts.js";
import type { OnboardingTranscriptRepository } from "./repository.js";

export interface OnboardingService {
  sendMessage(userId: string, input: OnboardingChatRequest): Promise<OnboardingChatResponse>;
}

export interface CreateOnboardingServiceOptions {
  repository: OnboardingTranscriptRepository;
  profileService: ProfileService;
  aiService: ClaudeService | null;
  now?: () => Date;
  createMessageId?: () => string;
}

function createChatMessage(role: "user" | "assistant", content: string, createdAt: string, id: string) {
  return onboardingChatMessageSchema.parse({
    id,
    role,
    content,
    createdAt
  });
}

export function createOnboardingService(options: CreateOnboardingServiceOptions): OnboardingService {
  const now = options.now ?? (() => new Date());
  const createMessageId = options.createMessageId ?? randomUUID;

  return {
    async sendMessage(userId, input) {
      const aiService = options.aiService;

      if (!aiService) {
        throw createOnboardingServiceUnavailableError();
      }

      const requestTimestamp = now().toISOString();
      const userMessage = createChatMessage("user", input.message, requestTimestamp, createMessageId());
      const existingTranscript = await options.repository.getActiveForUser(userId);
      const shouldForkActiveTranscript = existingTranscript?.householdProfileId != null;
      const transcriptForReply = existingTranscript ? [...existingTranscript.messages, userMessage] : [userMessage];

      let assistantReply;

      try {
        assistantReply = await aiService.createOnboardingReply({
          transcript: transcriptForReply
        });
      } catch (error) {
        if (error instanceof ClaudeUsageLimitError) {
          throw createOnboardingUsageLimitError(error.message, error);
        }

        if (error instanceof ClaudeUpstreamError) {
          throw createOnboardingUpstreamError(error.statusCode, error.retryable, error);
        }

        throw error;
      }

      const assistantMessage = createChatMessage(
        "assistant",
        assistantReply.assistantMessage,
        now().toISOString(),
        createMessageId()
      );
      const transcriptForExtraction = existingTranscript
        ? {
            ...existingTranscript,
            messages: [...transcriptForReply, assistantMessage]
          }
        : {
            id: "pending-transcript",
            messages: [...transcriptForReply, assistantMessage]
          };
      let extraction;

      try {
        extraction = await aiService.extractProfile({
          transcript: transcriptForExtraction.messages
        });
      } catch (error) {
        if (error instanceof ClaudeUsageLimitError) {
          throw createOnboardingUsageLimitError(error.message, error);
        }

        if (error instanceof ClaudeUpstreamError) {
          throw createOnboardingUpstreamError(error.statusCode, error.retryable, error);
        }

        throw error;
      }

      if (extraction.parseFailureReason === null && extraction.profile) {
        const completeProfile = profileWriteSchema.parse(extraction.profile);
        const transcript = await options.repository.appendMessagesForUser(userId, [userMessage, assistantMessage], {
          forceNewTranscript: shouldForkActiveTranscript
        });

        await options.profileService.upsertProfile(userId, completeProfile, {
          rawChatHistoryId: transcript.id
        });

        const committedTranscript = (await options.repository.getByIdForUser(userId, transcript.id)) ?? transcript;

        return onboardingChatResponseSchema.parse({
          transcript: committedTranscript,
          assistantMessage,
          structuredProfile: {
            status: "complete",
            profile: completeProfile,
            missingFields: [],
            parseFailureReason: null,
            persisted: true
          }
        });
      }

      const transcript = await options.repository.appendMessagesForUser(userId, [userMessage, assistantMessage], {
        forceNewTranscript: shouldForkActiveTranscript
      });

      if (extraction.parseFailureReason === "incomplete") {
        return onboardingChatResponseSchema.parse({
          transcript,
          assistantMessage,
          structuredProfile: {
            status: "incomplete",
            profile: extraction.profile,
            missingFields: extraction.missingFields,
            parseFailureReason: extraction.parseFailureReason,
            persisted: false
          }
        });
      }

      return onboardingChatResponseSchema.parse({
        transcript,
        assistantMessage,
        structuredProfile: {
          status: "invalid",
          profile: null,
          missingFields: extraction.missingFields,
          parseFailureReason: extraction.parseFailureReason,
          persisted: false
        }
      });
    }
  };
}