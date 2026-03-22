import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useAuth } from "../auth/context";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { useAssistantHealthQuery } from "../queries/assistant-health";
import { useAssistantShellStore } from "../state/app-store";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Screen } from "../ui/Screen";
import { AppText } from "../ui/Text";
import { palette, spacing } from "../theme/tokens";

type Props = NativeStackScreenProps<RootStackParamList, "Dashboard">;

function formatDraftLabel(planDays: number): string {
  return `${planDays}-day draft`;
}

export function DashboardScreen({ navigation }: Props): React.JSX.Element {
  const planDays = useAssistantShellStore((state) => state.planDays);
  const includedMeals = useAssistantShellStore((state) => state.includedMeals);
  const auth = useAuth();
  const healthQuery = useAssistantHealthQuery();

  return (
    <Screen contentContainerStyle={styles.content}>
      <Card tone="accent">
        <View style={styles.heroRow}>
          <View style={styles.heroCopy}>
            <AppText variant="eyebrow">Authenticated shell</AppText>
            <AppText variant="heading">Signed in and ready for the next product slice.</AppText>
            <AppText variant="bodyMuted">
              Session bootstrap now restores from secure storage, and the mobile app is using the backend-issued bearer token boundary described by the API.
            </AppText>
          </View>
          <Badge label={auth.user?.email ?? "Signed in"} tone="success" />
        </View>
      </Card>

      <Card>
        <AppText variant="title">Authenticated session</AppText>
        <AppText variant="bodyMuted">{auth.user?.displayName ?? auth.user?.email ?? "Freshful user"}</AppText>
        <AppText variant="bodyMuted">Session expires at {auth.session ? new Date(auth.session.expiresAt).toLocaleString() : "unknown"}.</AppText>
        <View style={styles.actionsRow}>
          <Button label={auth.isBusy ? "Signing out..." : "Log out"} variant="ghost" disabled={auth.isBusy} onPress={() => void auth.signOut()} />
        </View>
      </Card>

      <Card>
        <AppText variant="title">Live backend check</AppText>
        <AppText variant="bodyMuted">
          This uses TanStack Query against the existing API health endpoint so the shell proves real server-state flow.
        </AppText>
        {healthQuery.isPending ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={palette.leaf} />
            <AppText variant="body">Contacting {healthQuery.fetchStatus === "fetching" ? "the API" : "the cache"}.</AppText>
          </View>
        ) : null}
        {healthQuery.isError ? (
          <View style={styles.stack}>
            <Badge label="Backend unavailable" tone="warning" />
            <AppText variant="bodyMuted">
              The app shell still renders offline-safe, but the API at the configured base URL did not answer.
            </AppText>
          </View>
        ) : null}
        {healthQuery.data ? (
          <View style={styles.stack}>
            <View style={styles.statusHeader}>
              <Badge label={`${healthQuery.data.environment} runtime`} tone="neutral" />
              <Badge label={`uptime ${Math.round(healthQuery.data.uptimeSeconds)}s`} tone="success" />
            </View>
            <View style={styles.serviceGrid}>
              {Object.values(healthQuery.data.services).map((service) => (
                <View key={service.name} style={styles.servicePill}>
                  <AppText variant="caption">{service.name}</AppText>
                  <Badge label={service.status} tone={service.status === "ready" ? "success" : "neutral"} />
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </Card>

      <Card>
        <AppText variant="title">Current shared draft</AppText>
        <AppText variant="bodyMuted">
          {formatDraftLabel(planDays)} with {includedMeals.join(", ")}. This state is still intentionally local while P4-S3 handles dashboard data and profile caching.
        </AppText>
        <View style={styles.actionsRow}>
          <Button label="Tune plan preview" onPress={() => navigation.navigate("PlannerPreview")} />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg
  },
  heroRow: {
    gap: spacing.md
  },
  heroCopy: {
    gap: spacing.sm
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md
  },
  stack: {
    gap: spacing.md,
    marginTop: spacing.md
  },
  statusHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  serviceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  servicePill: {
    minWidth: 134,
    padding: spacing.sm,
    borderRadius: 18,
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: palette.stroke,
    gap: spacing.xs
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md
  }
});