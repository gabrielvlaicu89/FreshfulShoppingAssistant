import React from "react";
import { StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import type { RootStackParamList } from "../navigation/RootNavigator";
import { useAppRuntime } from "../runtime/context";
import { useAssistantShellStore } from "../state/app-store";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Screen } from "../ui/Screen";
import { AppText } from "../ui/Text";
import { spacing } from "../theme/tokens";

type Props = NativeStackScreenProps<RootStackParamList, "Welcome">;

export function WelcomeScreen({ navigation }: Props): React.JSX.Element {
  const markWelcomeSeen = useAssistantShellStore((state) => state.markWelcomeSeen);
  const { config } = useAppRuntime();

  return (
    <Screen contentContainerStyle={styles.content}>
      <Card tone="accent">
        <Badge label="Android-first preview" tone="success" />
        <AppText variant="heading">Freshful Assistant</AppText>
        <AppText variant="body">
          Plan meals, map ingredients to Freshful, and keep the experience fast enough for everyday grocery planning.
        </AppText>
        <AppText variant="bodyMuted">
          This shell is intentionally lean: it sets up navigation, shared state, live API queries, and client-safe runtime config before auth lands.
        </AppText>
      </Card>

      <View style={styles.featureGrid}>
        <Card>
          <AppText variant="title">Navigation</AppText>
          <AppText variant="bodyMuted">Native stack flow for welcome, dashboard, and plan-preview surfaces.</AppText>
        </Card>
        <Card>
          <AppText variant="title">Shared state</AppText>
          <AppText variant="bodyMuted">Zustand keeps draft selections stable while the auth flow is still pending.</AppText>
        </Card>
        <Card>
          <AppText variant="title">Runtime config</AppText>
          <AppText variant="bodyMuted">API base URL: {config.apiBaseUrl}</AppText>
        </Card>
      </View>

      <View style={styles.actionsRow}>
        <Button
          label="Open dashboard"
          onPress={() => {
            markWelcomeSeen();
            navigation.replace("Dashboard");
          }}
        />
        <Button label="Tune the plan shell" variant="ghost" onPress={() => navigation.navigate("PlannerPreview")} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    justifyContent: "center"
  },
  featureGrid: {
    gap: spacing.md
  },
  actionsRow: {
    gap: spacing.sm
  }
});