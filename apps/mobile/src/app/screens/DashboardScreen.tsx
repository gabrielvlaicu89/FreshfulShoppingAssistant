import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useAuth } from "../auth/context";
import type { RootStackParamList } from "../navigation/RootNavigator";
import type { DashboardProfileSummary } from "../profile/cache-storage";
import { useProfileSummary } from "../queries/profile";
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

function formatHousehold(profile: DashboardProfileSummary): string {
  const householdLabel =
    profile.householdType === "single"
      ? "Single household"
      : profile.householdType === "couple"
        ? "Couple household"
        : "Family household";

  if (profile.numChildren <= 0) {
    return householdLabel;
  }

  return `${householdLabel} · ${profile.numChildren} ${profile.numChildren === 1 ? "child" : "children"}`;
}

function formatList(values: string[], emptyLabel: string): string {
  return values.length > 0 ? values.join(", ") : emptyLabel;
}

function formatBudgetAndPrep(profile: DashboardProfileSummary): string {
  return `${profile.budgetBand} budget · ${profile.maxPrepTimeMinutes} min max prep`;
}

function getProfileStatusLabel(dataSource: ReturnType<typeof useProfileSummary>["dataSource"]): string {
  if (dataSource === "live") {
    return "Live profile";
  }

  if (dataSource === "cache") {
    return "Cached profile";
  }

  return "Profile needed";
}

export function DashboardScreen({ navigation }: Props): React.JSX.Element {
  const planDays = useAssistantShellStore((state) => state.planDays);
  const includedMeals = useAssistantShellStore((state) => state.includedMeals);
  const lastSavedPlanId = useAssistantShellStore((state) => state.lastSavedPlanId);
  const auth = useAuth();
  const profileSummary = useProfileSummary();
  const profile = profileSummary.profile;

  return (
    <Screen contentContainerStyle={styles.content}>
      <Card tone="accent">
        <View style={styles.heroRow}>
          <View style={styles.heroCopy}>
            <AppText variant="eyebrow">Home dashboard</AppText>
            <AppText variant="heading">Welcome back{auth.user?.displayName ? `, ${auth.user.displayName.split(" ")[0]}` : ""}.</AppText>
            <AppText variant="bodyMuted">
              The app keeps the backend-issued session in secure storage and refreshes your latest household profile from the API while keeping a local dashboard summary cache ready for offline-friendly relaunches.
            </AppText>
          </View>
          <Badge label={getProfileStatusLabel(profileSummary.dataSource)} tone={profileSummary.dataSource === "empty" ? "warning" : "success"} />
        </View>
      </Card>

      <Card>
        <AppText variant="title">Profile summary</AppText>
        <AppText variant="bodyMuted">{auth.user?.email ?? "Freshful user"}</AppText>
        {profileSummary.isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={palette.leaf} />
            <AppText variant="body">Loading the latest profile snapshot.</AppText>
          </View>
        ) : null}
        {profile ? (
          <View style={styles.stack}>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <AppText variant="caption">Household</AppText>
                <AppText variant="body">{formatHousehold(profile)}</AppText>
              </View>
              <View style={styles.summaryItem}>
                <AppText variant="caption">Budget and prep</AppText>
                <AppText variant="body">{formatBudgetAndPrep(profile)}</AppText>
              </View>
            </View>
            <AppText variant="bodyMuted">Cuisine preferences: {formatList(profile.cuisinePreferences, "No cuisine preferences saved yet")}</AppText>
            {profileSummary.dataSource === "cache" ? (
              <AppText variant="bodyMuted">Showing the last locally cached dashboard summary because the backend could not be reached.</AppText>
            ) : null}
            {profileSummary.isRefreshing ? <AppText variant="bodyMuted">Refreshing the cached snapshot from the backend.</AppText> : null}
          </View>
        ) : null}
        {!profile && !profileSummary.isLoading ? (
          <View style={styles.stack}>
            <Badge label="Profile empty" tone="warning" />
            <AppText variant="bodyMuted">
              No household profile is stored yet. Start the onboarding chat to capture your household preferences before generating plans.
            </AppText>
            <View style={styles.actionsRow}>
              <Button label="Start AI onboarding" onPress={() => navigation.navigate("Onboarding")} />
            </View>
          </View>
        ) : null}
        {profileSummary.isError ? (
          <View style={styles.stack}>
            <Badge label="Sync unavailable" tone="warning" />
            <AppText variant="bodyMuted">The backend profile could not be loaded and no cached snapshot was available.</AppText>
          </View>
        ) : null}
        {profile ? (
          <View style={styles.actionsRow}>
            <Button label="Review or revise profile" variant="ghost" onPress={() => navigation.navigate("Onboarding")} />
          </View>
        ) : null}
      </Card>

      <Card>
        <AppText variant="title">Planning</AppText>
        <AppText variant="bodyMuted">
          {profile
            ? lastSavedPlanId
              ? `Latest request: ${formatDraftLabel(planDays)} with ${includedMeals.join(", ")}. Reopen your last saved plan or generate a new one from the mobile planner.`
              : `${formatDraftLabel(planDays)} with ${includedMeals.join(", ")}. Generate a saved plan and refine it with AI from the mobile planner.`
            : lastSavedPlanId
              ? "Your household profile is unavailable right now, but you can still reopen the last saved plan while profile sync recovers."
              : "Finish onboarding first so future plans can use your captured household profile."}
        </AppText>
        <View style={styles.actionsRow}>
          <Button label={profile ? "Plan next meals" : "Finish onboarding first"} onPress={() => navigation.navigate(profile ? "PlannerPreview" : "Onboarding")} />
          {lastSavedPlanId ? (
            <Button
              label="View last saved plan"
              variant="ghost"
              onPress={() =>
                navigation.navigate({
                  name: "PlannerPreview",
                  params: { planId: lastSavedPlanId, reopenedAt: Date.now() },
                  merge: true
                })
              }
            />
          ) : null}
        </View>
      </Card>

      <Card>
        <AppText variant="title">Shopping lists</AppText>
        <AppText variant="bodyMuted">The dashboard reserves a clear handoff for shopping lists while product mapping and cart handoff are still pending.</AppText>
        <View style={styles.actionsRow}>
          <Button label="Shopping lists soon" variant="ghost" disabled onPress={() => undefined} />
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
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  summaryItem: {
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