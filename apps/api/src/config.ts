import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { z } from "zod";

const apiWorkspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultEnvPath = path.join(apiWorkspaceRoot, ".env");
const databaseUrlSchema = z.string().trim().refine(
  (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
  "DATABASE_URL must use postgres:// or postgresql://."
);
const anthropicEnvironmentSchema = z
  .object({
    ANTHROPIC_API_KEY: z.string().trim().min(1),
    ANTHROPIC_BASE_URL: z.string().trim().url(),
    ANTHROPIC_API_VERSION: z.string().trim().min(1),
    ANTHROPIC_MODEL_HAIKU: z.string().trim().min(1),
    ANTHROPIC_MODEL_SONNET: z.string().trim().min(1),
    ANTHROPIC_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000),
    AI_MAX_PROMPT_CHARS: z.coerce.number().int().positive().max(200_000),
    AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().max(16_384),
    AI_MAX_TRANSCRIPT_MESSAGES: z.coerce.number().int().positive().max(200),
    AI_ROUTE_SONNET_MESSAGE_THRESHOLD: z.coerce.number().int().positive().max(200),
    AI_ROUTE_SONNET_CHAR_THRESHOLD: z.coerce.number().int().positive().max(200_000),
    AI_BUDGET_WINDOW_MINUTES: z.coerce.number().int().positive().max(10_080),
    AI_BUDGET_PER_USER_USD: z.coerce.number().nonnegative().max(10_000),
    AI_BUDGET_GLOBAL_USD: z.coerce.number().nonnegative().max(10_000)
  })
  .strict();
const anthropicEnvironmentKeys = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_API_VERSION",
  "ANTHROPIC_MODEL_HAIKU",
  "ANTHROPIC_MODEL_SONNET",
  "ANTHROPIC_REQUEST_TIMEOUT_MS",
  "AI_MAX_PROMPT_CHARS",
  "AI_MAX_OUTPUT_TOKENS",
  "AI_MAX_TRANSCRIPT_MESSAGES",
  "AI_ROUTE_SONNET_MESSAGE_THRESHOLD",
  "AI_ROUTE_SONNET_CHAR_THRESHOLD",
  "AI_BUDGET_WINDOW_MINUTES",
  "AI_BUDGET_PER_USER_USD",
  "AI_BUDGET_GLOBAL_USD"
] as const;
const apiEnvironmentSchema = z
  .object({
    APP_ENV: z.enum(["development", "test", "production"]),
    PORT: z.coerce.number().int().min(1).max(65535),
    DATABASE_URL: databaseUrlSchema,
    APP_SESSION_SECRET: z.string().trim().min(32),
    APP_SESSION_TTL_SECONDS: z.coerce.number().int().positive().max(31_536_000),
    GOOGLE_WEB_CLIENT_ID: z.string().trim().min(1),
    FRESHFUL_BASE_URL: z.string().trim().url(),
    FRESHFUL_SEARCH_PATH: z.string().trim().startsWith("/"),
    FRESHFUL_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000),
    FRESHFUL_MIN_INTERVAL_MS: z.coerce.number().int().nonnegative().max(60_000),
    FRESHFUL_MAX_RETRIES: z.coerce.number().int().nonnegative().max(5),
    FRESHFUL_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().max(60_000)
  })
  .strict();

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
export type AnthropicEnvironment = z.infer<typeof anthropicEnvironmentSchema>;

export interface AnthropicConfig {
  apiKey: string;
  baseUrl: string;
  apiVersion: string;
  requestTimeoutMs: number;
  models: {
    haiku: string;
    sonnet: string;
  };
  usage: {
    maxPromptChars: number;
    maxOutputTokens: number;
    maxTranscriptMessages: number;
  };
  routing: {
    sonnetTranscriptMessageThreshold: number;
    sonnetPromptCharThreshold: number;
  };
  budget?: {
    windowMs: number;
    perUserUsdLimit: number | null;
    globalUsdLimit: number | null;
  };
}

export interface ApiConfig {
  appEnv: ApiEnvironment["APP_ENV"];
  port: number;
  databaseUrl: string;
  session: {
    secret: string;
    ttlSeconds: number;
    issuer: string;
  };
  google: {
    webClientId: string;
  };
  anthropic: AnthropicConfig | null;
  freshful: {
    baseUrl: string;
    searchPath: string;
    requestTimeoutMs: number;
    safeguards?: {
      minIntervalMs: number;
      maxRetries: number;
      retryBaseDelayMs: number;
    };
  };
}

export function resolveApiWorkspacePath(...pathSegments: string[]): string {
  return path.join(apiWorkspaceRoot, ...pathSegments);
}

function readApiEnvironmentFile(envFilePath: string): Record<string, string> {
  if (!fs.existsSync(envFilePath)) {
    return {};
  }

  return dotenv.parse(fs.readFileSync(envFilePath, "utf8"));
}

function resolveAnthropicConfig(environment: Record<string, string | undefined>): AnthropicConfig | null {
  const providedAnthropicKeys = anthropicEnvironmentKeys.filter((key) => {
    const value = environment[key];

    return typeof value === "string" && value.trim().length > 0;
  });

  if (providedAnthropicKeys.length === 0) {
    return null;
  }

  if (!environment.ANTHROPIC_API_KEY?.trim()) {
    throw new Error(
      "Anthropic configuration is incomplete. Provide ANTHROPIC_API_KEY to enable AI features or omit Anthropic settings entirely."
    );
  }

  const parsedEnvironment = anthropicEnvironmentSchema.parse({
    ANTHROPIC_API_KEY: environment.ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL: environment.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com",
    ANTHROPIC_API_VERSION: environment.ANTHROPIC_API_VERSION ?? "2023-06-01",
    ANTHROPIC_MODEL_HAIKU: environment.ANTHROPIC_MODEL_HAIKU ?? "claude-3-5-haiku-latest",
    ANTHROPIC_MODEL_SONNET: environment.ANTHROPIC_MODEL_SONNET ?? "claude-3-7-sonnet-latest",
    ANTHROPIC_REQUEST_TIMEOUT_MS: environment.ANTHROPIC_REQUEST_TIMEOUT_MS ?? "20000",
    AI_MAX_PROMPT_CHARS: environment.AI_MAX_PROMPT_CHARS ?? "16000",
    AI_MAX_OUTPUT_TOKENS: environment.AI_MAX_OUTPUT_TOKENS ?? "1200",
    AI_MAX_TRANSCRIPT_MESSAGES: environment.AI_MAX_TRANSCRIPT_MESSAGES ?? "24",
    AI_ROUTE_SONNET_MESSAGE_THRESHOLD: environment.AI_ROUTE_SONNET_MESSAGE_THRESHOLD ?? "10",
    AI_ROUTE_SONNET_CHAR_THRESHOLD: environment.AI_ROUTE_SONNET_CHAR_THRESHOLD ?? "5000",
    AI_BUDGET_WINDOW_MINUTES: environment.AI_BUDGET_WINDOW_MINUTES ?? "60",
    AI_BUDGET_PER_USER_USD: environment.AI_BUDGET_PER_USER_USD ?? "0",
    AI_BUDGET_GLOBAL_USD: environment.AI_BUDGET_GLOBAL_USD ?? "0"
  });

  return {
    apiKey: parsedEnvironment.ANTHROPIC_API_KEY,
    baseUrl: parsedEnvironment.ANTHROPIC_BASE_URL,
    apiVersion: parsedEnvironment.ANTHROPIC_API_VERSION,
    requestTimeoutMs: parsedEnvironment.ANTHROPIC_REQUEST_TIMEOUT_MS,
    models: {
      haiku: parsedEnvironment.ANTHROPIC_MODEL_HAIKU,
      sonnet: parsedEnvironment.ANTHROPIC_MODEL_SONNET
    },
    usage: {
      maxPromptChars: parsedEnvironment.AI_MAX_PROMPT_CHARS,
      maxOutputTokens: parsedEnvironment.AI_MAX_OUTPUT_TOKENS,
      maxTranscriptMessages: parsedEnvironment.AI_MAX_TRANSCRIPT_MESSAGES
    },
    routing: {
      sonnetTranscriptMessageThreshold: parsedEnvironment.AI_ROUTE_SONNET_MESSAGE_THRESHOLD,
      sonnetPromptCharThreshold: parsedEnvironment.AI_ROUTE_SONNET_CHAR_THRESHOLD
    },
    budget: {
      windowMs: parsedEnvironment.AI_BUDGET_WINDOW_MINUTES * 60_000,
      perUserUsdLimit:
        parsedEnvironment.AI_BUDGET_PER_USER_USD > 0 ? parsedEnvironment.AI_BUDGET_PER_USER_USD : null,
      globalUsdLimit:
        parsedEnvironment.AI_BUDGET_GLOBAL_USD > 0 ? parsedEnvironment.AI_BUDGET_GLOBAL_USD : null
    }
  };
}

export function getApiConfig(environment: NodeJS.ProcessEnv = process.env, envFilePath = defaultEnvPath): ApiConfig {
  const configuredEnvironment: Record<string, string | undefined> = {
    ...readApiEnvironmentFile(envFilePath),
    ...environment
  };
  const mergedEnvironment: Record<string, string | undefined> = {
    APP_ENV: "development",
    PORT: "3000",
    APP_SESSION_TTL_SECONDS: "2592000",
    FRESHFUL_SEARCH_PATH: "/api/v2/shop/search",
    FRESHFUL_REQUEST_TIMEOUT_MS: "10000",
    FRESHFUL_MIN_INTERVAL_MS: "250",
    FRESHFUL_MAX_RETRIES: "2",
    FRESHFUL_RETRY_BASE_DELAY_MS: "300",
    ...configuredEnvironment
  };
  const parsedEnvironment = apiEnvironmentSchema.parse({
    APP_ENV: mergedEnvironment.APP_ENV,
    PORT: mergedEnvironment.PORT,
    DATABASE_URL: mergedEnvironment.DATABASE_URL,
    APP_SESSION_SECRET: mergedEnvironment.APP_SESSION_SECRET,
    APP_SESSION_TTL_SECONDS: mergedEnvironment.APP_SESSION_TTL_SECONDS,
    GOOGLE_WEB_CLIENT_ID: mergedEnvironment.GOOGLE_WEB_CLIENT_ID,
    FRESHFUL_BASE_URL: mergedEnvironment.FRESHFUL_BASE_URL,
    FRESHFUL_SEARCH_PATH: mergedEnvironment.FRESHFUL_SEARCH_PATH,
    FRESHFUL_REQUEST_TIMEOUT_MS: mergedEnvironment.FRESHFUL_REQUEST_TIMEOUT_MS,
    FRESHFUL_MIN_INTERVAL_MS: mergedEnvironment.FRESHFUL_MIN_INTERVAL_MS,
    FRESHFUL_MAX_RETRIES: mergedEnvironment.FRESHFUL_MAX_RETRIES,
    FRESHFUL_RETRY_BASE_DELAY_MS: mergedEnvironment.FRESHFUL_RETRY_BASE_DELAY_MS
  });
  const anthropicConfig = resolveAnthropicConfig(configuredEnvironment);

  return {
    appEnv: parsedEnvironment.APP_ENV,
    port: parsedEnvironment.PORT,
    databaseUrl: parsedEnvironment.DATABASE_URL,
    session: {
      secret: parsedEnvironment.APP_SESSION_SECRET,
      ttlSeconds: parsedEnvironment.APP_SESSION_TTL_SECONDS,
      issuer: "@freshful/api"
    },
    google: {
      webClientId: parsedEnvironment.GOOGLE_WEB_CLIENT_ID
    },
    anthropic: anthropicConfig,
    freshful: {
      baseUrl: parsedEnvironment.FRESHFUL_BASE_URL,
      searchPath: parsedEnvironment.FRESHFUL_SEARCH_PATH,
      requestTimeoutMs: parsedEnvironment.FRESHFUL_REQUEST_TIMEOUT_MS,
      safeguards: {
        minIntervalMs: parsedEnvironment.FRESHFUL_MIN_INTERVAL_MS,
        maxRetries: parsedEnvironment.FRESHFUL_MAX_RETRIES,
        retryBaseDelayMs: parsedEnvironment.FRESHFUL_RETRY_BASE_DELAY_MS
      }
    }
  };
}