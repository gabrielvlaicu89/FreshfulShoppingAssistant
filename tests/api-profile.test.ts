import assert from "node:assert/strict";
import test from "node:test";

import type { HouseholdProfile } from "@freshful/contracts";
import { eq } from "drizzle-orm";

import {
  createApiApp,
  createAppSessionIssuer,
  createAppSessionVerifier,
  createAuthUserRepository,
  createHouseholdProfileRepository,
  type ApiConfig,
  type AuthDatabase,
  type AuthenticatedUser
} from "../apps/api/src/index.ts";
import { databaseTables } from "../apps/api/src/db/schema.ts";
import { createMigratedTestDatabase } from "../apps/api/src/db/testing.ts";

const sessionSecret = "abcdefghijklmnopqrstuvwxyz123456";

function createTestApiConfig(): ApiConfig {
  return {
    appEnv: "test",
    port: 3103,
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

function createFixedCurrentDateSessionVerifier(currentDate: Date) {
  return createAppSessionVerifier({
    issuer: "@freshful/api",
    secret: sessionSecret,
    currentDate
  });
}

function createProfileInput(overrides: Partial<Omit<HouseholdProfile, "rawChatHistoryId" | "userId">> = {}) {
  return {
    householdType: "family",
    numChildren: 2,
    dietaryRestrictions: ["vegetarian"],
    allergies: {
      normalized: ["peanuts"],
      freeText: ["cross-contamination"]
    },
    medicalFlags: {
      diabetes: false,
      hypertension: true
    },
    goals: ["maintenance"],
    cuisinePreferences: ["Romanian", "Mediterranean"],
    favoriteIngredients: ["tomatoes", "yogurt"],
    dislikedIngredients: ["celery"],
    budgetBand: "medium",
    maxPrepTimeMinutes: 35,
    cookingSkill: "intermediate",
    ...overrides
  };
}

async function createUserSession(database: AuthDatabase, user: AuthenticatedUser, now: Date) {
  await database.insert(databaseTables.users).values({
    id: user.id,
    googleSubject: `google-${user.id}`,
    email: user.email,
    emailVerified: user.emailVerified,
    displayName: user.displayName,
    photoUrl: user.photoUrl,
    lastLoginAt: user.lastLoginAt
  });

  return createAppSessionIssuer({
    issuer: "@freshful/api",
    secret: sessionSecret,
    ttlSeconds: 3600,
    now: () => now
  }).issue(user);
}

test("authenticated profile routes return the caller's profile only and persist updates", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-22T15:00:00.000Z");
  const primaryUser: AuthenticatedUser = {
    id: "user-1",
    email: "user-1@example.com",
    emailVerified: true,
    displayName: "Primary User",
    photoUrl: null,
    lastLoginAt: fixedNow.toISOString()
  };
  const secondaryUser: AuthenticatedUser = {
    id: "user-2",
    email: "user-2@example.com",
    emailVerified: true,
    displayName: "Secondary User",
    photoUrl: null,
    lastLoginAt: fixedNow.toISOString()
  };
  const primarySession = await createUserSession(database.db as AuthDatabase, primaryUser, fixedNow);
  await createUserSession(database.db as AuthDatabase, secondaryUser, fixedNow);

  await database.db.insert(databaseTables.onboardingTranscripts).values({
    id: "transcript-user-2",
    userId: secondaryUser.id,
    messages: [
      {
        id: "message-user-2",
        role: "assistant",
        content: "Existing onboarding transcript for another user.",
        createdAt: fixedNow.toISOString()
      }
    ],
    containsSensitiveProfileSignals: false
  });

  await database.db.insert(databaseTables.householdProfiles).values({
    id: "profile-user-2",
    userId: secondaryUser.id,
    householdType: "single",
    numChildren: 0,
    dietaryRestrictions: [],
    allergies: {
      normalized: [],
      freeText: []
    },
    medicalFlags: {
      diabetes: false,
      hypertension: false
    },
    goals: ["maintenance"],
    cuisinePreferences: ["Greek"],
    favoriteIngredients: ["olives"],
    dislikedIngredients: ["beets"],
    budgetBand: "low",
    maxPrepTimeMinutes: 20,
    cookingSkill: "beginner",
    rawChatHistoryId: "transcript-user-2",
    containsSensitiveHealthData: false
  });

  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    auth: {
      sessionVerifier: createFixedCurrentDateSessionVerifier(fixedNow),
      userRepository: createAuthUserRepository(database.db as AuthDatabase, {
        now: () => fixedNow
      })
    },
    profile: {
      repository: createHouseholdProfileRepository(database.db, {
        now: () => fixedNow
      })
    }
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const initialGetResponse = await app.inject({
    method: "GET",
    url: "/profile",
    headers: {
      authorization: `Bearer ${primarySession.accessToken}`
    }
  });

  assert.equal(initialGetResponse.statusCode, 200);
  assert.deepEqual(initialGetResponse.json(), { profile: null });

  const putResponse = await app.inject({
    method: "PUT",
    url: "/profile",
    headers: {
      authorization: `Bearer ${primarySession.accessToken}`
    },
    payload: createProfileInput()
  });

  assert.equal(putResponse.statusCode, 200);
  assert.equal(putResponse.json().profile.userId, primaryUser.id);
  assert.equal(putResponse.json().profile.householdType, "family");
  assert.equal(putResponse.json().profile.rawChatHistoryId.length > 0, true);

  const afterPutGetResponse = await app.inject({
    method: "GET",
    url: "/profile",
    headers: {
      authorization: `Bearer ${primarySession.accessToken}`
    }
  });

  assert.equal(afterPutGetResponse.statusCode, 200);
  assert.equal(afterPutGetResponse.json().profile.userId, primaryUser.id);
  assert.equal(afterPutGetResponse.json().profile.rawChatHistoryId, putResponse.json().profile.rawChatHistoryId);

  const storedProfiles = await database.db.select().from(databaseTables.householdProfiles);
  const storedTranscripts = await database.db.select().from(databaseTables.onboardingTranscripts);
  const primaryProfile = storedProfiles.find((profile) => profile.userId === primaryUser.id);
  const secondaryProfile = storedProfiles.find((profile) => profile.userId === secondaryUser.id);
  const primaryTranscript = storedTranscripts.find((transcript) => transcript.id === primaryProfile?.rawChatHistoryId);

  assert.ok(primaryProfile);
  assert.ok(secondaryProfile);
  assert.deepEqual(primaryProfile.medicalFlags, {
    diabetes: false,
    hypertension: true
  });
  assert.equal(secondaryProfile.householdType, "single");
  assert.ok(primaryTranscript);
  assert.equal(primaryTranscript.containsSensitiveProfileSignals, false);
  assert.match(primaryTranscript.messages[0]?.content ?? "", /not duplicated into transcript history/i);
});

test("profile routes reject requests without a valid app session", async (t) => {
  const database = await createMigratedTestDatabase();
  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    auth: {
      userRepository: createAuthUserRepository(database.db as AuthDatabase)
    },
    profile: {
      repository: createHouseholdProfileRepository(database.db)
    }
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/profile"
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().code, "auth.missing_app_session");
});

test("profile routes reject malformed and invalid-signature app sessions", async (t) => {
  const database = await createMigratedTestDatabase();
  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    auth: {
      userRepository: createAuthUserRepository(database.db as AuthDatabase)
    },
    profile: {
      repository: createHouseholdProfileRepository(database.db)
    }
  });
  const invalidSignatureSession = await createAppSessionIssuer({
    issuer: "@freshful/api",
    secret: "different-session-secret-for-invalid-signature-tests",
    ttlSeconds: 3600,
    now: () => new Date("2026-03-22T15:00:00.000Z")
  }).issue({
    id: "user-1",
    email: "user-1@example.com",
    emailVerified: true,
    displayName: "Primary User",
    photoUrl: null,
    lastLoginAt: "2026-03-22T15:00:00.000Z"
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const malformedResponse = await app.inject({
    method: "GET",
    url: "/profile",
    headers: {
      authorization: "Bearer not-a-jwt"
    }
  });

  assert.equal(malformedResponse.statusCode, 401);
  assert.equal(malformedResponse.json().code, "auth.invalid_app_session");

  const invalidSignatureResponse = await app.inject({
    method: "PUT",
    url: "/profile",
    headers: {
      authorization: `Bearer ${invalidSignatureSession.accessToken}`
    },
    payload: createProfileInput()
  });

  assert.equal(invalidSignatureResponse.statusCode, 401);
  assert.equal(invalidSignatureResponse.json().code, "auth.invalid_app_session");
});

test("profile routes reject expired app sessions", async (t) => {
  const database = await createMigratedTestDatabase();
  const issuedAt = new Date("2026-03-22T15:00:00.000Z");
  const expiredSession = await createAppSessionIssuer({
    issuer: "@freshful/api",
    secret: sessionSecret,
    ttlSeconds: 1,
    now: () => issuedAt
  }).issue({
    id: "user-1",
    email: "user-1@example.com",
    emailVerified: true,
    displayName: "Primary User",
    photoUrl: null,
    lastLoginAt: issuedAt.toISOString()
  });
  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    auth: {
      sessionVerifier: createAppSessionVerifier({
        issuer: "@freshful/api",
        secret: sessionSecret,
        currentDate: new Date(issuedAt.getTime() + 5_000)
      }),
      userRepository: createAuthUserRepository(database.db as AuthDatabase)
    },
    profile: {
      repository: createHouseholdProfileRepository(database.db)
    }
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/profile",
    headers: {
      authorization: `Bearer ${expiredSession.accessToken}`
    }
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().code, "auth.expired_app_session");
});

test("PUT /profile rejects validation failures and server-owned fields in the payload", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-22T15:00:00.000Z");
  const user: AuthenticatedUser = {
    id: "user-1",
    email: "user-1@example.com",
    emailVerified: true,
    displayName: "Primary User",
    photoUrl: null,
    lastLoginAt: fixedNow.toISOString()
  };
  const session = await createUserSession(database.db as AuthDatabase, user, fixedNow);
  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    auth: {
      sessionVerifier: createFixedCurrentDateSessionVerifier(fixedNow),
      userRepository: createAuthUserRepository(database.db as AuthDatabase, {
        now: () => fixedNow
      })
    },
    profile: {
      repository: createHouseholdProfileRepository(database.db, {
        now: () => fixedNow
      })
    }
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const response = await app.inject({
    method: "PUT",
    url: "/profile",
    headers: {
      authorization: `Bearer ${session.accessToken}`
    },
    payload: {
      ...createProfileInput({ maxPrepTimeMinutes: 0 }),
      userId: "spoofed-user-id"
    }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, "request.validation_failed");
  assert.equal(response.json().details.requestPart, "body");
  assert.equal(response.json().issues.some((issue: { message: string }) => issue.message.includes("userId")), true);
});

test("PUT /profile stores health-goal-only profiles as sensitive health data", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-22T15:00:00.000Z");
  const user: AuthenticatedUser = {
    id: "user-1",
    email: "user-1@example.com",
    emailVerified: true,
    displayName: "Primary User",
    photoUrl: null,
    lastLoginAt: fixedNow.toISOString()
  };
  const session = await createUserSession(database.db as AuthDatabase, user, fixedNow);
  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    auth: {
      sessionVerifier: createFixedCurrentDateSessionVerifier(fixedNow),
      userRepository: createAuthUserRepository(database.db as AuthDatabase, {
        now: () => fixedNow
      })
    },
    profile: {
      repository: createHouseholdProfileRepository(database.db, {
        now: () => fixedNow
      })
    }
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const response = await app.inject({
    method: "PUT",
    url: "/profile",
    headers: {
      authorization: `Bearer ${session.accessToken}`
    },
    payload: createProfileInput({
      dietaryRestrictions: [],
      allergies: {
        normalized: [],
        freeText: []
      },
      medicalFlags: {
        diabetes: false,
        hypertension: false
      },
      goals: ["weight_loss"]
    })
  });

  assert.equal(response.statusCode, 200);

  const [storedProfile] = await database.db
    .select({
      containsSensitiveHealthData: databaseTables.householdProfiles.containsSensitiveHealthData
    })
    .from(databaseTables.householdProfiles)
    .where(eq(databaseTables.householdProfiles.userId, user.id))
    .limit(1);

  assert.ok(storedProfile);
  assert.equal(storedProfile.containsSensitiveHealthData, true);
});