import React from "react";
import { StatusBar } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";

import { createApiClient } from "./api/client";
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
  const [queryClient] = React.useState(createAppQueryClient);

  return (
    <AppRuntimeContext.Provider value={runtime}>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer theme={navigationTheme}>
          <StatusBar barStyle="dark-content" backgroundColor={palette.canvas} />
          <RootNavigator />
        </NavigationContainer>
      </QueryClientProvider>
    </AppRuntimeContext.Provider>
  );
}