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
const apiEnvironmentSchema = z
  .object({
    APP_ENV: z.enum(["development", "test", "production"]),
    PORT: z.coerce.number().int().min(1).max(65535),
    DATABASE_URL: databaseUrlSchema,
    APP_SESSION_SECRET: z.string().trim().min(32),
    APP_SESSION_TTL_SECONDS: z.coerce.number().int().positive().max(31_536_000),
    GOOGLE_WEB_CLIENT_ID: z.string().trim().min(1),
    ANTHROPIC_API_KEY: z.string().trim().min(1),
    FRESHFUL_BASE_URL: z.string().trim().url(),
    FRESHFUL_SEARCH_PATH: z.string().trim().startsWith("/"),
    FRESHFUL_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000)
  })
  .strict();

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;

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
  anthropic: {
    apiKey: string;
  };
  freshful: {
    baseUrl: string;
    searchPath: string;
    requestTimeoutMs: number;
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

export function getApiConfig(environment: NodeJS.ProcessEnv = process.env, envFilePath = defaultEnvPath): ApiConfig {
  const mergedEnvironment: Record<string, string | undefined> = {
    APP_ENV: "development",
    PORT: "3000",
    APP_SESSION_TTL_SECONDS: "2592000",
    FRESHFUL_SEARCH_PATH: "/search",
    FRESHFUL_REQUEST_TIMEOUT_MS: "10000",
    ...readApiEnvironmentFile(envFilePath),
    ...environment
  };
  const parsedEnvironment = apiEnvironmentSchema.parse({
    APP_ENV: mergedEnvironment.APP_ENV,
    PORT: mergedEnvironment.PORT,
    DATABASE_URL: mergedEnvironment.DATABASE_URL,
    APP_SESSION_SECRET: mergedEnvironment.APP_SESSION_SECRET,
    APP_SESSION_TTL_SECONDS: mergedEnvironment.APP_SESSION_TTL_SECONDS,
    GOOGLE_WEB_CLIENT_ID: mergedEnvironment.GOOGLE_WEB_CLIENT_ID,
    ANTHROPIC_API_KEY: mergedEnvironment.ANTHROPIC_API_KEY,
    FRESHFUL_BASE_URL: mergedEnvironment.FRESHFUL_BASE_URL,
    FRESHFUL_SEARCH_PATH: mergedEnvironment.FRESHFUL_SEARCH_PATH,
    FRESHFUL_REQUEST_TIMEOUT_MS: mergedEnvironment.FRESHFUL_REQUEST_TIMEOUT_MS
  });

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
    anthropic: {
      apiKey: parsedEnvironment.ANTHROPIC_API_KEY
    },
    freshful: {
      baseUrl: parsedEnvironment.FRESHFUL_BASE_URL,
      searchPath: parsedEnvironment.FRESHFUL_SEARCH_PATH,
      requestTimeoutMs: parsedEnvironment.FRESHFUL_REQUEST_TIMEOUT_MS
    }
  };
}