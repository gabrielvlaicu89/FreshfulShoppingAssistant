import React from "react";
import { StatusBar } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";

import { createApiClient } from "./api/client";
import { AuthProvider } from "./auth/context";
import { createGoogleSignInClient } from "./auth/google-client";
import { createAuthSessionStorage } from "./auth/session-storage";
import { createAuthService } from "./auth/service";
import { getBundledMobileConfig } from "./config/runtime";
import { AppRuntimeContext } from "./runtime/context";
import { RootNavigator } from "./navigation/RootNavigator";
import { createAppQueryClient } from "./query/client";
import { navigationTheme } from "./theme/navigation-theme";
import { palette } from "./theme/tokens";

export function AppShell(): React.JSX.Element {
  const [runtime] = React.useState(() => {
    const config = getBundledMobileConfig();

    return {
      config,
      apiClient: createApiClient(config)
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

  return (
    <AppRuntimeContext.Provider value={runtime}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider authService={authService}>
          <NavigationContainer theme={navigationTheme}>
            <StatusBar barStyle="dark-content" backgroundColor={palette.canvas} />
            <RootNavigator />
          </NavigationContainer>
        </AuthProvider>
      </QueryClientProvider>
    </AppRuntimeContext.Provider>
  );
}