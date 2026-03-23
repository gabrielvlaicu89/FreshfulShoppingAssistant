import React from "react";
import { StatusBar } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";

import { createApiClient } from "./api/client";
import { AuthProvider, useAuth } from "./auth/context";
import { createGoogleSignInClient } from "./auth/google-client";
import { createAuthSessionStorage } from "./auth/session-storage";
import { createAuthService } from "./auth/service";
import { getBundledMobileConfig } from "./config/runtime";
import { createPlannerCacheStorage } from "./planner/cache-storage";
import { createProfileCacheStorage } from "./profile/cache-storage";
import { AppRuntimeContext } from "./runtime/context";
import { RootNavigator } from "./navigation/RootNavigator";
import { createAppQueryClient } from "./query/client";
import { useAssistantShellStore } from "./state/app-store";
import { navigationTheme } from "./theme/navigation-theme";
import { palette } from "./theme/tokens";

function AssistantShellPersistence(): React.JSX.Element | null {
  const auth = useAuth();
  const runtime = React.useContext(AppRuntimeContext);
  const resetShell = useAssistantShellStore((state) => state.reset);
  const setLastSavedPlanId = useAssistantShellStore((state) => state.setLastSavedPlanId);
  const hydratedUserIdRef = React.useRef<string | null>(null);
  const currentUserId = auth.user?.id ?? null;

  React.useEffect(() => {
    let active = true;

    if (!runtime) {
      return () => {
        active = false;
      };
    }

    if (auth.status !== "signed-in" || !currentUserId) {
      const previousUserId = hydratedUserIdRef.current;

      hydratedUserIdRef.current = null;
      resetShell();

      if (previousUserId) {
        void runtime.plannerCacheStorage.clear(previousUserId);
      }

      return () => {
        active = false;
      };
    }

    const previousUserId = hydratedUserIdRef.current;

    if (previousUserId !== currentUserId) {
      resetShell();
      hydratedUserIdRef.current = currentUserId;

      if (previousUserId) {
        void runtime.plannerCacheStorage.clear(previousUserId);
      }
    }

    void runtime.plannerCacheStorage.read(currentUserId).then((record) => {
      if (!active || hydratedUserIdRef.current !== currentUserId) {
        return;
      }

      setLastSavedPlanId(record?.lastSavedPlanId ?? null);
    });

    return () => {
      active = false;
    };
  }, [auth.status, currentUserId, resetShell, runtime, setLastSavedPlanId]);

  return null;
}

export function AppShell(): React.JSX.Element {
  const [runtime] = React.useState(() => {
    const config = getBundledMobileConfig();

    return {
      config,
      apiClient: createApiClient(config),
      plannerCacheStorage: createPlannerCacheStorage(),
      profileCacheStorage: createProfileCacheStorage()
    };
  });
  const [authService] = React.useState(() =>
    createAuthService({
      apiClient: runtime.apiClient,
      googleClient: createGoogleSignInClient(runtime.config),
      sessionStorage: createAuthSessionStorage()
    })
  );
  const [queryClient] = React.useState(createAppQueryClient);

  React.useEffect(() => {
    return () => {
      queryClient.clear();
    };
  }, [queryClient]);

  return (
    <AppRuntimeContext.Provider value={runtime}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider authService={authService}>
          <AssistantShellPersistence />
          <NavigationContainer theme={navigationTheme}>
            <StatusBar barStyle="dark-content" backgroundColor={palette.canvas} />
            <RootNavigator />
          </NavigationContainer>
        </AuthProvider>
      </QueryClientProvider>
    </AppRuntimeContext.Provider>
  );
}