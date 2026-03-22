import React from "react";
import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import App from "../App";
import { getBundledMobileConfig } from "../src/app/config/runtime";
import { resetAssistantShellStore } from "../src/app/state/app-store";

const fetchMock = jest.fn<typeof fetch>();

describe("mobile app shell", () => {
  beforeEach(() => {
    resetAssistantShellStore();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
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
      })
    } as Response);

    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    fetchMock.mockReset();
  });

  test("reads API request timeout from bundled runtime config", () => {
    expect(getBundledMobileConfig()).toMatchObject({
      appEnv: "test",
      apiBaseUrl: "http://10.0.2.2:3000",
      google: {
        androidClientId: "test-android-client.apps.googleusercontent.com"
      },
      network: {
        requestTimeoutMs: 12000
      }
    });
  });

  test("renders the welcome shell and navigates to the dashboard", async () => {
    const screen = render(<App />);

    expect(screen.getByText("Freshful Assistant")).toBeTruthy();

    fireEvent.press(screen.getByText("Open dashboard"));

    await waitFor(() => {
      expect(screen.getByText("Live backend check")).toBeTruthy();
      expect(screen.getByText(/3-day draft\s+with/i)).toBeTruthy();
    });
  });

  test("shares planner preview state across screens", async () => {
    const screen = render(<App />);

    fireEvent.press(screen.getByText("Tune the plan shell"));
    fireEvent.press(screen.getByText("5 days"));
    fireEvent.press(screen.getByText("snack"));
    fireEvent.press(screen.getByText("Back to dashboard"));

    await waitFor(() => {
      expect(screen.getByText(/5-day draft\s+with/i)).toBeTruthy();
      expect(screen.getByText(/breakfast, lunch, dinner, snack/i)).toBeTruthy();
    });
  });
});