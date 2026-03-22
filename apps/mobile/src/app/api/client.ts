import {
  allergiesSchema,
  budgetBandValues,
  cookingSkillValues,
  dietaryRestrictionValues,
  errorPayloadSchema,
  healthGoalValues,
  householdProfileSchema,
  householdTypeValues,
  medicalFlagsSchema,
  onboardingChatMessageSchema,
  onboardingTranscriptSchema,
  type HouseholdProfile,
  type OnboardingTranscript
} from "@freshful/contracts";
import { z } from "zod";

import type { MobileConfig } from "../../config";
import { authSessionRecordSchema, type AuthSessionRecord } from "../auth/contracts";

const apiServiceStatusSchema = z
  .object({
    name: z.string().trim().min(1),
    status: z.enum(["pending", "ready"])
  })
  .strict();

const assistantHealthSchema = z
  .object({
    status: z.literal("ok"),
    service: z.literal("@freshful/api"),
    environment: z.enum(["development", "test", "production"]),
    detailLevel: z.enum(["summary", "full"]),
    timestamp: z.string().datetime(),
    uptimeSeconds: z.number().nonnegative(),
    services: z
      .object({
        auth: apiServiceStatusSchema,
        ai: apiServiceStatusSchema,
        planner: apiServiceStatusSchema,
        freshful: apiServiceStatusSchema
      })
      .strict()
  })
  .strict();

const profileResponseSchema = z
  .object({
    profile: householdProfileSchema.nullable()
  })
  .strict();

export const editableProfileSchema = z
  .object({
    householdType: z.enum(householdTypeValues),
    numChildren: z.number().int().min(0),
    dietaryRestrictions: z.array(z.enum(dietaryRestrictionValues)),
    allergies: allergiesSchema,
    medicalFlags: medicalFlagsSchema,
    goals: z.array(z.enum(healthGoalValues)),
    cuisinePreferences: z.array(z.string().trim().min(1)),
    favoriteIngredients: z.array(z.string().trim().min(1)),
    dislikedIngredients: z.array(z.string().trim().min(1)),
    budgetBand: z.enum(budgetBandValues),
    maxPrepTimeMinutes: z.number().int().positive(),
    cookingSkill: z.enum(cookingSkillValues)
  })
  .strict();

export const partialEditableProfileSchema = editableProfileSchema.deepPartial();

const onboardingStructuredProfileSchema = z
  .object({
    status: z.enum(["complete", "incomplete", "invalid"]),
    profile: partialEditableProfileSchema.nullable(),
    missingFields: z.array(z.string().trim().min(1)),
    parseFailureReason: z.enum(["incomplete", "missing_json", "invalid_json", "schema_mismatch"]).nullable(),
    persisted: z.boolean()
  })
  .strict();

const onboardingChatResponseSchema = z
  .object({
    transcript: onboardingTranscriptSchema,
    assistantMessage: onboardingChatMessageSchema,
    structuredProfile: onboardingStructuredProfileSchema
  })
  .strict();

const profileUpsertResponseSchema = z
  .object({
    profile: householdProfileSchema
  })
  .strict();

export type AssistantHealth = z.infer<typeof assistantHealthSchema>;
export type EditableProfile = z.infer<typeof editableProfileSchema>;
export type PartialEditableProfile = z.infer<typeof partialEditableProfileSchema>;
export type OnboardingStructuredProfile = z.infer<typeof onboardingStructuredProfileSchema>;

export interface OnboardingChatResponse {
  transcript: OnboardingTranscript;
  assistantMessage: z.infer<typeof onboardingChatMessageSchema>;
  structuredProfile: OnboardingStructuredProfile;
}

export interface ApiClient {
  config: MobileConfig;
  getAssistantHealth(): Promise<AssistantHealth>;
  exchangeGoogleIdToken(idToken: string): Promise<AuthSessionRecord>;
  getProfile(accessToken: string): Promise<HouseholdProfile | null>;
  updateProfile(accessToken: string, profile: EditableProfile): Promise<HouseholdProfile>;
  sendOnboardingMessage(accessToken: string, message: string): Promise<OnboardingChatResponse>;
}

function createRequestUrl(baseUrl: string, pathname: string): string {
  return new URL(pathname, `${baseUrl.replace(/\/+$/u, "")}/`).toString();
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const payload = errorPayloadSchema.safeParse(await response.json());

    if (payload.success) {
      return payload.data.message;
    }
  } catch {
    return `Request failed with status ${response.status}.`;
  }

  return `Request failed with status ${response.status}.`;
}

async function requestJson<TOutput>(
  config: MobileConfig,
  pathname: string,
  init: RequestInit,
  schema: z.ZodType<TOutput>
): Promise<TOutput> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, config.network.requestTimeoutMs);

  try {
    const response = await fetch(createRequestUrl(config.apiBaseUrl, pathname), {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init.headers ?? {})
      }
    });

    if (!response.ok) {
      throw new Error(await parseErrorMessage(response));
    }

    return schema.parse(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

export function createApiClient(config: MobileConfig): ApiClient {
  return {
    config,
    async getAssistantHealth() {
      return requestJson(config, "health?details=summary", { method: "GET" }, assistantHealthSchema);
    },
    async exchangeGoogleIdToken(idToken) {
      return requestJson(
        config,
        "auth/google",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ idToken })
        },
        authSessionRecordSchema
      );
    },
    async getProfile(accessToken) {
      const response = await requestJson(
        config,
        "profile",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        },
        profileResponseSchema
      );

      return response.profile;
    },
    async updateProfile(accessToken, profile) {
      const response = await requestJson(
        config,
        "profile",
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(profile)
        },
        profileUpsertResponseSchema
      );

      return response.profile;
    },
    async sendOnboardingMessage(accessToken, message) {
      return requestJson(
        config,
        "ai/onboarding-chat",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ message })
        },
        onboardingChatResponseSchema
      );
    }
  };
}