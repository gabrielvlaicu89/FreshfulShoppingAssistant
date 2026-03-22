import { errorPayloadSchema, householdProfileSchema, type HouseholdProfile } from "@freshful/contracts";
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

export type AssistantHealth = z.infer<typeof assistantHealthSchema>;

export interface ApiClient {
  config: MobileConfig;
  getAssistantHealth(): Promise<AssistantHealth>;
  exchangeGoogleIdToken(idToken: string): Promise<AuthSessionRecord>;
  getProfile(accessToken: string): Promise<HouseholdProfile | null>;
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
    }
  };
}