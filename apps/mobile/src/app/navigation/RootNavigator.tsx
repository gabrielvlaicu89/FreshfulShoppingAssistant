import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { DashboardScreen } from "../screens/DashboardScreen";
import { PlannerPreviewScreen } from "../screens/PlannerPreviewScreen";
import { WelcomeScreen } from "../screens/WelcomeScreen";
import { palette } from "../theme/tokens";

export type RootStackParamList = {
  Welcome: undefined;
  Dashboard: undefined;
  PlannerPreview: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator
      initialRouteName="Welcome"
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
      <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: "Freshful Assistant" }} />
      <Stack.Screen name="PlannerPreview" component={PlannerPreviewScreen} options={{ title: "Plan Preview" }} />
    </Stack.Navigator>
  );
}