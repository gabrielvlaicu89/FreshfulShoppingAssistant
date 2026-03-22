import { onboardingChatMessageSchema, onboardingTranscriptSchema } from "@freshful/contracts";
import { z } from "zod";

import { partialProfileWriteSchema } from "../profile/contracts.js";

const trimmedStringSchema = z.string().trim().min(1);

export const onboardingProfileParseFailureReasonValues = [
  "incomplete",
  "missing_json",
  "invalid_json",
  "schema_mismatch"
] as const;

export const onboardingChatRequestSchema = z
  .object({
    message: trimmedStringSchema
  })
  .strict();

export type OnboardingChatRequest = z.infer<typeof onboardingChatRequestSchema>;

export const onboardingStructuredProfileSchema = z
  .object({
    status: z.enum(["complete", "incomplete", "invalid"]),
    profile: partialProfileWriteSchema.nullable(),
    missingFields: z.array(trimmedStringSchema),
    parseFailureReason: z.enum(onboardingProfileParseFailureReasonValues).nullable(),
    persisted: z.boolean()
  })
  .strict();

export type OnboardingStructuredProfile = z.infer<typeof onboardingStructuredProfileSchema>;

export const onboardingChatResponseSchema = z
  .object({
    transcript: onboardingTranscriptSchema,
    assistantMessage: onboardingChatMessageSchema,
    structuredProfile: onboardingStructuredProfileSchema
  })
  .strict();

export type OnboardingChatResponse = z.infer<typeof onboardingChatResponseSchema>;