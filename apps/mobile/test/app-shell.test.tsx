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
      expect(screen.getByText(/No household profile is stored yet/i)).toBeTruthy();
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
});