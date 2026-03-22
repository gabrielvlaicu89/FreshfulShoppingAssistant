import React from "react";
import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import * as Keychain from "react-native-keychain";

import App from "../App";
import { getBundledMobileConfig } from "../src/app/config/runtime";
import { resetAssistantShellStore } from "../src/app/state/app-store";

const fetchMock = jest.fn<typeof fetch>();
const asyncStorageGetItemMock = jest.mocked(AsyncStorage.getItem);
const asyncStorageSetItemMock = jest.mocked(AsyncStorage.setItem);
const asyncStorageRemoveItemMock = jest.mocked(AsyncStorage.removeItem);
const getGenericPasswordMock = jest.mocked(Keychain.getGenericPassword);
const setGenericPasswordMock = jest.mocked(Keychain.setGenericPassword);
const resetGenericPasswordMock = jest.mocked(Keychain.resetGenericPassword);
const googleConfigureMock = jest.mocked(GoogleSignin.configure);
const googleHasPlayServicesMock = jest.mocked(GoogleSignin.hasPlayServices);
const googleSignInMock = jest.mocked(GoogleSignin.signIn);
const googleSignOutMock = jest.mocked(GoogleSignin.signOut);

type GenericPasswordResult = Exclude<Awaited<ReturnType<typeof Keychain.getGenericPassword>>, false>;
type SetGenericPasswordResult = Exclude<Awaited<ReturnType<typeof Keychain.setGenericPassword>>, false>;

function createHealthPayload() {
  return {
    status: "ok",
    service: "@freshful/api",
    environment: "test",
    detailLevel: "summary",
    timestamp: new Date().toISOString(),
    uptimeSeconds: 12,
    services: {
      auth: { name: "auth", status: "ready" },
      ai: { name: "ai", status: "pending" },
      planner: { name: "planner", status: "pending" },
      freshful: { name: "freshful", status: "pending" }
    }
  };
}

function createAuthPayload() {
  return {
    session: {
      accessToken: "backend-session-token",
      tokenType: "Bearer",
      expiresAt: "2026-03-23T10:00:00.000Z",
      expiresInSeconds: 3600
    },
    user: {
      id: "user-1",
      email: "ana@example.com",
      emailVerified: true,
      displayName: "Ana Popescu",
      photoUrl: null,
      lastLoginAt: "2026-03-22T09:00:00.000Z"
    }
  };
}

function createProfilePayload() {
  return {
    userId: "user-1",
    householdType: "family",
    numChildren: 2,
    dietaryRestrictions: ["vegetarian", "gluten-free"],
    allergies: {
      normalized: ["dairy"],
      freeText: ["kiwi"]
    },
    medicalFlags: {
      diabetes: false,
      hypertension: false
    },
    goals: ["maintenance"],
    cuisinePreferences: ["Romanian", "Mediterranean"],
    favoriteIngredients: ["tomatoes", "lentils"],
    dislikedIngredients: ["olives"],
    budgetBand: "medium",
    maxPrepTimeMinutes: 35,
    cookingSkill: "intermediate",
    rawChatHistoryId: "transcript-1"
  };
}

function createEditableProfilePayload() {
  return createOnboardingProfileWritePayload();
}

function createOnboardingResponse(overrides: {
  assistantMessage?: string;
  structuredProfile?: {
    status?: "complete" | "incomplete" | "invalid";
    profile?: Record<string, unknown> | null;
    missingFields?: string[];
    parseFailureReason?: "incomplete" | "missing_json" | "invalid_json" | "schema_mismatch" | null;
    persisted?: boolean;
  };
} = {}) {
  const assistantMessage = overrides.assistantMessage ?? "Perfect. What budget and prep time should I respect?";

  return {
    transcript: {
      id: "transcript-1",
      messages: [
        {
          id: "message-user-1",
          role: "user",
          content: "We are a vegetarian family with two kids.",
          createdAt: "2026-03-22T10:00:00.000Z"
        },
        {
          id: "message-assistant-1",
          role: "assistant",
          content: assistantMessage,
          createdAt: "2026-03-22T10:00:05.000Z"
        }
      ]
    },
    assistantMessage: {
      id: "message-assistant-1",
      role: "assistant",
      content: assistantMessage,
      createdAt: "2026-03-22T10:00:05.000Z"
    },
    structuredProfile: {
      status: overrides.structuredProfile?.status ?? "complete",
      profile: overrides.structuredProfile?.profile ?? createEditableProfilePayload(),
      missingFields: overrides.structuredProfile?.missingFields ?? [],
      parseFailureReason: overrides.structuredProfile?.parseFailureReason ?? null,
      persisted: overrides.structuredProfile?.persisted ?? true
    }
  };
}

function createOnboardingProfileWritePayload() {
  return {
    householdType: "family",
    numChildren: 2,
    dietaryRestrictions: ["vegetarian", "gluten-free"],
    allergies: {
      normalized: ["dairy"],
      freeText: ["kiwi"]
    },
    medicalFlags: {
      diabetes: false,
      hypertension: false
    },
    goals: ["maintenance"],
    cuisinePreferences: ["Romanian", "Mediterranean"],
    favoriteIngredients: ["tomatoes", "lentils"],
    dislikedIngredients: ["olives"],
    budgetBand: "medium",
    maxPrepTimeMinutes: 35,
    cookingSkill: "intermediate"
  };
}

function toStoredProfilePayload(profileWritePayload: ReturnType<typeof createOnboardingProfileWritePayload>) {
  return {
    ...profileWritePayload,
    userId: "user-1",
    rawChatHistoryId: "transcript-confirmed"
  };
}

function createCachedDashboardSummaryPayload() {
  return {
    summary: {
      userId: "user-1",
      householdType: "family",
      numChildren: 2,
      cuisinePreferences: ["Romanian", "Mediterranean"],
      budgetBand: "medium",
      maxPrepTimeMinutes: 35
    },
    cachedAt: "2026-03-22T09:30:00.000Z"
  };
}

describe("mobile app shell", () => {
  beforeEach(() => {
    resetAssistantShellStore();
    let profilePayload: ReturnType<typeof createProfilePayload> | null = createProfilePayload();
    let profileError: Error | null = null;
    let profileUpdateDelay: Promise<void> | null = null;
    let onboardingError: Error | null = null;
    let onboardingResponses = [createOnboardingResponse()];
    let onboardingRequestDelay: Promise<void> | null = null;

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);

      if (url.includes("auth/google")) {
        expect(init?.method).toBe("POST");

        return {
          ok: true,
          status: 200,
          json: async () => createAuthPayload()
        } as Response;
      }

      if (url.includes("/profile")) {
        if (init?.method === "PUT") {
          expect(init?.headers).toEqual(
            expect.objectContaining({
              Authorization: "Bearer backend-session-token",
              "Content-Type": "application/json"
            })
          );

          if (profileUpdateDelay) {
            await profileUpdateDelay;
            profileUpdateDelay = null;
          }

          const parsedBody = JSON.parse(String(init?.body ?? "{}")) as ReturnType<typeof createOnboardingProfileWritePayload>;
          profilePayload = toStoredProfilePayload(parsedBody);

          return {
            ok: true,
            status: 200,
            json: async () => ({ profile: profilePayload })
          } as Response;
        }

        expect(init?.headers).toEqual(
          expect.objectContaining({
            Authorization: "Bearer backend-session-token"
          })
        );

        if (profileError) {
          throw profileError;
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ profile: profilePayload })
        } as Response;
      }

      if (url.includes("/ai/onboarding-chat")) {
        expect(init?.method).toBe("POST");
        expect(init?.headers).toEqual(
          expect.objectContaining({
            Authorization: "Bearer backend-session-token",
            "Content-Type": "application/json"
          })
        );

        if (onboardingRequestDelay) {
          await onboardingRequestDelay;
          onboardingRequestDelay = null;
        }

        if (onboardingError) {
          throw onboardingError;
        }

        const response = onboardingResponses.shift() ?? createOnboardingResponse();

        return {
          ok: true,
          status: 200,
          json: async () => response
        } as Response;
      }

      return {
        ok: true,
        status: 200,
        json: async () => createHealthPayload()
      } as Response;
    });

    global.fetch = fetchMock as unknown as typeof fetch;
    asyncStorageGetItemMock.mockResolvedValue(null);
    asyncStorageSetItemMock.mockResolvedValue();
    asyncStorageRemoveItemMock.mockResolvedValue();
    getGenericPasswordMock.mockResolvedValue(false);
    setGenericPasswordMock.mockResolvedValue({
      service: "ro.freshfulassistant.app-session",
      storage: "mock-storage"
    } as unknown as SetGenericPasswordResult);
    resetGenericPasswordMock.mockResolvedValue(true);
    googleHasPlayServicesMock.mockResolvedValue(true);
    googleSignInMock.mockResolvedValue({
      type: "success",
      data: {
        user: {
          id: "google-user-1",
          name: "Ana Popescu",
          email: "ana@example.com",
          photo: null,
          familyName: "Popescu",
          givenName: "Ana"
        },
        scopes: ["email", "profile"],
        idToken: "google-id-token",
        serverAuthCode: null
      }
    });
    googleSignOutMock.mockResolvedValue(null);

    Object.assign(globalThis, {
      __TEST_PROFILE_STATE__: {
        setProfilePayload(nextProfilePayload: ReturnType<typeof createProfilePayload> | null) {
          profilePayload = nextProfilePayload;
        },
        setProfileError(nextProfileError: Error | null) {
          profileError = nextProfileError;
        },
        setProfileUpdateDelay(nextDelay: Promise<void> | null) {
          profileUpdateDelay = nextDelay;
        },
        setOnboardingError(nextOnboardingError: Error | null) {
          onboardingError = nextOnboardingError;
        },
        setOnboardingResponses(nextOnboardingResponses: Array<ReturnType<typeof createOnboardingResponse>>) {
          onboardingResponses = [...nextOnboardingResponses];
        },
        setOnboardingRequestDelay(nextDelay: Promise<void> | null) {
          onboardingRequestDelay = nextDelay;
        }
      }
    });
  });

  afterEach(() => {
    fetchMock.mockReset();
    asyncStorageGetItemMock.mockReset();
    asyncStorageSetItemMock.mockReset();
    asyncStorageRemoveItemMock.mockReset();
    getGenericPasswordMock.mockReset();
    setGenericPasswordMock.mockReset();
    resetGenericPasswordMock.mockReset();
    googleConfigureMock.mockReset();
    googleHasPlayServicesMock.mockReset();
    googleSignInMock.mockReset();
    googleSignOutMock.mockReset();
    Reflect.deleteProperty(globalThis, "__TEST_PROFILE_STATE__");
  });

  test("reads API request timeout from bundled runtime config", () => {
    expect(getBundledMobileConfig()).toMatchObject({
      appEnv: "test",
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

  test("signs in with Google, shows the dashboard profile summary, and persists the backend session", async () => {
    const screen = render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Continue with Google")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Continue with Google"));

    await waitFor(() => {
      expect(screen.getByText("Profile summary")).toBeTruthy();
      expect(screen.getByText("Family household · 2 children")).toBeTruthy();
      expect(screen.getByText("Plan next meals")).toBeTruthy();
      expect(screen.getByText("Shopping lists soon")).toBeTruthy();
    });

    expect(googleConfigureMock).toHaveBeenCalledWith({
      webClientId: "test-web-client.apps.googleusercontent.com"
    });
    expect(googleHasPlayServicesMock).toHaveBeenCalledWith({
      showPlayServicesUpdateDialog: true
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/google"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ idToken: "google-id-token" })
      })
    );
    expect(setGenericPasswordMock).toHaveBeenCalledWith(
      "backend-session",
      expect.stringContaining("backend-session-token"),
      expect.objectContaining({
        service: "ro.freshfulassistant.app-session"
      })
    );

    const profileCacheWrite = asyncStorageSetItemMock.mock.calls.find(
      ([key]) => key === "ro.freshfulassistant.profile-cache:user-1"
    );

    expect(profileCacheWrite).toBeDefined();

    const [, storedValue] = profileCacheWrite ?? [];
    const storedRecord = JSON.parse(String(storedValue)) as {
      summary: Record<string, unknown>;
      cachedAt: string;
    };

    expect(storedRecord).toMatchObject({
      summary: createCachedDashboardSummaryPayload().summary,
      cachedAt: expect.any(String)
    });
    expect(Object.keys(storedRecord.summary).sort()).toEqual([
      "budgetBand",
      "cuisinePreferences",
      "householdType",
      "maxPrepTimeMinutes",
      "numChildren",
      "userId"
    ]);
    expect(storedRecord.summary).not.toHaveProperty("dietaryRestrictions");
    expect(storedRecord.summary).not.toHaveProperty("goals");
    expect(storedRecord.summary).not.toHaveProperty("allergies");
    expect(storedRecord.summary).not.toHaveProperty("medicalFlags");
  });

  test("shows an empty dashboard state when no saved profile exists", async () => {
    (globalThis as typeof globalThis & {
      __TEST_PROFILE_STATE__: {
        setProfilePayload: (payload: ReturnType<typeof createProfilePayload> | null) => void;
        setProfileError: (error: Error | null) => void;
        setProfileUpdateDelay: (delay: Promise<void> | null) => void;
        setOnboardingError: (error: Error | null) => void;
        setOnboardingResponses: (responses: Array<ReturnType<typeof createOnboardingResponse>>) => void;
        setOnboardingRequestDelay: (delay: Promise<void> | null) => void;
      };
    }).__TEST_PROFILE_STATE__.setProfilePayload(null);

    getGenericPasswordMock.mockResolvedValue({
      service: "ro.freshfulassistant.app-session",
      storage: "mock-storage",
      username: "backend-session",
      password: JSON.stringify(createAuthPayload())
    } as unknown as GenericPasswordResult);

    const screen = render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Profile empty")).toBeTruthy();
      expect(screen.getByText(/Start the onboarding chat/i)).toBeTruthy();
      expect(screen.getByText("Start AI onboarding")).toBeTruthy();
    });

    expect(asyncStorageRemoveItemMock).toHaveBeenCalledWith("ro.freshfulassistant.profile-cache:user-1");
  });

  test("prefers an empty state when the backend confirms the profile is null even if a cached summary exists", async () => {
    getGenericPasswordMock.mockResolvedValue({
      service: "ro.freshfulassistant.app-session",
      storage: "mock-storage",
      username: "backend-session",
      password: JSON.stringify(createAuthPayload())
    } as unknown as GenericPasswordResult);
    asyncStorageGetItemMock.mockResolvedValue(JSON.stringify(createCachedDashboardSummaryPayload()));
    (globalThis as typeof globalThis & {
      __TEST_PROFILE_STATE__: {
        setProfilePayload: (payload: ReturnType<typeof createProfilePayload> | null) => void;
        setProfileError: (error: Error | null) => void;
      };
    }).__TEST_PROFILE_STATE__.setProfilePayload(null);

    const screen = render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Profile empty")).toBeTruthy();
    });

    expect(screen.queryByText("Family household · 2 children")).toBeNull();
    expect(screen.queryByText(/Showing the last locally cached dashboard summary/i)).toBeNull();
    expect(asyncStorageRemoveItemMock).toHaveBeenCalledWith("ro.freshfulassistant.profile-cache:user-1");
  });

  test("restores the stored backend session on relaunch and refreshes the profile from the backend", async () => {
    getGenericPasswordMock.mockResolvedValue({
      service: "ro.freshfulassistant.app-session",
      storage: "mock-storage",
      username: "backend-session",
      password: JSON.stringify(createAuthPayload())
    } as unknown as GenericPasswordResult);

    const screen = render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Live profile")).toBeTruthy();
      expect(screen.getByText(/Cuisine preferences:\s*Romanian, Mediterranean/i)).toBeTruthy();
    });

    expect(googleSignInMock).not.toHaveBeenCalled();
    expect(setGenericPasswordMock).not.toHaveBeenCalled();
  });

  test("restores the session and falls back to the cached profile when the backend is unavailable", async () => {
    getGenericPasswordMock.mockResolvedValue({
      service: "ro.freshfulassistant.app-session",
      storage: "mock-storage",
      username: "backend-session",
      password: JSON.stringify(createAuthPayload())
    } as unknown as GenericPasswordResult);
    asyncStorageGetItemMock.mockResolvedValue(JSON.stringify(createCachedDashboardSummaryPayload()));
    (globalThis as typeof globalThis & {
      __TEST_PROFILE_STATE__: {
        setProfilePayload: (payload: ReturnType<typeof createProfilePayload> | null) => void;
        setProfileError: (error: Error | null) => void;
      };
    }).__TEST_PROFILE_STATE__.setProfileError(new Error("Network request failed"));

    const screen = render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Cached profile")).toBeTruthy();
      expect(screen.getByText(/Showing the last locally cached dashboard summary/i)).toBeTruthy();
      expect(screen.getByText("Family household · 2 children")).toBeTruthy();
      expect(screen.getByText(/Cuisine preferences:\s*Romanian, Mediterranean/i)).toBeTruthy();
    });

    expect(googleSignInMock).not.toHaveBeenCalled();
  });

  test("logs out by clearing secure storage and returning to the welcome screen", async () => {
    getGenericPasswordMock.mockResolvedValue({
      service: "ro.freshfulassistant.app-session",
      storage: "mock-storage",
      username: "backend-session",
      password: JSON.stringify(createAuthPayload())
    } as unknown as GenericPasswordResult);

    const screen = render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Log out")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Log out"));

    await waitFor(() => {
      expect(screen.getByText("Continue with Google")).toBeTruthy();
    });

    expect(resetGenericPasswordMock).toHaveBeenCalledWith({
      service: "ro.freshfulassistant.app-session"
    });
    expect(googleSignOutMock).toHaveBeenCalled();
  });

  test("keeps planner preview state across authenticated screens", async () => {
    getGenericPasswordMock.mockResolvedValue({
      service: "ro.freshfulassistant.app-session",
      storage: "mock-storage",
      username: "backend-session",
      password: JSON.stringify(createAuthPayload())
    } as unknown as GenericPasswordResult);

    const screen = render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Plan next meals")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Plan next meals"));
    fireEvent.press(screen.getByText("5 days"));
    fireEvent.press(screen.getByText("snack"));
    fireEvent.press(screen.getByText("Back to dashboard"));

    await waitFor(() => {
      expect(screen.getByText(/5-day draft\s+with/i)).toBeTruthy();
      expect(screen.getByText(/breakfast, lunch, dinner, snack/i)).toBeTruthy();
    });
  });

  test("guides signed-in users without a profile through onboarding chat, loading state, and confirmation", async () => {
    let resolveOnboardingDelay: () => void = () => {};
    const onboardingDelay = new Promise<void>((resolve) => {
      resolveOnboardingDelay = resolve;
    });

    getGenericPasswordMock.mockResolvedValue({
      service: "ro.freshfulassistant.app-session",
      storage: "mock-storage",
      username: "backend-session",
      password: JSON.stringify(createAuthPayload())
    } as unknown as GenericPasswordResult);
    (globalThis as typeof globalThis & {
      __TEST_PROFILE_STATE__: {
        setProfilePayload: (payload: ReturnType<typeof createProfilePayload> | null) => void;
        setProfileError: (error: Error | null) => void;
        setProfileUpdateDelay: (delay: Promise<void> | null) => void;
        setOnboardingError: (error: Error | null) => void;
        setOnboardingResponses: (responses: Array<ReturnType<typeof createOnboardingResponse>>) => void;
        setOnboardingRequestDelay: (delay: Promise<void> | null) => void;
      };
      __RESOLVE_ONBOARDING_DELAY__: () => void;
    }).__TEST_PROFILE_STATE__.setProfilePayload(null);
    (globalThis as typeof globalThis & {
      __TEST_PROFILE_STATE__: {
        setProfilePayload: (payload: ReturnType<typeof createProfilePayload> | null) => void;
        setProfileError: (error: Error | null) => void;
        setProfileUpdateDelay: (delay: Promise<void> | null) => void;
        setOnboardingError: (error: Error | null) => void;
        setOnboardingResponses: (responses: Array<ReturnType<typeof createOnboardingResponse>>) => void;
        setOnboardingRequestDelay: (delay: Promise<void> | null) => void;
      };
    }).__TEST_PROFILE_STATE__.setOnboardingResponses([
      createOnboardingResponse({
        assistantMessage: "Perfect. I have enough detail to draft your household profile.",
        structuredProfile: {
          status: "complete",
          profile: createOnboardingProfileWritePayload(),
          missingFields: [],
          parseFailureReason: null,
          persisted: true
        }
      })
    ]);
    (globalThis as typeof globalThis & {
      __TEST_PROFILE_STATE__: {
        setProfilePayload: (payload: ReturnType<typeof createProfilePayload> | null) => void;
        setProfileError: (error: Error | null) => void;
        setProfileUpdateDelay: (delay: Promise<void> | null) => void;
        setOnboardingError: (error: Error | null) => void;
        setOnboardingResponses: (responses: Array<ReturnType<typeof createOnboardingResponse>>) => void;
        setOnboardingRequestDelay: (delay: Promise<void> | null) => void;
      };
    }).__TEST_PROFILE_STATE__.setOnboardingRequestDelay(onboardingDelay);

    const screen = render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Start AI onboarding")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Start AI onboarding"));

    await waitFor(() => {
      expect(screen.getByText("Onboarding chat")).toBeTruthy();
      expect(screen.getByPlaceholderText("Describe your household or ask for a correction.")).toBeTruthy();
    });

    fireEvent.changeText(screen.getByTestId("onboarding-composer-input"), "We are a vegetarian family with two kids.");
    fireEvent.press(screen.getByText("Send message"));

    await waitFor(() => {
      expect(screen.getByText("Assistant is updating your household profile.")).toBeTruthy();
    });

    resolveOnboardingDelay();

    await waitFor(() => {
      expect(screen.getByText("Perfect. I have enough detail to draft your household profile.")).toBeTruthy();
      expect(screen.getByText("Ready to confirm")).toBeTruthy();
      expect(screen.getByText("Known: dairy · Notes: kiwi")).toBeTruthy();
      expect(screen.getByText("Confirm profile")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Confirm profile"));

    await waitFor(() => {
      expect(screen.getByText("Live profile")).toBeTruthy();
      expect(screen.getByText("Family household · 2 children")).toBeTruthy();
      expect(screen.getByText("Review or revise profile")).toBeTruthy();
    });
  });

  test("shows onboarding chat recovery controls after an assistant request fails and retries successfully", async () => {
    getGenericPasswordMock.mockResolvedValue({
      service: "ro.freshfulassistant.app-session",
      storage: "mock-storage",
      username: "backend-session",
      password: JSON.stringify(createAuthPayload())
    } as unknown as GenericPasswordResult);
    (globalThis as typeof globalThis & {
      __TEST_PROFILE_STATE__: {
        setProfilePayload: (payload: ReturnType<typeof createProfilePayload> | null) => void;
        setProfileError: (error: Error | null) => void;
        setProfileUpdateDelay: (delay: Promise<void> | null) => void;
        setOnboardingError: (error: Error | null) => void;
        setOnboardingResponses: (responses: Array<ReturnType<typeof createOnboardingResponse>>) => void;
        setOnboardingRequestDelay: (delay: Promise<void> | null) => void;
      };
    }).__TEST_PROFILE_STATE__.setProfilePayload(null);
    (globalThis as typeof globalThis & {
      __TEST_PROFILE_STATE__: {
        setProfilePayload: (payload: ReturnType<typeof createProfilePayload> | null) => void;
        setProfileError: (error: Error | null) => void;
        setProfileUpdateDelay: (delay: Promise<void> | null) => void;
        setOnboardingError: (error: Error | null) => void;
        setOnboardingResponses: (responses: Array<ReturnType<typeof createOnboardingResponse>>) => void;
        setOnboardingRequestDelay: (delay: Promise<void> | null) => void;
      };
    }).__TEST_PROFILE_STATE__.setOnboardingError(new Error("Network request failed"));

    const screen = render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Start AI onboarding")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Start AI onboarding"));
    fireEvent.changeText(screen.getByTestId("onboarding-composer-input"), "Please capture our dairy allergy.");
    fireEvent.press(screen.getByText("Send message"));

    await waitFor(() => {
      expect(screen.getByText("Chat unavailable")).toBeTruthy();
      expect(screen.getByText("Retry last message")).toBeTruthy();
    });

    (globalThis as typeof globalThis & {
      __TEST_PROFILE_STATE__: {
        setProfilePayload: (payload: ReturnType<typeof createProfilePayload> | null) => void;
        setProfileError: (error: Error | null) => void;
        setProfileUpdateDelay: (delay: Promise<void> | null) => void;
        setOnboardingError: (error: Error | null) => void;
        setOnboardingResponses: (responses: Array<ReturnType<typeof createOnboardingResponse>>) => void;
        setOnboardingRequestDelay: (delay: Promise<void> | null) => void;
      };
    }).__TEST_PROFILE_STATE__.setOnboardingError(null);
    (globalThis as typeof globalThis & {
      __TEST_PROFILE_STATE__: {
        setProfilePayload: (payload: ReturnType<typeof createProfilePayload> | null) => void;
        setProfileError: (error: Error | null) => void;
        setOnboardingError: (error: Error | null) => void;
        setOnboardingResponses: (responses: Array<ReturnType<typeof createOnboardingResponse>>) => void;
        setOnboardingRequestDelay: (delay: Promise<void> | null) => void;
      };
    }).__TEST_PROFILE_STATE__.setOnboardingResponses([
      createOnboardingResponse({
        assistantMessage: "Got it. I captured the allergy and your prep limit.",
        structuredProfile: {
          status: "incomplete",
          profile: {
            householdType: "family",
            allergies: {
              normalized: ["dairy"],
              freeText: []
            },
            maxPrepTimeMinutes: 30
          },
          missingFields: ["goals", "budgetBand"],
          parseFailureReason: "incomplete",
          persisted: false
        }
      })
    ]);

    fireEvent.press(screen.getByText("Retry last message"));

    await waitFor(() => {
      expect(screen.getByText("Got it. I captured the allergy and your prep limit.")).toBeTruthy();
      expect(screen.getByText("Profile in progress")).toBeTruthy();
      expect(screen.getByText(/Still missing: goals, budgetBand/i)).toBeTruthy();
    });
  });

  test("lets signed-in users review or revise an existing profile from the dashboard", async () => {
    getGenericPasswordMock.mockResolvedValue({
      service: "ro.freshfulassistant.app-session",
      storage: "mock-storage",
      username: "backend-session",
      password: JSON.stringify(createAuthPayload())
    } as unknown as GenericPasswordResult);

    const screen = render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Review or revise profile")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Review or revise profile"));

    await waitFor(() => {
      expect(screen.getByText("Profile review")).toBeTruthy();
      expect(screen.getByText("Family household · 2 children")).toBeTruthy();
      expect(screen.getByText("Known: dairy · Notes: kiwi")).toBeTruthy();
      expect(screen.getByText("Save profile")).toBeTruthy();
    });
  });

  test("does not submit a revision while save profile is still pending", async () => {
    let resolveProfileUpdateDelay: () => void = () => {};
    const profileUpdateDelay = new Promise<void>((resolve) => {
      resolveProfileUpdateDelay = resolve;
    });

    getGenericPasswordMock.mockResolvedValue({
      service: "ro.freshfulassistant.app-session",
      storage: "mock-storage",
      username: "backend-session",
      password: JSON.stringify(createAuthPayload())
    } as unknown as GenericPasswordResult);
    (globalThis as typeof globalThis & {
      __TEST_PROFILE_STATE__: {
        setProfilePayload: (payload: ReturnType<typeof createProfilePayload> | null) => void;
        setProfileError: (error: Error | null) => void;
        setProfileUpdateDelay: (delay: Promise<void> | null) => void;
        setOnboardingError: (error: Error | null) => void;
        setOnboardingResponses: (responses: Array<ReturnType<typeof createOnboardingResponse>>) => void;
        setOnboardingRequestDelay: (delay: Promise<void> | null) => void;
      };
    }).__TEST_PROFILE_STATE__.setOnboardingResponses([
      createOnboardingResponse({
        assistantMessage: "I updated the allergy notes to include kiwi.",
        structuredProfile: {
          status: "complete",
          profile: createOnboardingProfileWritePayload(),
          missingFields: [],
          parseFailureReason: null,
          persisted: true
        }
      })
    ]);
    (globalThis as typeof globalThis & {
      __TEST_PROFILE_STATE__: {
        setProfilePayload: (payload: ReturnType<typeof createProfilePayload> | null) => void;
        setProfileError: (error: Error | null) => void;
        setProfileUpdateDelay: (delay: Promise<void> | null) => void;
        setOnboardingError: (error: Error | null) => void;
        setOnboardingResponses: (responses: Array<ReturnType<typeof createOnboardingResponse>>) => void;
        setOnboardingRequestDelay: (delay: Promise<void> | null) => void;
      };
    }).__TEST_PROFILE_STATE__.setProfileUpdateDelay(profileUpdateDelay);

    const screen = render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Review or revise profile")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Review or revise profile"));

    await waitFor(() => {
      expect(screen.getByText("Save profile")).toBeTruthy();
    });

    fireEvent.press(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Saving profile..." })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
      expect(screen.getByTestId("onboarding-composer-input").props.editable).toBe(false);
    });

    expect(
      fetchMock.mock.calls.filter(
        ([url, init]) => String(url).includes("/profile") && init?.method === "PUT"
      )
    ).toHaveLength(1);

    fireEvent.changeText(screen.getByTestId("onboarding-composer-input"), "Please add kiwi to the allergy notes.");
    fireEvent.press(screen.getByRole("button", { name: "Send message" }));

    expect(
      fetchMock.mock.calls.filter(
        ([url, init]) => String(url).includes("/ai/onboarding-chat") && init?.method === "POST"
      )
    ).toHaveLength(0);

    resolveProfileUpdateDelay();

    await waitFor(() => {
      expect(screen.getByText("Live profile")).toBeTruthy();
      expect(screen.getByText("Review or revise profile")).toBeTruthy();
    });

    expect(
      fetchMock.mock.calls.filter(
        ([url, init]) => String(url).includes("/ai/onboarding-chat") && init?.method === "POST"
      )
    ).toHaveLength(0);
  });
});