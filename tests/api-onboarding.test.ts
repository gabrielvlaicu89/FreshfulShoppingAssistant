import assert from "node:assert/strict";
import test from "node:test";

import { and, eq } from "drizzle-orm";

import {
  ClaudeUpstreamError,
  ClaudeUsageLimitError,
  createApiApp,
  createAppSessionIssuer,
  createAppSessionVerifier,
  createAuthUserRepository,
  createHouseholdProfileRepository,
  createOnboardingTranscriptRepository,
  type ApiConfig,
  type AuthDatabase,
  type AuthenticatedUser,
  type ClaudeService
} from "../apps/api/src/index.ts";
import { databaseTables } from "../apps/api/src/db/schema.ts";
import { createMigratedTestDatabase } from "../apps/api/src/db/testing.ts";

const sessionSecret = "abcdefghijklmnopqrstuvwxyz123456";

function createTestApiConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    appEnv: "test",
    port: 3105,
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
      apiKey: "test-anthropic-key",
      baseUrl: "https://api.anthropic.com",
      apiVersion: "2023-06-01",
      requestTimeoutMs: 20000,
      models: {
        haiku: "claude-3-5-haiku-latest",
        sonnet: "claude-3-7-sonnet-latest"
      },
      usage: {
        maxPromptChars: 16000,
        maxOutputTokens: 1200,
        maxTranscriptMessages: 24
      },
      routing: {
        sonnetTranscriptMessageThreshold: 10,
        sonnetPromptCharThreshold: 5000
      }
    },
    freshful: {
      baseUrl: "https://www.freshful.ro",
      searchPath: "/search",
      requestTimeoutMs: 10000
    },
    ...overrides
  };
}

function createFixedCurrentDateSessionVerifier(currentDate: Date) {
  return createAppSessionVerifier({
    issuer: "@freshful/api",
    secret: sessionSecret,
    currentDate
  });
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

function createUser(id: string, now: Date): AuthenticatedUser {
  return {
    id,
    email: `${id}@example.com`,
    emailVerified: true,
    displayName: id,
    photoUrl: null,
    lastLoginAt: now.toISOString()
  };
}

type ExtractProfileResult = Awaited<ReturnType<ClaudeService["extractProfile"]>>;

function createClaudeServiceDouble(options: {
  reply?: string;
  extraction?: ExtractProfileResult;
  inspectReplyTranscript?: (transcript: Parameters<ClaudeService["createOnboardingReply"]>[0]["transcript"]) => void;
  inspectExtractionTranscript?: (transcript: Parameters<ClaudeService["extractProfile"]>[0]["transcript"]) => void;
  createReplyError?: Error;
  extractError?: Error;
}): ClaudeService {
  return {
    async createOnboardingReply(request) {
      options.inspectReplyTranscript?.(request.transcript);

      if (options.createReplyError) {
        throw options.createReplyError;
      }

      return {
        assistantMessage: options.reply ?? "Am notat.",
        usage: {
          model: "claude-3-5-haiku-latest",
          modelTier: "haiku",
          routeReason: "test",
          inputTokens: 11,
          outputTokens: 12
        }
      };
    },
    async extractProfile(request) {
      options.inspectExtractionTranscript?.(request.transcript);

      if (options.extractError) {
        throw options.extractError;
      }

      assert.ok(options.extraction);

      return options.extraction;
    }
  };
}

function createQueuedClaudeServiceDouble(
  steps: Array<{
    reply: string;
    extraction: ExtractProfileResult;
    inspectReplyTranscript?: (transcript: Parameters<ClaudeService["createOnboardingReply"]>[0]["transcript"]) => void;
  }>
): ClaudeService {
  let requestIndex = 0;

  return {
    async createOnboardingReply(request) {
      const step = steps[requestIndex];

      assert.ok(step, `Missing queued onboarding reply for request ${requestIndex}.`);
      step.inspectReplyTranscript?.(request.transcript);

      return {
        assistantMessage: step.reply,
        usage: {
          model: "claude-3-5-haiku-latest",
          modelTier: "haiku",
          routeReason: "test",
          inputTokens: 11,
          outputTokens: 12
        }
      };
    },
    async extractProfile() {
      const step = steps[requestIndex];

      assert.ok(step, `Missing queued onboarding extraction for request ${requestIndex}.`);
      requestIndex += 1;

      return step.extraction;
    }
  };
}

function createBarrier(targetCount: number) {
  let arrivals = 0;
  let releaseBarrier: (() => void) | undefined;
  const releasePromise = new Promise<void>((resolve) => {
    releaseBarrier = resolve;
  });

  return {
    async wait() {
      arrivals += 1;

      if (arrivals === targetCount) {
        releaseBarrier?.();
      }

      await releasePromise;
    }
  };
}

test("POST /ai/onboarding-chat persists transcript history and saves a complete structured profile", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-22T18:00:00.000Z");
  const user = createUser("onboarding-user-complete", fixedNow);
  const session = await createUserSession(database.db as AuthDatabase, user, fixedNow);
  let replyTranscriptLength = 0;
  let extractionTranscriptLength = 0;
  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    services: {
      ai: {
        name: "ai",
        status: "ready",
        implementation: createClaudeServiceDouble({
          reply: "Perfect. Ce buget lunar vrei sa respectam?",
          inspectReplyTranscript(transcript) {
            replyTranscriptLength = transcript.length;
          },
          inspectExtractionTranscript(transcript) {
            extractionTranscriptLength = transcript.length;
          },
          extraction: {
            profile: {
              householdType: "family",
              numChildren: 1,
              dietaryRestrictions: ["vegetarian"],
              allergies: {
                normalized: ["peanuts"],
                freeText: []
              },
              medicalFlags: {
                diabetes: false,
                hypertension: false
              },
              goals: ["maintenance"],
              cuisinePreferences: ["Romanian"],
              favoriteIngredients: ["tomatoes"],
              dislikedIngredients: ["celery"],
              budgetBand: "medium",
              maxPrepTimeMinutes: 30,
              cookingSkill: "intermediate"
            },
            rawText: "{}",
            missingFields: [],
            parseFailureReason: null,
            usage: {
              model: "claude-3-7-sonnet-latest",
              modelTier: "sonnet",
              routeReason: "test",
              inputTokens: 21,
              outputTokens: 22
            }
          }
        })
      }
    },
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
    },
    onboarding: {
      repository: createOnboardingTranscriptRepository(database.db, {
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
    url: "/ai/onboarding-chat",
    headers: {
      authorization: `Bearer ${session.accessToken}`
    },
    payload: {
      message: "Suntem doi adulti si un copil. Gatim vegetarian in 30 de minute."
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(replyTranscriptLength, 1);
  assert.equal(extractionTranscriptLength, 2);
  assert.equal(response.json().assistantMessage.role, "assistant");
  assert.equal(response.json().structuredProfile.status, "complete");
  assert.equal(response.json().structuredProfile.persisted, true);
  assert.equal(response.json().structuredProfile.profile.householdType, "family");
  assert.equal(response.json().transcript.messages.length, 2);
  assert.equal(response.json().transcript.messages[0].role, "user");
  assert.equal(response.json().transcript.messages[1].role, "assistant");

  const [storedTranscript] = await database.db
    .select()
    .from(databaseTables.onboardingTranscripts)
    .where(eq(databaseTables.onboardingTranscripts.userId, user.id));
  const [storedProfile] = await database.db
    .select()
    .from(databaseTables.householdProfiles)
    .where(eq(databaseTables.householdProfiles.userId, user.id));

  assert.ok(storedTranscript);
  assert.ok(storedProfile);
  assert.equal(storedTranscript.containsSensitiveProfileSignals, true);
  assert.equal(storedTranscript.messages.length, 2);
  assert.equal(response.json().transcript.householdProfileId, storedProfile.id);
  assert.equal(storedTranscript.householdProfileId, storedProfile.id);
  assert.equal(storedProfile.rawChatHistoryId, storedTranscript.id);
  assert.deepEqual(storedProfile.dietaryRestrictions, ["vegetarian"]);
});

test("POST /ai/onboarding-chat preserves canonical transcript provenance until a complete saved-profile update is committed", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-22T18:03:00.000Z");
  const user = createUser("onboarding-user-stateful", fixedNow);
  const session = await createUserSession(database.db as AuthDatabase, user, fixedNow);
  const profileId = "existing-profile-id";
  let followUpReplyTranscriptContents: string[] = [];
  let resumedDraftReplyTranscriptContents: string[] = [];

  await database.db.insert(databaseTables.onboardingTranscripts).values({
    id: "saved-profile-transcript",
    userId: user.id,
    householdProfileId: profileId,
    messages: [
      {
        id: "saved-profile-message",
        role: "assistant",
        content: "Profilul initial a fost salvat deja.",
        createdAt: fixedNow.toISOString()
      }
    ],
    containsSensitiveProfileSignals: true,
    createdAt: fixedNow.toISOString(),
    updatedAt: fixedNow.toISOString()
  });

  await database.db.insert(databaseTables.householdProfiles).values({
    id: profileId,
    userId: user.id,
    householdType: "couple",
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
    cuisinePreferences: ["Romanian"],
    favoriteIngredients: ["tomatoes"],
    dislikedIngredients: ["celery"],
    budgetBand: "medium",
    maxPrepTimeMinutes: 30,
    cookingSkill: "intermediate",
    rawChatHistoryId: "saved-profile-transcript",
    containsSensitiveHealthData: true,
    createdAt: fixedNow.toISOString(),
    updatedAt: fixedNow.toISOString()
  });

  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    services: {
      ai: {
        name: "ai",
        status: "ready",
        implementation: createQueuedClaudeServiceDouble([
          {
            reply: "Mai am nevoie de alergii si timpul maxim de preparare.",
            extraction: {
              profile: {
                householdType: "couple",
                budgetBand: "medium"
              },
              rawText: "{}",
              missingFields: ["allergies", "maxPrepTimeMinutes", "cookingSkill"],
              parseFailureReason: "incomplete",
              usage: {
                model: "claude-3-7-sonnet-latest",
                modelTier: "sonnet",
                routeReason: "test",
                inputTokens: 21,
                outputTokens: 22
              }
            }
          },
          {
            reply: "Am inteles, dar raspunsul precedent nu a putut fi validat complet.",
            extraction: {
              profile: null,
              rawText: "not valid json",
              missingFields: [],
              parseFailureReason: "invalid_json",
              usage: {
                model: "claude-3-7-sonnet-latest",
                modelTier: "sonnet",
                routeReason: "test",
                inputTokens: 23,
                outputTokens: 24
              }
            }
          },
          {
            reply: "Perfect, profilul este complet si il salvez.",
            extraction: {
              profile: {
                householdType: "family",
                numChildren: 1,
                dietaryRestrictions: ["vegetarian"],
                allergies: {
                  normalized: ["peanuts"],
                  freeText: []
                },
                medicalFlags: {
                  diabetes: false,
                  hypertension: false
                },
                goals: ["maintenance"],
                cuisinePreferences: ["Romanian"],
                favoriteIngredients: ["tomatoes"],
                dislikedIngredients: ["celery"],
                budgetBand: "medium",
                maxPrepTimeMinutes: 25,
                cookingSkill: "intermediate"
              },
              rawText: "{}",
              missingFields: [],
              parseFailureReason: null,
              usage: {
                model: "claude-3-7-sonnet-latest",
                modelTier: "sonnet",
                routeReason: "test",
                inputTokens: 25,
                outputTokens: 26
              }
            }
          },
          {
            reply: "Continui de la profilul proaspat salvat si mai am nevoie de cateva detalii.",
            inspectReplyTranscript(transcript) {
              followUpReplyTranscriptContents = transcript.map((message) => message.content);
            },
            extraction: {
              profile: {
                householdType: "family",
                budgetBand: "medium"
              },
              rawText: "{}",
              missingFields: ["allergies", "goals", "cookingSkill"],
              parseFailureReason: "incomplete",
              usage: {
                model: "claude-3-7-sonnet-latest",
                modelTier: "sonnet",
                routeReason: "test",
                inputTokens: 27,
                outputTokens: 28
              }
            }
          },
          {
            reply: "Continui din draftul activ si notez preferinta pentru cine simple.",
            inspectReplyTranscript(transcript) {
              resumedDraftReplyTranscriptContents = transcript.map((message) => message.content);
            },
            extraction: {
              profile: {
                householdType: "family",
                budgetBand: "medium"
              },
              rawText: "{}",
              missingFields: ["allergies", "goals", "cookingSkill"],
              parseFailureReason: "incomplete",
              usage: {
                model: "claude-3-7-sonnet-latest",
                modelTier: "sonnet",
                routeReason: "test",
                inputTokens: 29,
                outputTokens: 30
              }
            }
          }
        ])
      }
    },
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
    },
    onboarding: {
      repository: createOnboardingTranscriptRepository(database.db, {
        now: () => fixedNow
      })
    }
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const incompleteResponse = await app.inject({
    method: "POST",
    url: "/ai/onboarding-chat",
    headers: {
      authorization: `Bearer ${session.accessToken}`
    },
    payload: {
      message: "Vrem sa ajustam profilul existent."
    }
  });

  assert.equal(incompleteResponse.statusCode, 200);
  assert.equal(incompleteResponse.json().structuredProfile.status, "incomplete");
  assert.equal(incompleteResponse.json().structuredProfile.persisted, false);
  assert.equal(incompleteResponse.json().transcript.householdProfileId, undefined);
  assert.equal(incompleteResponse.json().transcript.messages.length, 3);

  const [profileAfterIncomplete] = await database.db
    .select()
    .from(databaseTables.householdProfiles)
    .where(eq(databaseTables.householdProfiles.userId, user.id));
  const transcriptsAfterIncomplete = await database.db
    .select()
    .from(databaseTables.onboardingTranscripts)
    .where(eq(databaseTables.onboardingTranscripts.userId, user.id));
  const incompleteTranscript = transcriptsAfterIncomplete.find((transcript) => transcript.id !== "saved-profile-transcript");
  const savedTranscriptAfterIncomplete = transcriptsAfterIncomplete.find(
    (transcript) => transcript.id === "saved-profile-transcript"
  );

  assert.ok(profileAfterIncomplete);
  assert.equal(profileAfterIncomplete.rawChatHistoryId, "saved-profile-transcript");
  assert.ok(incompleteTranscript);
  assert.equal(incompleteTranscript.householdProfileId, null);
  assert.equal(incompleteTranscript.messages.length, 3);
  assert.ok(savedTranscriptAfterIncomplete);
  assert.equal(savedTranscriptAfterIncomplete.messages.length, 1);
  assert.equal(savedTranscriptAfterIncomplete.householdProfileId, profileId);

  const invalidResponse = await app.inject({
    method: "POST",
    url: "/ai/onboarding-chat",
    headers: {
      authorization: `Bearer ${session.accessToken}`
    },
    payload: {
      message: "Nu exista alergii, doar avem nevoie de mai multa varietate."
    }
  });

  assert.equal(invalidResponse.statusCode, 200);
  assert.equal(invalidResponse.json().structuredProfile.status, "invalid");
  assert.equal(invalidResponse.json().structuredProfile.persisted, false);
  assert.equal(invalidResponse.json().transcript.id, incompleteTranscript.id);
  assert.equal(invalidResponse.json().transcript.messages.length, 5);

  const [profileAfterInvalid] = await database.db
    .select()
    .from(databaseTables.householdProfiles)
    .where(eq(databaseTables.householdProfiles.userId, user.id));
  const [invalidDraftTranscript] = await database.db
    .select()
    .from(databaseTables.onboardingTranscripts)
    .where(eq(databaseTables.onboardingTranscripts.id, incompleteTranscript.id));
  const [savedTranscriptAfterInvalid] = await database.db
    .select()
    .from(databaseTables.onboardingTranscripts)
    .where(eq(databaseTables.onboardingTranscripts.id, "saved-profile-transcript"));

  assert.ok(profileAfterInvalid);
  assert.equal(profileAfterInvalid.rawChatHistoryId, "saved-profile-transcript");
  assert.ok(invalidDraftTranscript);
  assert.equal(invalidDraftTranscript.householdProfileId, null);
  assert.equal(invalidDraftTranscript.messages.length, 5);
  assert.ok(savedTranscriptAfterInvalid);
  assert.equal(savedTranscriptAfterInvalid.messages.length, 1);
  assert.equal(savedTranscriptAfterInvalid.householdProfileId, profileId);

  const completeResponse = await app.inject({
    method: "POST",
    url: "/ai/onboarding-chat",
    headers: {
      authorization: `Bearer ${session.accessToken}`
    },
    payload: {
      message: "Suntem doi adulti si un copil, gatim vegetarian in 25 de minute."
    }
  });

  assert.equal(completeResponse.statusCode, 200);
  assert.equal(completeResponse.json().structuredProfile.status, "complete");
  assert.equal(completeResponse.json().structuredProfile.persisted, true);
  assert.equal(completeResponse.json().transcript.id, incompleteTranscript.id);
  assert.equal(completeResponse.json().transcript.householdProfileId, profileId);
  assert.equal(completeResponse.json().transcript.messages.length, 7);

  const [profileAfterComplete] = await database.db
    .select()
    .from(databaseTables.householdProfiles)
    .where(eq(databaseTables.householdProfiles.userId, user.id));
  const [committedTranscript] = await database.db
    .select()
    .from(databaseTables.onboardingTranscripts)
    .where(eq(databaseTables.onboardingTranscripts.id, incompleteTranscript.id));
  const [savedTranscriptAfterComplete] = await database.db
    .select()
    .from(databaseTables.onboardingTranscripts)
    .where(eq(databaseTables.onboardingTranscripts.id, "saved-profile-transcript"));

  assert.ok(profileAfterComplete);
  assert.equal(profileAfterComplete.rawChatHistoryId, incompleteTranscript.id);
  assert.equal(profileAfterComplete.householdType, "family");
  assert.equal(profileAfterComplete.numChildren, 1);
  assert.ok(committedTranscript);
  assert.equal(committedTranscript.householdProfileId, profileId);
  assert.equal(committedTranscript.messages.length, 7);
  assert.ok(savedTranscriptAfterComplete);
  assert.equal(savedTranscriptAfterComplete.householdProfileId, profileId);
  assert.equal(savedTranscriptAfterComplete.messages.length, 1);

  const followUpResponse = await app.inject({
    method: "POST",
    url: "/ai/onboarding-chat",
    headers: {
      authorization: `Bearer ${session.accessToken}`
    },
    payload: {
      message: "Mai vrem si cine simple cu multe legume."
    }
  });

  assert.equal(followUpResponse.statusCode, 200);
  assert.equal(followUpResponse.json().structuredProfile.status, "incomplete");
  assert.equal(followUpResponse.json().structuredProfile.persisted, false);
  assert.equal(followUpResponse.json().transcript.householdProfileId, undefined);
  assert.notEqual(followUpResponse.json().transcript.id, incompleteTranscript.id);
  assert.equal(followUpResponse.json().transcript.messages.length, 9);
  assert.equal(followUpReplyTranscriptContents.length, 8);
  assert.ok(
    followUpReplyTranscriptContents.includes("Suntem doi adulti si un copil, gatim vegetarian in 25 de minute.")
  );
  assert.ok(
    followUpReplyTranscriptContents.includes("Nu exista alergii, doar avem nevoie de mai multa varietate.")
  );

  const [profileAfterFollowUp] = await database.db
    .select()
    .from(databaseTables.householdProfiles)
    .where(eq(databaseTables.householdProfiles.userId, user.id));
  const transcriptsAfterFollowUp = await database.db
    .select()
    .from(databaseTables.onboardingTranscripts)
    .where(eq(databaseTables.onboardingTranscripts.userId, user.id));
  const followUpDraftTranscript = transcriptsAfterFollowUp.find(
    (transcript) => transcript.id !== "saved-profile-transcript" && transcript.id !== incompleteTranscript.id
  );

  assert.ok(profileAfterFollowUp);
  assert.equal(profileAfterFollowUp.rawChatHistoryId, incompleteTranscript.id);
  assert.equal(transcriptsAfterFollowUp.length, 3);
  assert.ok(followUpDraftTranscript);
  assert.equal(followUpDraftTranscript.householdProfileId, null);
  assert.equal(followUpDraftTranscript.messages.length, 9);
  assert.ok(
    followUpDraftTranscript.messages.some(
      (message) => message.content === "Suntem doi adulti si un copil, gatim vegetarian in 25 de minute."
    )
  );

  await database.db
    .update(databaseTables.onboardingTranscripts)
    .set({
      updatedAt: "2026-03-22T18:04:00.000Z"
    })
    .where(eq(databaseTables.onboardingTranscripts.id, incompleteTranscript.id));

  const resumedDraftResponse = await app.inject({
    method: "POST",
    url: "/ai/onboarding-chat",
    headers: {
      authorization: `Bearer ${session.accessToken}`
    },
    payload: {
      message: "Mai vrem si gustari usoare pentru copil."
    }
  });

  assert.equal(resumedDraftResponse.statusCode, 200);
  assert.equal(resumedDraftResponse.json().structuredProfile.status, "incomplete");
  assert.equal(resumedDraftResponse.json().structuredProfile.persisted, false);
  assert.equal(resumedDraftResponse.json().transcript.id, followUpDraftTranscript.id);
  assert.equal(resumedDraftResponse.json().transcript.householdProfileId, undefined);
  assert.equal(resumedDraftResponse.json().transcript.messages.length, 11);
  assert.equal(resumedDraftReplyTranscriptContents.length, 10);
  assert.ok(resumedDraftReplyTranscriptContents.includes("Mai vrem si cine simple cu multe legume."));
  assert.ok(resumedDraftReplyTranscriptContents.includes("Continui de la profilul proaspat salvat si mai am nevoie de cateva detalii."));

  const transcriptsAfterResumingDraft = await database.db
    .select()
    .from(databaseTables.onboardingTranscripts)
    .where(eq(databaseTables.onboardingTranscripts.userId, user.id));
  const resumedDraftTranscript = transcriptsAfterResumingDraft.find(
    (transcript) => transcript.id === followUpDraftTranscript.id
  );

  assert.equal(transcriptsAfterResumingDraft.length, 3);
  assert.ok(resumedDraftTranscript);
  assert.equal(resumedDraftTranscript.householdProfileId, null);
  assert.equal(resumedDraftTranscript.messages.length, 11);
});

test("POST /ai/onboarding-chat keeps both turn pairs when overlapping requests append to the same active transcript", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-22T18:04:00.000Z");
  const user = createUser("onboarding-user-concurrent", fixedNow);
  const session = await createUserSession(database.db as AuthDatabase, user, fixedNow);
  const appendBarrier = createBarrier(2);

  await database.db.insert(databaseTables.onboardingTranscripts).values({
    id: "active-draft-transcript",
    userId: user.id,
    householdProfileId: null,
    messages: [
      {
        id: "existing-assistant-message",
        role: "assistant",
        content: "Spune-mi mai multe despre preferintele familiei.",
        createdAt: fixedNow.toISOString()
      }
    ],
    containsSensitiveProfileSignals: true,
    createdAt: fixedNow.toISOString(),
    updatedAt: fixedNow.toISOString()
  });

  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    services: {
      ai: {
        name: "ai",
        status: "ready",
        implementation: {
          async createOnboardingReply(request) {
            const lastUserMessage = [...request.transcript]
              .reverse()
              .find((message) => message.role === "user");

            assert.ok(lastUserMessage);

            return {
              assistantMessage: `Raspuns pentru: ${lastUserMessage.content}`,
              usage: {
                model: "claude-3-5-haiku-latest",
                modelTier: "haiku",
                routeReason: "test",
                inputTokens: 11,
                outputTokens: 12
              }
            };
          },
          async extractProfile() {
            return {
              profile: {
                householdType: "couple",
                budgetBand: "medium"
              },
              rawText: "{}",
              missingFields: ["allergies", "cookingSkill", "maxPrepTimeMinutes"],
              parseFailureReason: "incomplete",
              usage: {
                model: "claude-3-7-sonnet-latest",
                modelTier: "sonnet",
                routeReason: "test",
                inputTokens: 21,
                outputTokens: 22
              }
            };
          }
        }
      }
    },
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
    },
    onboarding: {
      repository: createOnboardingTranscriptRepository(database.db, {
        now: () => fixedNow,
        onActiveTranscriptLoadedForAppend(transcript) {
          if (transcript?.id === "active-draft-transcript") {
            return appendBarrier.wait();
          }

          return undefined;
        }
      })
    }
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const firstPayload = {
    message: "Vrem cine rapide cu legume."
  };
  const secondPayload = {
    message: "Evitam arahidele si preferam retete simple."
  };

  const [firstResponse, secondResponse] = await Promise.all([
    app.inject({
      method: "POST",
      url: "/ai/onboarding-chat",
      headers: {
        authorization: `Bearer ${session.accessToken}`
      },
      payload: firstPayload
    }),
    app.inject({
      method: "POST",
      url: "/ai/onboarding-chat",
      headers: {
        authorization: `Bearer ${session.accessToken}`
      },
      payload: secondPayload
    })
  ]);

  assert.equal(firstResponse.statusCode, 200);
  assert.equal(secondResponse.statusCode, 200);
  assert.equal(firstResponse.json().structuredProfile.status, "incomplete");
  assert.equal(secondResponse.json().structuredProfile.status, "incomplete");

  const storedTranscripts = await database.db
    .select()
    .from(databaseTables.onboardingTranscripts)
    .where(eq(databaseTables.onboardingTranscripts.userId, user.id));

  assert.equal(storedTranscripts.length, 1);

  const [storedTranscript] = storedTranscripts;

  assert.ok(storedTranscript);
  assert.equal(storedTranscript.id, "active-draft-transcript");
  assert.equal(storedTranscript.messages.length, 5);

  const messageContents = storedTranscript.messages.map((message) => message.content);

  assert.deepEqual(messageContents.slice(0, 1), ["Spune-mi mai multe despre preferintele familiei."]);
  assert.ok(messageContents.includes(firstPayload.message));
  assert.ok(messageContents.includes(secondPayload.message));
  assert.ok(messageContents.includes(`Raspuns pentru: ${firstPayload.message}`));
  assert.ok(messageContents.includes(`Raspuns pentru: ${secondPayload.message}`));
});

test("POST /ai/onboarding-chat converges overlapping first-time requests into a single draft transcript", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-22T18:04:30.000Z");
  const user = createUser("onboarding-user-concurrent-first-draft", fixedNow);
  const session = await createUserSession(database.db as AuthDatabase, user, fixedNow);
  const firstDraftBarrier = createBarrier(2);

  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    services: {
      ai: {
        name: "ai",
        status: "ready",
        implementation: {
          async createOnboardingReply(request) {
            const lastUserMessage = [...request.transcript]
              .reverse()
              .find((message) => message.role === "user");

            assert.ok(lastUserMessage);

            return {
              assistantMessage: `Raspuns pentru: ${lastUserMessage.content}`,
              usage: {
                model: "claude-3-5-haiku-latest",
                modelTier: "haiku",
                routeReason: "test",
                inputTokens: 11,
                outputTokens: 12
              }
            };
          },
          async extractProfile() {
            return {
              profile: {
                householdType: "couple",
                budgetBand: "medium"
              },
              rawText: "{}",
              missingFields: ["allergies", "cookingSkill", "maxPrepTimeMinutes"],
              parseFailureReason: "incomplete",
              usage: {
                model: "claude-3-7-sonnet-latest",
                modelTier: "sonnet",
                routeReason: "test",
                inputTokens: 21,
                outputTokens: 22
              }
            };
          }
        }
      }
    },
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
    },
    onboarding: {
      repository: createOnboardingTranscriptRepository(database.db, {
        now: () => fixedNow,
        onActiveTranscriptLoadedForAppend(transcript) {
          if (transcript === null) {
            return firstDraftBarrier.wait();
          }

          return undefined;
        }
      })
    }
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const firstPayload = {
    message: "Suntem doi adulti si vrem cine rapide."
  };
  const secondPayload = {
    message: "Evitam arahidele si preferam retete simple."
  };

  const [firstResponse, secondResponse] = await Promise.all([
    app.inject({
      method: "POST",
      url: "/ai/onboarding-chat",
      headers: {
        authorization: `Bearer ${session.accessToken}`
      },
      payload: firstPayload
    }),
    app.inject({
      method: "POST",
      url: "/ai/onboarding-chat",
      headers: {
        authorization: `Bearer ${session.accessToken}`
      },
      payload: secondPayload
    })
  ]);

  assert.equal(firstResponse.statusCode, 200);
  assert.equal(secondResponse.statusCode, 200);
  assert.equal(firstResponse.json().structuredProfile.status, "incomplete");
  assert.equal(secondResponse.json().structuredProfile.status, "incomplete");
  assert.equal(firstResponse.json().transcript.id, secondResponse.json().transcript.id);

  const storedTranscripts = await database.db
    .select()
    .from(databaseTables.onboardingTranscripts)
    .where(eq(databaseTables.onboardingTranscripts.userId, user.id));

  assert.equal(storedTranscripts.length, 1);

  const [storedTranscript] = storedTranscripts;

  assert.ok(storedTranscript);
  assert.equal(storedTranscript.householdProfileId, null);
  assert.equal(storedTranscript.messages.length, 4);

  const messageContents = storedTranscript.messages.map((message) => message.content);

  assert.ok(messageContents.includes(firstPayload.message));
  assert.ok(messageContents.includes(secondPayload.message));
  assert.ok(messageContents.includes(`Raspuns pentru: ${firstPayload.message}`));
  assert.ok(messageContents.includes(`Raspuns pentru: ${secondPayload.message}`));
});

test("POST /ai/onboarding-chat returns partial structured profile updates without persisting household profile data", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-22T18:05:00.000Z");
  const user = createUser("onboarding-user-partial", fixedNow);
  const session = await createUserSession(database.db as AuthDatabase, user, fixedNow);
  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    services: {
      ai: {
        name: "ai",
        status: "ready",
        implementation: createClaudeServiceDouble({
          reply: "Am notat. Mai am nevoie de alergii si nivelul tau de gatit.",
          extraction: {
            profile: {
              householdType: "couple",
              budgetBand: "low"
            },
            rawText: "{}",
            missingFields: ["allergies", "cookingSkill", "maxPrepTimeMinutes"],
            parseFailureReason: "incomplete",
            usage: {
              model: "claude-3-7-sonnet-latest",
              modelTier: "sonnet",
              routeReason: "test",
              inputTokens: 31,
              outputTokens: 32
            }
          }
        })
      }
    },
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
    },
    onboarding: {
      repository: createOnboardingTranscriptRepository(database.db, {
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
    url: "/ai/onboarding-chat",
    headers: {
      authorization: `Bearer ${session.accessToken}`
    },
    payload: {
      message: "Suntem un cuplu si vrem retete ieftine."
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().structuredProfile.status, "incomplete");
  assert.equal(response.json().structuredProfile.persisted, false);
  assert.deepEqual(response.json().structuredProfile.missingFields, [
    "allergies",
    "cookingSkill",
    "maxPrepTimeMinutes"
  ]);
  assert.equal(response.json().structuredProfile.profile.householdType, "couple");

  const storedProfiles = await database.db.select().from(databaseTables.householdProfiles);
  const storedTranscripts = await database.db.select().from(databaseTables.onboardingTranscripts);

  assert.equal(storedProfiles.length, 0);
  assert.equal(storedTranscripts.length, 1);
  assert.equal(storedTranscripts[0]?.userId, user.id);
  assert.equal(storedTranscripts[0]?.messages.length, 2);
});

test("POST /ai/onboarding-chat preserves transcript state and rejects invalid structured extraction output without saving a profile", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-22T18:10:00.000Z");
  const primaryUser = createUser("onboarding-user-invalid", fixedNow);
  const secondaryUser = createUser("onboarding-user-other", fixedNow);
  const primarySession = await createUserSession(database.db as AuthDatabase, primaryUser, fixedNow);
  await createUserSession(database.db as AuthDatabase, secondaryUser, fixedNow);
  await database.db.insert(databaseTables.onboardingTranscripts).values({
    id: "other-user-transcript",
    userId: secondaryUser.id,
    householdProfileId: null,
    messages: [
      {
        id: "other-user-message",
        role: "assistant",
        content: "Other user transcript should remain untouched.",
        createdAt: fixedNow.toISOString()
      }
    ],
    containsSensitiveProfileSignals: false
  });
  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    services: {
      ai: {
        name: "ai",
        status: "ready",
        implementation: createClaudeServiceDouble({
          reply: "Mai spune-mi daca exista alergii sau restrictii medicale.",
          extraction: {
            profile: null,
            rawText: "I could not produce valid JSON.",
            missingFields: [],
            parseFailureReason: "missing_json",
            usage: {
              model: "claude-3-7-sonnet-latest",
              modelTier: "sonnet",
              routeReason: "test",
              inputTokens: 41,
              outputTokens: 42
            }
          }
        })
      }
    },
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
    },
    onboarding: {
      repository: createOnboardingTranscriptRepository(database.db, {
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
    url: "/ai/onboarding-chat",
    headers: {
      authorization: `Bearer ${primarySession.accessToken}`
    },
    payload: {
      message: "Nu avem alergii cunoscute, dar vrem mancare simpla."
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().structuredProfile.status, "invalid");
  assert.equal(response.json().structuredProfile.persisted, false);
  assert.equal(response.json().structuredProfile.parseFailureReason, "missing_json");

  const primaryProfiles = await database.db
    .select()
    .from(databaseTables.householdProfiles)
    .where(eq(databaseTables.householdProfiles.userId, primaryUser.id));
  const primaryTranscripts = await database.db
    .select()
    .from(databaseTables.onboardingTranscripts)
    .where(eq(databaseTables.onboardingTranscripts.userId, primaryUser.id));
  const [secondaryTranscript] = await database.db
    .select()
    .from(databaseTables.onboardingTranscripts)
    .where(
      and(
        eq(databaseTables.onboardingTranscripts.userId, secondaryUser.id),
        eq(databaseTables.onboardingTranscripts.id, "other-user-transcript")
      )
    );

  assert.equal(primaryProfiles.length, 0);
  assert.equal(primaryTranscripts.length, 1);
  assert.equal(primaryTranscripts[0]?.messages.length, 2);
  assert.ok(secondaryTranscript);
  assert.equal(secondaryTranscript.messages.length, 1);
  assert.equal(secondaryTranscript.messages[0]?.content, "Other user transcript should remain untouched.");
});

test("POST /ai/onboarding-chat returns 503 when the AI service is unavailable", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-22T18:15:00.000Z");
  const user = createUser("onboarding-user-ai-unavailable", fixedNow);
  const session = await createUserSession(database.db as AuthDatabase, user, fixedNow);
  const app = createApiApp({
    config: createTestApiConfig({
      anthropic: undefined
    }),
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
    },
    onboarding: {
      repository: createOnboardingTranscriptRepository(database.db, {
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
    url: "/ai/onboarding-chat",
    headers: {
      authorization: `Bearer ${session.accessToken}`
    },
    payload: {
      message: "Vrem mese rapide pentru o familie cu doi adulti."
    }
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().code, "ai.service_unavailable");

  const storedProfiles = await database.db.select().from(databaseTables.householdProfiles);
  const storedTranscripts = await database.db.select().from(databaseTables.onboardingTranscripts);

  assert.equal(storedProfiles.length, 0);
  assert.equal(storedTranscripts.length, 0);
});

test("POST /ai/onboarding-chat returns 429 without mutating an existing transcript when profile extraction hits the usage limit", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-22T18:20:00.000Z");
  const user = createUser("onboarding-user-usage-limit", fixedNow);
  const session = await createUserSession(database.db as AuthDatabase, user, fixedNow);

  await database.db.insert(databaseTables.onboardingTranscripts).values({
    id: "usage-limit-transcript",
    userId: user.id,
    householdProfileId: null,
    messages: [
      {
        id: "usage-limit-existing-message",
        role: "assistant",
        content: "Spune-mi cate persoane locuiesc in gospodarie.",
        createdAt: fixedNow.toISOString()
      }
    ],
    containsSensitiveProfileSignals: false,
    createdAt: fixedNow.toISOString(),
    updatedAt: fixedNow.toISOString()
  });

  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    services: {
      ai: {
        name: "ai",
        status: "ready",
        implementation: createClaudeServiceDouble({
          reply: "Am notat. Ce restrictii alimentare aveti?",
          extractError: new ClaudeUsageLimitError("Onboarding AI usage limit reached.")
        })
      }
    },
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
    },
    onboarding: {
      repository: createOnboardingTranscriptRepository(database.db, {
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
    url: "/ai/onboarding-chat",
    headers: {
      authorization: `Bearer ${session.accessToken}`
    },
    payload: {
      message: "Suntem doi adulti si vrem un buget mediu."
    }
  });

  assert.equal(response.statusCode, 429);
  assert.equal(response.json().code, "ai.usage_limit_exceeded");
  assert.equal(response.json().message, "Onboarding AI usage limit reached.");

  const [storedTranscript] = await database.db
    .select()
    .from(databaseTables.onboardingTranscripts)
    .where(eq(databaseTables.onboardingTranscripts.userId, user.id));
  const storedProfiles = await database.db
    .select()
    .from(databaseTables.householdProfiles)
    .where(eq(databaseTables.householdProfiles.userId, user.id));

  assert.ok(storedTranscript);
  assert.equal(storedTranscript.id, "usage-limit-transcript");
  assert.equal(storedTranscript.messages.length, 1);
  assert.equal(storedTranscript.messages[0]?.content, "Spune-mi cate persoane locuiesc in gospodarie.");
  assert.equal(storedProfiles.length, 0);
});

test("POST /ai/onboarding-chat maps upstream AI failures to 502 and leaves transcript state unchanged", async (t) => {
  const database = await createMigratedTestDatabase();
  const fixedNow = new Date("2026-03-22T18:25:00.000Z");
  const user = createUser("onboarding-user-upstream-error", fixedNow);
  const session = await createUserSession(database.db as AuthDatabase, user, fixedNow);
  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    services: {
      ai: {
        name: "ai",
        status: "ready",
        implementation: createClaudeServiceDouble({
          reply: "Am inteles. Ce tip de mese preferati?",
          extractError: new ClaudeUpstreamError("Anthropic request failed.", 503, true)
        })
      }
    },
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
    },
    onboarding: {
      repository: createOnboardingTranscriptRepository(database.db, {
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
    url: "/ai/onboarding-chat",
    headers: {
      authorization: `Bearer ${session.accessToken}`
    },
    payload: {
      message: "Preferam cine rapide si fara gluten."
    }
  });

  assert.equal(response.statusCode, 502);
  assert.equal(response.json().code, "ai.upstream_error");
  assert.deepEqual(response.json().details, {
    upstreamStatusCode: 503,
    retryable: true
  });

  const storedProfiles = await database.db
    .select()
    .from(databaseTables.householdProfiles)
    .where(eq(databaseTables.householdProfiles.userId, user.id));
  const storedTranscripts = await database.db
    .select()
    .from(databaseTables.onboardingTranscripts)
    .where(eq(databaseTables.onboardingTranscripts.userId, user.id));

  assert.equal(storedProfiles.length, 0);
  assert.equal(storedTranscripts.length, 0);
});