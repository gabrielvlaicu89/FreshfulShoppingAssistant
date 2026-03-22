import assert from "node:assert/strict";
import test from "node:test";

import { jwtVerify } from "jose";

import {
  createApiApp,
  createAppSessionIssuer,
  createAuthService,
  createAuthUserRepository,
  createExpiredGoogleTokenError,
  createInvalidGoogleTokenError,
  type ApiConfig,
  type AuthDatabase,
  type AuthenticatedUser,
  type GoogleIdentity,
  type GoogleTokenVerifier
} from "../apps/api/src/index.ts";
import { databaseTables } from "../apps/api/src/db/schema.ts";
import { createMigratedTestDatabase } from "../apps/api/src/db/testing.ts";

const sessionSecret = "abcdefghijklmnopqrstuvwxyz123456";

function createTestApiConfig(): ApiConfig {
  return {
    appEnv: "test",
    port: 3102,
    databaseUrl: "postgres://freshful:freshful@localhost:5432/freshful_test",
    session: {
      secret: sessionSecret,
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

function createValidGoogleIdentity(overrides: Partial<GoogleIdentity> = {}): GoogleIdentity {
  return {
    subject: "google-sub-123",
    email: "user@example.com",
    emailVerified: true,
    displayName: "Freshful User",
    photoUrl: "https://example.com/avatar.png",
    ...overrides
  };
}

test("createAuthService returns session material for a valid Google token", async () => {
  const user: AuthenticatedUser = {
    id: "user-123",
    email: "user@example.com",
    emailVerified: true,
    displayName: "Freshful User",
    photoUrl: "https://example.com/avatar.png",
    lastLoginAt: "2026-03-22T12:00:00.000Z"
  };
  let repositoryCalled = false;
  let sessionCalled = false;
  const service = createAuthService({
    verifier: {
      async verifyIdToken() {
        return createValidGoogleIdentity();
      }
    },
    userRepository: {
      async upsertGoogleUser(identity) {
        repositoryCalled = true;
        assert.equal(identity.subject, "google-sub-123");
        return user;
      }
    },
    sessionIssuer: {
      async issue(issuedUser) {
        sessionCalled = true;
        assert.equal(issuedUser.id, user.id);
        return {
          accessToken: "app-token",
          tokenType: "Bearer",
          expiresAt: "2026-03-22T13:00:00.000Z",
          expiresInSeconds: 3600
        };
      }
    }
  });

  const response = await service.signInWithGoogle({ idToken: "valid-token" });

  assert.equal(repositoryCalled, true);
  assert.equal(sessionCalled, true);
  assert.equal(response.user.id, "user-123");
  assert.equal(response.session.accessToken, "app-token");
});

test("createAuthService rejects invalid Google tokens before persistence", async () => {
  let repositoryCalled = false;
  let sessionCalled = false;
  const service = createAuthService({
    verifier: {
      async verifyIdToken() {
        throw createInvalidGoogleTokenError();
      }
    },
    userRepository: {
      async upsertGoogleUser() {
        repositoryCalled = true;
        throw new Error("should not be called");
      }
    },
    sessionIssuer: {
      async issue() {
        sessionCalled = true;
        throw new Error("should not be called");
      }
    }
  });

  await assert.rejects(service.signInWithGoogle({ idToken: "invalid-token" }), {
    code: "auth.invalid_google_token"
  });
  assert.equal(repositoryCalled, false);
  assert.equal(sessionCalled, false);
});

test("createAuthService rejects expired Google tokens before persistence", async () => {
  let repositoryCalled = false;
  let sessionCalled = false;
  const service = createAuthService({
    verifier: {
      async verifyIdToken() {
        throw createExpiredGoogleTokenError();
      }
    },
    userRepository: {
      async upsertGoogleUser() {
        repositoryCalled = true;
        throw new Error("should not be called");
      }
    },
    sessionIssuer: {
      async issue() {
        sessionCalled = true;
        throw new Error("should not be called");
      }
    }
  });

  await assert.rejects(service.signInWithGoogle({ idToken: "expired-token" }), {
    code: "auth.expired_google_token"
  });
  assert.equal(repositoryCalled, false);
  assert.equal(sessionCalled, false);
});

test("POST /auth/google verifies the token, upserts the user, and returns an app session", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-22T12:00:00.000Z");
  const verifier: GoogleTokenVerifier = {
    async verifyIdToken(idToken) {
      assert.equal(idToken, "valid-token");
      return createValidGoogleIdentity();
    }
  };
  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    auth: {
      verifier,
      userRepository: createAuthUserRepository(database.db as AuthDatabase, {
        now: () => fixedNow
      }),
      sessionIssuer: createAppSessionIssuer({
        issuer: "@freshful/api",
        secret: sessionSecret,
        ttlSeconds: 3600,
        now: () => fixedNow
      })
    }
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/auth/google",
    payload: {
      idToken: "valid-token"
    }
  });

  assert.equal(response.statusCode, 200);

  const payload = response.json();
  const [storedUser] = await database.db.select().from(databaseTables.users);
  const verifiedSession = await jwtVerify(payload.session.accessToken, new TextEncoder().encode(sessionSecret), {
    issuer: "@freshful/api",
    audience: "freshful-mobile",
    currentDate: fixedNow
  });

  assert.equal(payload.user.email, "user@example.com");
  assert.equal(payload.user.lastLoginAt, fixedNow.toISOString());
  assert.equal(payload.session.tokenType, "Bearer");
  assert.equal(payload.session.expiresInSeconds, 3600);
  assert.equal(storedUser.googleSubject, "google-sub-123");
  assert.equal(storedUser.email, "user@example.com");
  assert.equal(verifiedSession.payload.sub, storedUser.id);
  assert.equal(verifiedSession.payload.sessionKind, "app");
});

test("POST /auth/google updates the existing user on repeat sign-in for the same Google subject", async (t) => {
  const database = await createMigratedTestDatabase();
  const firstLoginAt = new Date("2026-03-22T12:00:00.000Z");
  const secondLoginAt = new Date("2026-03-22T12:30:00.000Z");
  let currentNow = firstLoginAt;
  const verifier: GoogleTokenVerifier = {
    async verifyIdToken(idToken) {
      if (idToken === "first-valid-token") {
        return createValidGoogleIdentity();
      }

      if (idToken === "second-valid-token") {
        return createValidGoogleIdentity({
          email: "updated-user@example.com",
          displayName: "Updated Freshful User",
          photoUrl: "https://example.com/updated-avatar.png"
        });
      }

      throw new Error(`Unexpected token: ${idToken}`);
    }
  };
  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    auth: {
      verifier,
      userRepository: createAuthUserRepository(database.db as AuthDatabase, {
        now: () => currentNow
      }),
      sessionIssuer: createAppSessionIssuer({
        issuer: "@freshful/api",
        secret: sessionSecret,
        ttlSeconds: 3600,
        now: () => currentNow
      })
    }
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const firstResponse = await app.inject({
    method: "POST",
    url: "/auth/google",
    payload: {
      idToken: "first-valid-token"
    }
  });

  currentNow = secondLoginAt;

  const secondResponse = await app.inject({
    method: "POST",
    url: "/auth/google",
    payload: {
      idToken: "second-valid-token"
    }
  });

  assert.equal(firstResponse.statusCode, 200);
  assert.equal(secondResponse.statusCode, 200);

  const firstPayload = firstResponse.json();
  const secondPayload = secondResponse.json();
  const storedUsers = await database.db.select().from(databaseTables.users);
  const [storedUser] = storedUsers;
  const verifiedSecondSession = await jwtVerify(
    secondPayload.session.accessToken,
    new TextEncoder().encode(sessionSecret),
    {
      issuer: "@freshful/api",
      audience: "freshful-mobile",
      currentDate: secondLoginAt
    }
  );

  assert.equal(storedUsers.length, 1);
  assert.equal(firstPayload.user.id, secondPayload.user.id);
  assert.equal(secondPayload.user.id, storedUser.id);
  assert.equal(secondPayload.user.email, "updated-user@example.com");
  assert.equal(secondPayload.user.displayName, "Updated Freshful User");
  assert.equal(secondPayload.user.photoUrl, "https://example.com/updated-avatar.png");
  assert.equal(secondPayload.user.lastLoginAt, secondLoginAt.toISOString());
  assert.equal(storedUser.googleSubject, "google-sub-123");
  assert.equal(storedUser.email, "updated-user@example.com");
  assert.equal(storedUser.displayName, "Updated Freshful User");
  assert.equal(storedUser.photoUrl, "https://example.com/updated-avatar.png");
  assert.equal(new Date(String(storedUser.lastLoginAt)).toISOString(), secondLoginAt.toISOString());
  assert.equal(secondPayload.session.tokenType, "Bearer");
  assert.equal(secondPayload.session.expiresInSeconds, 3600);
  assert.equal(verifiedSecondSession.payload.sub, storedUser.id);
  assert.equal(verifiedSecondSession.payload.sessionKind, "app");
});

test("POST /auth/google returns a structured error for invalid Google tokens", async (t) => {
  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    auth: {
      verifier: {
        async verifyIdToken() {
          throw createInvalidGoogleTokenError();
        }
      },
      userRepository: {
        async upsertGoogleUser() {
          throw new Error("should not be called");
        }
      },
      sessionIssuer: {
        async issue() {
          throw new Error("should not be called");
        }
      }
    }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/auth/google",
    payload: {
      idToken: "invalid-token"
    }
  });

  assert.equal(response.statusCode, 401);

  const payload = response.json();

  assert.equal(payload.code, "auth.invalid_google_token");
  assert.equal(payload.message, "The Google identity token is invalid.");
  assert.equal(payload.statusCode, 401);
  assert.equal(typeof payload.requestId, "string");
});

test("POST /auth/google returns a structured error for expired Google tokens", async (t) => {
  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    auth: {
      verifier: {
        async verifyIdToken() {
          throw createExpiredGoogleTokenError();
        }
      },
      userRepository: {
        async upsertGoogleUser() {
          throw new Error("should not be called");
        }
      },
      sessionIssuer: {
        async issue() {
          throw new Error("should not be called");
        }
      }
    }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/auth/google",
    payload: {
      idToken: "expired-token"
    }
  });

  assert.equal(response.statusCode, 401);

  const payload = response.json();

  assert.equal(payload.code, "auth.expired_google_token");
  assert.equal(payload.message, "The Google identity token has expired.");
  assert.equal(payload.statusCode, 401);
  assert.equal(typeof payload.requestId, "string");
});