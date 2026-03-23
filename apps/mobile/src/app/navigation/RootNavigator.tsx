import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { useAuth } from "../auth/context";
import { BootstrapScreen } from "../screens/BootstrapScreen";
import { DashboardScreen } from "../screens/DashboardScreen";
import { OnboardingScreen } from "../screens/OnboardingScreen";
import { PlannerPreviewScreen } from "../screens/PlannerPreviewScreen";
import { WelcomeScreen } from "../screens/WelcomeScreen";
import { palette } from "../theme/tokens";

export type RootStackParamList = {
  Bootstrap: undefined;
  Welcome: undefined;
  Dashboard: undefined;
  Onboarding: undefined;
  PlannerPreview: { planId?: string; reopenedAt?: number } | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator(): React.JSX.Element {
  const auth = useAuth();

  return (
    <Stack.Navigator
      initialRouteName={auth.status === "bootstrapping" ? "Bootstrap" : auth.status === "signed-in" ? "Dashboard" : "Welcome"}
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: {
          backgroundColor: palette.canvas
        },
        headerTintColor: palette.ink,
        headerTitleStyle: {
          fontFamily: "sans-serif-medium"
        },
        contentStyle: {
          backgroundColor: palette.canvas
        }
      }}
    >
      {auth.status === "bootstrapping" ? <Stack.Screen name="Bootstrap" component={BootstrapScreen} options={{ headerShown: false }} /> : null}
      {auth.status === "signed-out" ? <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} /> : null}
      {auth.status === "signed-in" ? <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: "Freshful Assistant" }} /> : null}
      {auth.status === "signed-in" ? <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ title: "Household Profile" }} /> : null}
      {auth.status === "signed-in" ? <Stack.Screen name="PlannerPreview" component={PlannerPreviewScreen} options={{ title: "Meal Planner" }} /> : null}
    </Stack.Navigator>
  );
}