import React from "react";
import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ShoppingList, ShoppingListItem } from "@freshful/contracts";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Linking } from "react-native";

import type { ApiClient } from "../src/app/api/client";
import { useAuth } from "../src/app/auth/context";
import type { RootStackParamList } from "../src/app/navigation/RootNavigator";
import { AppRuntimeContext, type AppRuntimeValue } from "../src/app/runtime/context";
import { ShoppingListScreen } from "../src/app/screens/ShoppingListScreen";

jest.mock("../src/app/auth/context", () => ({
  useAuth: jest.fn()
}));

const activeQueryClients = new Set<QueryClient>();

type ShoppingListScreenProps = NativeStackScreenProps<RootStackParamList, "ShoppingList">;
const eligiblePlanId = "dated-plan-template-1";

function createShoppingListPayload(overrides: Partial<Pick<ShoppingList, "items" | "totalEstimatedCost">> = {}): ShoppingList {
  const defaultItems: ShoppingListItem[] = [
    {
      id: "shopping-item-milk",
      listId: "shopping-list-1",
      ingredientName: "milk",
      requiredQuantity: 1,
      requiredUnit: "l",
      freshfulProductId: "product-milk-1",
      chosenQuantity: 1,
      chosenUnit: "1 l",
      estimatedPrice: 10.5,
      category: "Dairy",
      resolutionSource: "deterministic",
      resolutionReason: "Direct Freshful search match.",
      status: "pending",
      matchedProduct: {
        id: "product-milk-1",
        freshfulId: "freshful-milk-1",
        name: "Milk 1L",
        price: 10.5,
        currency: "RON",
        unit: "1 l",
        category: "Dairy",
        tags: ["milk"],
        imageUrl: "https://example.com/milk.png",
        lastSeenAt: "2026-03-23T12:20:00.000Z",
        availability: "in_stock",
        searchMetadata: {
          query: "milk",
          rank: 0,
          matchedTerm: "milk"
        }
      }
    },
    {
      id: "shopping-item-tomatoes",
      listId: "shopping-list-1",
      ingredientName: "tomatoes",
      requiredQuantity: 1000,
      requiredUnit: "g",
      freshfulProductId: "product-tomato-1",
      chosenQuantity: 2,
      chosenUnit: "500 g",
      estimatedPrice: 8.99,
      category: "Produce",
      resolutionSource: "ai",
      resolutionReason: "AI selected the closest produce match for this plan.",
      status: "pending",
      matchedProduct: {
        id: "product-tomato-1",
        freshfulId: "freshful-tomato-1",
        name: "Cherry Tomatoes 500 g",
        price: 8.99,
        currency: "RON",
        unit: "500 g",
        category: "Produce",
        tags: ["tomato"],
        imageUrl: "https://example.com/tomatoes.png",
        lastSeenAt: "2026-03-23T12:20:00.000Z",
        availability: "in_stock",
        searchMetadata: {
          query: "tomatoes",
          rank: 0,
          matchedTerm: "tomatoes"
        }
      }
    },
    {
      id: "shopping-item-oats",
      listId: "shopping-list-1",
      ingredientName: "oats",
      requiredQuantity: 500,
      requiredUnit: "g",
      freshfulProductId: "product-oats-1",
      chosenQuantity: 1,
      chosenUnit: "500 g",
      estimatedPrice: 7.99,
      category: "Pantry",
      resolutionSource: "deterministic",
      resolutionReason: "Direct Freshful search match.",
      status: "pending",
      matchedProduct: {
        id: "product-oats-1",
        freshfulId: "freshful-oats-1",
        name: "Rolled Oats 500 g",
        price: 7.99,
        currency: "RON",
        unit: "500 g",
        category: "Pantry",
        tags: ["oats"],
        imageUrl: "https://example.com/oats.png",
        lastSeenAt: "2026-03-23T12:20:00.000Z",
        availability: "in_stock",
        searchMetadata: {
          query: "oats",
          rank: 0,
          matchedTerm: "oats"
        }
      }
    }
  ];

  return {
    id: "shopping-list-1",
    userId: "user-1",
    planId: eligiblePlanId,
    createdAt: "2026-03-23T12:30:00.000Z",
    totalEstimatedCost: overrides.totalEstimatedCost ?? 27.48,
    status: "draft" as const,
    items: overrides.items ?? defaultItems
  };
}

function renderScreen(options: {
  apiClient: ApiClient;
  navigation?: Partial<ShoppingListScreenProps["navigation"]>;
  routeParams?: ShoppingListScreenProps["route"]["params"];
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
  } as unknown as ShoppingListScreenProps["navigation"];

  const route = {
    key: "shopping-list",
    name: "ShoppingList",
    params: options.routeParams ?? {
      planId: eligiblePlanId,
      planTitle: "3 Day Family Plan",
      reopenedAt: 1
    }
  } as ShoppingListScreenProps["route"];

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
        <ShoppingListScreen navigation={navigation} route={route} />
      </AppRuntimeContext.Provider>
    </QueryClientProvider>
  );
}

describe("shopping list screen", () => {
  afterEach(() => {
    cleanup();
    for (const queryClient of activeQueryClients) {
      queryClient.clear();
    }
    activeQueryClients.clear();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test("renders the shopping list for an eligible dated plan grouped by category with quantity and estimate-only pricing", async () => {
    const createShoppingListMock = jest.fn<ApiClient["createShoppingList"]>().mockResolvedValue(createShoppingListPayload());

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

    const apiClient = {
      createShoppingList: createShoppingListMock,
      getShoppingList: jest.fn(),
      createPlan: jest.fn(),
      getPlan: jest.fn(),
      getProfile: jest.fn(),
      getAssistantHealth: jest.fn(),
      exchangeGoogleIdToken: jest.fn(),
      refinePlan: jest.fn(),
      sendOnboardingMessage: jest.fn(),
      updateProfile: jest.fn(),
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
      }
    } as unknown as ApiClient;

    const screen = renderScreen({ apiClient });

    await waitFor(() => {
      expect(createShoppingListMock).toHaveBeenCalledWith("backend-session-token", eligiblePlanId);
      expect(screen.getByText("Dairy")).toBeTruthy();
      expect(screen.getByText("Produce")).toBeTruthy();
      expect(screen.getByText("Pantry")).toBeTruthy();
      expect(screen.getByText("Need 1 l")).toBeTruthy();
      expect(screen.getByText("Estimate: RON 10.50")).toBeTruthy();
      expect(screen.getByText("RON 27.48")).toBeTruthy();
      expect(screen.getByText(/Estimate only\./i)).toBeTruthy();
    });
  });

  test("shows unresolved ingredients in a visible needs-review group", async () => {
    const createShoppingListMock = jest.fn<ApiClient["createShoppingList"]>().mockResolvedValue(
      createShoppingListPayload({
        totalEstimatedCost: 10.5,
        items: [
          {
            id: "shopping-item-milk",
            listId: "shopping-list-1",
            ingredientName: "milk",
            requiredQuantity: 1,
            requiredUnit: "l",
            freshfulProductId: "product-milk-1",
            chosenQuantity: 1,
            chosenUnit: "1 l",
            estimatedPrice: 10.5,
            category: "Dairy",
            resolutionSource: "deterministic",
            resolutionReason: "Direct Freshful search match.",
            status: "pending",
            matchedProduct: {
              id: "product-milk-1",
              freshfulId: "freshful-milk-1",
              name: "Milk 1L",
              price: 10.5,
              currency: "RON",
              unit: "1 l",
              category: "Dairy",
              tags: ["milk"],
              imageUrl: "https://example.com/milk.png",
              lastSeenAt: "2026-03-23T12:20:00.000Z",
              availability: "in_stock",
              searchMetadata: {
                query: "milk",
                rank: 0,
                matchedTerm: "milk"
              }
            }
          },
          {
            id: "shopping-item-basil",
            listId: "shopping-list-1",
            ingredientName: "fresh basil",
            requiredQuantity: 1,
            requiredUnit: "bunch",
            freshfulProductId: null,
            chosenQuantity: null,
            chosenUnit: null,
            estimatedPrice: null,
            category: null,
            resolutionSource: "unresolved",
            resolutionReason: "No safe Freshful match was found for this ingredient.",
            status: "pending",
            matchedProduct: null
          }
        ]
      })
    );

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

    const apiClient = {
      createShoppingList: createShoppingListMock,
      getShoppingList: jest.fn(),
      createPlan: jest.fn(),
      getPlan: jest.fn(),
      getProfile: jest.fn(),
      getAssistantHealth: jest.fn(),
      exchangeGoogleIdToken: jest.fn(),
      refinePlan: jest.fn(),
      sendOnboardingMessage: jest.fn(),
      updateProfile: jest.fn(),
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
      }
    } as unknown as ApiClient;

    const screen = renderScreen({ apiClient });

    await waitFor(() => {
      expect(screen.getAllByText("Needs review").length).toBeGreaterThan(0);
      expect(screen.getByText("1 unresolved")).toBeTruthy();
      expect(screen.getByText("fresh basil")).toBeTruthy();
      expect(screen.getByText("Price estimate unavailable")).toBeTruthy();
      expect(screen.getByText("No safe Freshful match was found for this ingredient.")).toBeTruthy();
    });
  });

  test("shows the backend contract error when shopping-list generation is attempted for a template-only plan", async () => {
    const createShoppingListMock = jest
      .fn<ApiClient["createShoppingList"]>()
      .mockRejectedValue(new Error("Shopping list generation requires a dated meal plan instance."));

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

    const apiClient = {
      createShoppingList: createShoppingListMock,
      getShoppingList: jest.fn(),
      createPlan: jest.fn(),
      getPlan: jest.fn(),
      getProfile: jest.fn(),
      getAssistantHealth: jest.fn(),
      exchangeGoogleIdToken: jest.fn(),
      refinePlan: jest.fn(),
      sendOnboardingMessage: jest.fn(),
      updateProfile: jest.fn(),
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
      }
    } as unknown as ApiClient;

    const screen = renderScreen({
      apiClient,
      routeParams: {
        planId: "template-only-plan",
        planTitle: "Template-only plan",
        reopenedAt: 1
      }
    });

    await waitFor(() => {
      expect(createShoppingListMock).toHaveBeenCalledWith("backend-session-token", "template-only-plan");
      expect(screen.getByText("Shopping list unavailable")).toBeTruthy();
      expect(screen.getByText("Shopping list generation requires a dated meal plan instance.")).toBeTruthy();
    });

    expect(screen.queryByText("Dairy")).toBeNull();
  });

  test("opens Freshful web directly and falls back to web when the app deep link is unavailable", async () => {
    const createShoppingListMock = jest.fn<ApiClient["createShoppingList"]>().mockResolvedValue(createShoppingListPayload());
    const openUrlSpy = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const canOpenUrlSpy = jest.spyOn(Linking, "canOpenURL").mockResolvedValue(false);

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

    const apiClient = {
      createShoppingList: createShoppingListMock,
      getShoppingList: jest.fn(),
      createPlan: jest.fn(),
      getPlan: jest.fn(),
      getProfile: jest.fn(),
      getAssistantHealth: jest.fn(),
      exchangeGoogleIdToken: jest.fn(),
      refinePlan: jest.fn(),
      sendOnboardingMessage: jest.fn(),
      updateProfile: jest.fn(),
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
      }
    } as unknown as ApiClient;

    const screen = renderScreen({ apiClient });

    await waitFor(() => {
      expect(screen.getByText("Open Freshful web")).toBeTruthy();
      expect(screen.getByText("Open Freshful app")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Open Freshful web"));

    await waitFor(() => {
      expect(openUrlSpy).toHaveBeenCalledWith("https://www.freshful.ro/");
    });

    fireEvent.press(screen.getByText("Open Freshful app"));

    await waitFor(() => {
      expect(canOpenUrlSpy).toHaveBeenCalledWith("freshful://");
      expect(openUrlSpy).toHaveBeenLastCalledWith("https://www.freshful.ro/");
    });
  });
});