import React from "react";
import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import * as Keychain from "react-native-keychain";

import App from "../App";
import { getBundledMobileConfig } from "../src/app/config/runtime";
import { resetAssistantShellStore } from "../src/app/state/app-store";

const fetchMock = jest.fn<typeof fetch>();
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

describe("mobile app shell", () => {
  beforeEach(() => {
    resetAssistantShellStore();
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

      return {
        ok: true,
        status: 200,
        json: async () => createHealthPayload()
      } as Response;
    });

    global.fetch = fetchMock as unknown as typeof fetch;
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
  });

  afterEach(() => {
    fetchMock.mockReset();
    getGenericPasswordMock.mockReset();
    setGenericPasswordMock.mockReset();
    resetGenericPasswordMock.mockReset();
    googleConfigureMock.mockReset();
    googleHasPlayServicesMock.mockReset();
    googleSignInMock.mockReset();
    googleSignOutMock.mockReset();
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

  test("signs in with Google, exchanges the token with the backend, and persists the backend session", async () => {
    const screen = render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Continue with Google")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Continue with Google"));

    await waitFor(() => {
      expect(screen.getByText("Authenticated session")).toBeTruthy();
      expect(screen.getByText("Ana Popescu")).toBeTruthy();
      expect(screen.getByText("Live backend check")).toBeTruthy();
      expect(screen.getByText(/3-day draft\s+with/i)).toBeTruthy();
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
  });

  test("restores the stored backend session on relaunch", async () => {
    getGenericPasswordMock.mockResolvedValue({
      service: "ro.freshfulassistant.app-session",
      storage: "mock-storage",
      username: "backend-session",
      password: JSON.stringify(createAuthPayload())
    } as unknown as GenericPasswordResult);

    const screen = render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Authenticated session")).toBeTruthy();
      expect(screen.getByText("Ana Popescu")).toBeTruthy();
    });

    expect(googleSignInMock).not.toHaveBeenCalled();
    expect(setGenericPasswordMock).not.toHaveBeenCalled();
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
      expect(screen.getByText("Tune plan preview")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Tune plan preview"));
    fireEvent.press(screen.getByText("5 days"));
    fireEvent.press(screen.getByText("snack"));
    fireEvent.press(screen.getByText("Back to dashboard"));

    await waitFor(() => {
      expect(screen.getByText(/5-day draft\s+with/i)).toBeTruthy();
      expect(screen.getByText(/breakfast, lunch, dinner, snack/i)).toBeTruthy();
    });
  });
});