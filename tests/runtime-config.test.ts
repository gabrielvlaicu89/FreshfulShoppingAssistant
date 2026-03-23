import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getApiConfig } from "../apps/api/src/config.ts";
import { getDatabaseConfig } from "../apps/api/src/db/config.ts";
import { getMobileConfig } from "../apps/mobile/src/config.ts";

function createTemporaryEnvFile(fileName: string, contents: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "freshful-config-"));
  const envFilePath = path.join(directory, fileName);

  fs.writeFileSync(envFilePath, contents);

  return envFilePath;
}

function extractEnvKeys(filePath: string): string[] {
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => line.split("=", 1)[0]);
}

test("getApiConfig loads validated backend settings from an env file", () => {
  const envFilePath = createTemporaryEnvFile(
    ".env.api",
    [
      "APP_ENV=test",
      "PORT=4100",
      "DATABASE_URL=postgres://freshful:freshful@localhost:5432/freshful_test",
      "APP_SESSION_SECRET=abcdefghijklmnopqrstuvwxyz123456",
      "APP_SESSION_TTL_SECONDS=7200",
      "GOOGLE_WEB_CLIENT_ID=test-web-client.apps.googleusercontent.com",
      "ANTHROPIC_API_KEY=test-anthropic-key",
      "ANTHROPIC_BASE_URL=https://api.anthropic.com",
      "ANTHROPIC_API_VERSION=2023-06-01",
      "ANTHROPIC_MODEL_HAIKU=claude-3-5-haiku-latest",
      "ANTHROPIC_MODEL_SONNET=claude-3-7-sonnet-latest",
      "ANTHROPIC_REQUEST_TIMEOUT_MS=19000",
      "AI_MAX_PROMPT_CHARS=12000",
      "AI_MAX_OUTPUT_TOKENS=1400",
      "AI_MAX_TRANSCRIPT_MESSAGES=18",
      "AI_ROUTE_SONNET_MESSAGE_THRESHOLD=9",
      "AI_ROUTE_SONNET_CHAR_THRESHOLD=4200",
      "FRESHFUL_BASE_URL=https://staging.freshful.ro",
      "FRESHFUL_SEARCH_PATH=/api/catalog/search",
      "FRESHFUL_REQUEST_TIMEOUT_MS=15000"
    ].join("\n")
  );

  const config = getApiConfig({}, envFilePath);

  assert.deepEqual(config, {
    appEnv: "test",
    port: 4100,
    databaseUrl: "postgres://freshful:freshful@localhost:5432/freshful_test",
    session: {
      secret: "abcdefghijklmnopqrstuvwxyz123456",
      ttlSeconds: 7200,
      issuer: "@freshful/api"
    },
    google: {
      webClientId: "test-web-client.apps.googleusercontent.com"
    },
    anthropic: {
      apiKey: "test-anthropic-key",
      baseUrl: "https://api.anthropic.com",
      apiVersion: "2023-06-01",
      requestTimeoutMs: 19000,
      models: {
        haiku: "claude-3-5-haiku-latest",
        sonnet: "claude-3-7-sonnet-latest"
      },
      usage: {
        maxPromptChars: 12000,
        maxOutputTokens: 1400,
        maxTranscriptMessages: 18
      },
      routing: {
        sonnetTranscriptMessageThreshold: 9,
        sonnetPromptCharThreshold: 4200
      }
    },
    freshful: {
      baseUrl: "https://staging.freshful.ro",
      searchPath: "/api/catalog/search",
      requestTimeoutMs: 15000
    }
  });
});

test("getApiConfig allows backend startup without Anthropic settings", () => {
  const envFilePath = createTemporaryEnvFile(
    ".env.api",
    [
      "APP_ENV=test",
      "PORT=4100",
      "DATABASE_URL=postgres://freshful:freshful@localhost:5432/freshful_test",
      "APP_SESSION_SECRET=abcdefghijklmnopqrstuvwxyz123456",
      "APP_SESSION_TTL_SECONDS=7200",
      "GOOGLE_WEB_CLIENT_ID=test-web-client.apps.googleusercontent.com",
      "FRESHFUL_BASE_URL=https://staging.freshful.ro",
      "FRESHFUL_SEARCH_PATH=/api/catalog/search",
      "FRESHFUL_REQUEST_TIMEOUT_MS=15000"
    ].join("\n")
  );

  const config = getApiConfig({}, envFilePath);

  assert.equal(config.anthropic, null);
});

test("getApiConfig defaults the Freshful search path to the confirmed shop search surface", () => {
  const envFilePath = createTemporaryEnvFile(
    ".env.api",
    [
      "APP_ENV=test",
      "PORT=4100",
      "DATABASE_URL=postgres://freshful:freshful@localhost:5432/freshful_test",
      "APP_SESSION_SECRET=abcdefghijklmnopqrstuvwxyz123456",
      "APP_SESSION_TTL_SECONDS=7200",
      "GOOGLE_WEB_CLIENT_ID=test-web-client.apps.googleusercontent.com",
      "FRESHFUL_BASE_URL=https://staging.freshful.ro",
      "FRESHFUL_REQUEST_TIMEOUT_MS=15000"
    ].join("\n")
  );

  const config = getApiConfig({}, envFilePath);

  assert.equal(config.freshful.searchPath, "/api/v2/shop/search");
});

test("getDatabaseConfig accepts DB-only runtime input without unrelated backend secrets", () => {
  const envFilePath = createTemporaryEnvFile(
    ".env.db",
    ["DATABASE_URL=postgres://freshful:freshful@localhost:5432/freshful_test"].join("\n")
  );

  const config = getDatabaseConfig({}, envFilePath);

  assert.equal(config.DATABASE_URL, "postgres://freshful:freshful@localhost:5432/freshful_test");
});

test("getMobileConfig parses injected runtime values without filesystem access", () => {
  const config = getMobileConfig({
    API_BASE_URL: "http://10.0.2.2:3000",
    GOOGLE_ANDROID_CLIENT_ID: "test-android-client.apps.googleusercontent.com",
    GOOGLE_WEB_CLIENT_ID: "test-web-client.apps.googleusercontent.com",
    API_REQUEST_TIMEOUT_MS: "12000"
  });

  assert.deepEqual(config, {
    appEnv: "development",
    apiBaseUrl: "http://10.0.2.2:3000",
    google: {
      androidClientId: "test-android-client.apps.googleusercontent.com",
      webClientId: "test-web-client.apps.googleusercontent.com"
    },
    network: {
      requestTimeoutMs: 12000
    }
  });
});

test("env example files document the required backend and mobile keys", () => {
  const rootDirectory = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const apiEnvKeys = extractEnvKeys(path.join(rootDirectory, "apps/api/.env.example"));
  const mobileEnvKeys = extractEnvKeys(path.join(rootDirectory, "apps/mobile/.env.example"));

  assert.deepEqual(apiEnvKeys, [
    "APP_ENV",
    "PORT",
    "DATABASE_URL",
    "APP_SESSION_SECRET",
    "APP_SESSION_TTL_SECONDS",
    "GOOGLE_WEB_CLIENT_ID",
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
    "FRESHFUL_BASE_URL",
    "FRESHFUL_SEARCH_PATH",
    "FRESHFUL_REQUEST_TIMEOUT_MS"
  ]);
  assert.deepEqual(mobileEnvKeys, [
    "APP_ENV",
    "API_BASE_URL",
    "GOOGLE_ANDROID_CLIENT_ID",
    "GOOGLE_WEB_CLIENT_ID",
    "API_REQUEST_TIMEOUT_MS"
  ]);
});