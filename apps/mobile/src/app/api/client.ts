import { z } from "zod";

import type { MobileConfig } from "../../config";

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

export type AssistantHealth = z.infer<typeof assistantHealthSchema>;

export interface ApiClient {
  config: MobileConfig;
  getAssistantHealth(): Promise<AssistantHealth>;
}

function createRequestUrl(baseUrl: string, pathname: string): string {
  return new URL(pathname, `${baseUrl.replace(/\/+$/u, "")}/`).toString();
}

export function createApiClient(config: MobileConfig): ApiClient {
  return {
    config,
    async getAssistantHealth() {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, config.network.requestTimeoutMs);

      try {
        const response = await fetch(createRequestUrl(config.apiBaseUrl, "health?details=summary"), {
          signal: controller.signal,
          headers: {
            Accept: "application/json"
          }
        });

        if (!response.ok) {
          throw new Error(`Assistant health request failed with status ${response.status}.`);
        }

        return assistantHealthSchema.parse(await response.json());
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}