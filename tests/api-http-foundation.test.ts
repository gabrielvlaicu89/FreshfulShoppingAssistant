import assert from "node:assert/strict";
import test from "node:test";

import { createApiApp } from "../apps/api/src/index.ts";
import type { ApiConfig } from "../apps/api/src/config.ts";

function createTestApiConfig(): ApiConfig {
  return {
    appEnv: "test",
    port: 3101,
    databaseUrl: "postgres://freshful:freshful@localhost:5432/freshful_test",
    session: {
      secret: "abcdefghijklmnopqrstuvwxyz123456",
      ttlSeconds: 3600,
      issuer: "@freshful/api"
    },
    google: {
      webClientId: "test-web-client.apps.googleusercontent.com"
    },
    anthropic: {
      apiKey: "test-anthropic-key"
    },
    freshful: {
      baseUrl: "https://www.freshful.ro",
      searchPath: "/search",
      requestTimeoutMs: 10000
    }
  };
}

test("createApiApp readies the Fastify foundation without binding a network port", async (t) => {
  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  await app.ready();

  assert.equal(app.appContext.config.appEnv, "test");
  assert.equal(app.appContext.services.auth.status, "ready");
});

test("GET /health returns the backend foundation status and service shell metadata", async (t) => {
  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    services: {
      planner: {
        name: "planner",
        status: "ready",
        implementation: {
          stage: "foundation"
        }
      }
    }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/health?details=full"
  });

  assert.equal(response.statusCode, 200);

  const payload = response.json();

  assert.equal(payload.status, "ok");
  assert.equal(payload.service, "@freshful/api");
  assert.equal(payload.environment, "test");
  assert.equal(payload.detailLevel, "full");
  assert.equal(payload.services.auth.status, "ready");
  assert.equal(payload.services.planner.status, "ready");
  assert.equal(typeof payload.timestamp, "string");
  assert.equal(typeof payload.uptimeSeconds, "number");
});

test("GET /health returns a structured validation error for unsupported query values", async (t) => {
  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/health?details=invalid"
  });

  assert.equal(response.statusCode, 400);

  const payload = response.json();

  assert.equal(payload.code, "request.validation_failed");
  assert.equal(payload.message, "Request validation failed.");
  assert.equal(payload.statusCode, 400);
  assert.equal(payload.details.requestPart, "query");
  assert.equal(Array.isArray(payload.issues), true);
});
