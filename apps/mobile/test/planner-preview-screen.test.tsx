import React from "react";
import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import type { ApiClient } from "../src/app/api/client";
import { useAuth } from "../src/app/auth/context";
import type { RootStackParamList } from "../src/app/navigation/RootNavigator";
import { PlannerPreviewScreen } from "../src/app/screens/PlannerPreviewScreen";
import { AppRuntimeContext, type AppRuntimeValue } from "../src/app/runtime/context";
import { resetAssistantShellStore, useAssistantShellStore } from "../src/app/state/app-store";

jest.mock("../src/app/auth/context", () => ({
  useAuth: jest.fn()
}));

const activeQueryClients = new Set<QueryClient>();

type PlannerScreenProps = NativeStackScreenProps<RootStackParamList, "PlannerPreview">;

function createPlannerRecipes(selectedSlots: Array<"breakfast" | "lunch" | "dinner" | "snack">) {
  return selectedSlots.map((slot, index) => ({
    id: `recipe-${slot}`,
    title:
      slot === "breakfast"
        ? "Yogurt Oat Bowl"
        : slot === "lunch"
          ? "Herby Couscous Bowl"
          : slot === "dinner"
            ? "Lentil Tomato Skillet"
            : "Apple Nut Bites",
    ingredients: [
      {
        name: `${slot}-ingredient-${index + 1}`,
        quantity: 1,
        unit: "portion"
      }
    ],
    instructions: [`Prepare the ${slot} recipe.`],
    tags: [slot, "planner"],
    estimatedMacros: {
      calories: 250 + index * 90,
      proteinGrams: 14 + index * 3,
      carbsGrams: 22 + index * 5,
      fatGrams: 8 + index * 2
    }
  }));
}

function createPlanDetailPayload(durationDays: number, selectedSlots: Array<"breakfast" | "lunch" | "dinner" | "snack">) {
  const template = {
    id: "plan-template-1",
    userId: "user-1",
    title: `${durationDays} Day Family Plan`,
    durationDays,
    recipes: createPlannerRecipes(selectedSlots),
    days: Array.from({ length: durationDays }, (_, index) => ({
      dayNumber: index + 1,
      meals: selectedSlots.map((slot) => ({
        slot,
        recipeId: `recipe-${slot}`
      }))
    })),
    metadata: {
      tags: ["family", "planner"],
      estimatedMacros: {
        calories: durationDays * 960,
        proteinGrams: durationDays * 48,
        carbsGrams: durationDays * 102,
        fatGrams: durationDays * 34
      }
    }
  };

  return {
    template,
    instance: null,
    revisionHistory: [
      {
        templateId: template.id,
        parentTemplateId: null,
        title: template.title,
        createdAt: "2026-03-22T12:00:00.000Z",
        instanceId: null,
        startDate: null,
        endDate: null
      }
    ]
  };
}

function createRefinedPlanDetailPayload(source: ReturnType<typeof createPlanDetailPayload>) {
  const refinedTemplate = {
    ...source.template,
    id: "plan-template-2",
    title: `${source.template.title} - Refined`,
    recipes: source.template.recipes.map((recipe, index) =>
      index === 0
        ? {
            ...recipe,
            title: `${recipe.title} Plus Protein`
          }
        : recipe
    )
  };

  return {
    template: refinedTemplate,
    instance: source.instance,
    revisionHistory: [
      ...source.revisionHistory,
      {
        templateId: refinedTemplate.id,
        parentTemplateId: source.template.id,
        title: refinedTemplate.title,
        createdAt: "2026-03-22T12:20:00.000Z",
        instanceId: null,
        startDate: null,
        endDate: null
      }
    ]
  };
}

function renderScreen(options: {
  apiClient: ApiClient;
  navigation?: Partial<PlannerScreenProps["navigation"]>;
  routeParams?: PlannerScreenProps["route"]["params"];
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      },
      mutations: {
        retry: false
      }
    }
  });
  activeQueryClients.add(queryClient);

  const navigation = {
    navigate: jest.fn(),
    ...options.navigation
  } as unknown as PlannerScreenProps["navigation"];

  const route = {
    key: "planner-preview",
    name: "PlannerPreview",
    params: options.routeParams
  } as PlannerScreenProps["route"];

  const runtime: AppRuntimeValue = {
    config: {
      appEnv: "test",
      apiBaseUrl: "http://10.0.2.2:3000",
      google: {
        androidClientId: "test-android-client.apps.googleusercontent.com",
        webClientId: "test-web-client.apps.googleusercontent.com"
      },
      network: {
        requestTimeoutMs: 12000
      }
    },
    apiClient: options.apiClient,
    profileCacheStorage: {
      async read() {
        return null;
      },
      async write() {
        return undefined;
      },
      async clear() {
        return undefined;
      }
    },
    plannerCacheStorage: {
      async read() {
        return null;
      },
      async write() {
        return undefined;
      },
      async clear() {
        return undefined;
      }
    }
  };

  return render(
    <QueryClientProvider client={queryClient}>
      <AppRuntimeContext.Provider value={runtime}>
        <PlannerPreviewScreen navigation={navigation} route={route} />
      </AppRuntimeContext.Provider>
    </QueryClientProvider>
  );
}

describe("planner preview screen", () => {
  afterEach(() => {
    cleanup();
    for (const queryClient of activeQueryClients) {
      queryClient.clear();
    }
    activeQueryClients.clear();
    resetAssistantShellStore();
    jest.clearAllMocks();
  });

  test("keeps the refined revision visible after reopening a saved plan route", async () => {
    const basePlan = createPlanDetailPayload(3, ["breakfast", "lunch", "dinner"]);
    const refinedPlan = createRefinedPlanDetailPayload(basePlan);
    const getPlanMock = jest.fn<ApiClient["getPlan"]>().mockResolvedValue(basePlan);
    const refinePlanMock = jest.fn<ApiClient["refinePlan"]>().mockResolvedValue(refinedPlan);

    jest.mocked(useAuth).mockReturnValue({
      status: "signed-in",
      isBusy: false,
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
      },
      errorMessage: null,
      signIn: async () => undefined,
      signOut: async () => undefined
    });
    useAssistantShellStore.getState().rememberLastSavedPlan("plan-template-1");

    const apiClient = {
      createPlan: jest.fn(),
      getPlan: getPlanMock,
      getProfile: jest.fn(),
      getHealth: jest.fn(),
      refinePlan: refinePlanMock,
      sendOnboardingMessage: jest.fn(),
      signInWithGoogle: jest.fn(),
      updateProfile: jest.fn()
    } as unknown as ApiClient;

    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const screen = renderScreen({
        apiClient,
        routeParams: {
          planId: "plan-template-1",
          reopenedAt: 1
        }
      });

      await waitFor(() => {
        expect(getPlanMock).toHaveBeenCalledWith("backend-session-token", "plan-template-1");
        expect(screen.getByText("Current plan")).toBeTruthy();
        expect(screen.getByTestId("planner-refinement-input")).toBeTruthy();
      });

      fireEvent.changeText(screen.getByTestId("planner-refinement-input"), "Swap breakfast for a higher-protein option.");
      fireEvent.press(screen.getByText("Apply refinement"));

      await waitFor(() => {
        expect(refinePlanMock).toHaveBeenCalledWith(
          "backend-session-token",
          "plan-template-1",
          "Swap breakfast for a higher-protein option."
        );
        expect(screen.getByText("Current revision 2")).toBeTruthy();
        expect(screen.getAllByText("3 Day Family Plan - Refined").length).toBeGreaterThan(0);
        expect(screen.getAllByText("Yogurt Oat Bowl Plus Protein").length).toBeGreaterThan(0);
      });

      expect(getPlanMock).toHaveBeenCalledTimes(1);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  test("clears stale plan detail when reopening a saved plan fails", async () => {
    const basePlan = createPlanDetailPayload(3, ["breakfast", "lunch", "dinner"]);
    const getPlanMock = jest.fn<ApiClient["getPlan"]>().mockImplementation(async (_accessToken, planId) => {
      if (planId === "plan-template-1") {
        return basePlan;
      }

      throw new Error("Saved plan missing");
    });

    jest.mocked(useAuth).mockReturnValue({
      status: "signed-in",
      isBusy: false,
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
      },
      errorMessage: null,
      signIn: async () => undefined,
      signOut: async () => undefined
    });
    useAssistantShellStore.getState().rememberLastSavedPlan("plan-template-2");

    const apiClient = {
      createPlan: jest.fn(),
      getPlan: getPlanMock,
      getProfile: jest.fn(),
      getHealth: jest.fn(),
      refinePlan: jest.fn(),
      sendOnboardingMessage: jest.fn(),
      signInWithGoogle: jest.fn(),
      updateProfile: jest.fn()
    } as unknown as ApiClient;

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        },
        mutations: {
          retry: false
        }
      }
    });
    activeQueryClients.add(queryClient);

    const navigation = { navigate: jest.fn() } as unknown as PlannerScreenProps["navigation"];
    const runtime: AppRuntimeValue = {
      config: {
        appEnv: "test",
        apiBaseUrl: "http://10.0.2.2:3000",
        google: {
          androidClientId: "test-android-client.apps.googleusercontent.com",
          webClientId: "test-web-client.apps.googleusercontent.com"
        },
        network: {
          requestTimeoutMs: 12000
        }
      },
      apiClient,
      profileCacheStorage: {
        async read() {
          return null;
        },
        async write() {
          return undefined;
        },
        async clear() {
          return undefined;
        }
      },
      plannerCacheStorage: {
        async read() {
          return null;
        },
        async write() {
          return undefined;
        },
        async clear() {
          return undefined;
        }
      }
    };

    const screen = render(
      <QueryClientProvider client={queryClient}>
        <AppRuntimeContext.Provider value={runtime}>
          <PlannerPreviewScreen
            navigation={navigation}
            route={{ key: "planner-preview", name: "PlannerPreview", params: { planId: "plan-template-1", reopenedAt: 1 } }}
          />
        </AppRuntimeContext.Provider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Current plan")).toBeTruthy();
      expect(screen.getAllByText("3 Day Family Plan").length).toBeGreaterThan(0);
    });

    useAssistantShellStore.getState().setLastSavedPlanId("plan-template-2");

    screen.rerender(
      <QueryClientProvider client={queryClient}>
        <AppRuntimeContext.Provider value={runtime}>
          <PlannerPreviewScreen
            navigation={navigation}
            route={{ key: "planner-preview", name: "PlannerPreview", params: { planId: "plan-template-2", reopenedAt: 2 } }}
          />
        </AppRuntimeContext.Provider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Saved plan unavailable")).toBeTruthy();
      expect(screen.getByText("Saved plan missing")).toBeTruthy();
    });

    expect(screen.queryByText("Current plan")).toBeNull();
    expect(screen.queryByText("3 Day Family Plan")).toBeNull();
    expect(useAssistantShellStore.getState().lastSavedPlanId).toBeNull();
  });
});