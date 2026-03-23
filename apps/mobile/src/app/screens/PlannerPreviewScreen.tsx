import React from "react";
import { ActivityIndicator, StyleSheet, TextInput, View } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { mealSlotValues } from "@freshful/contracts";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import type { PlanDetailResponse, PlanRevision } from "../api/client";
import { useAuth } from "../auth/context";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { useAppRuntime } from "../runtime/context";
import { useAssistantShellStore, type PlanDuration } from "../state/app-store";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Screen } from "../ui/Screen";
import { AppText } from "../ui/Text";
import { palette, radius, spacing } from "../theme/tokens";

type Props = NativeStackScreenProps<RootStackParamList, "PlannerPreview">;
type LoadPlanRequest = { planId: string; source: "create" | "route" };

const planDurationOptions: PlanDuration[] = [1, 3, 5, 7];

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatRevisionLabel(revision: PlanRevision, index: number, total: number): string {
  if (index === total - 1) {
    return total === 1 ? "Current draft" : `Current revision ${total}`;
  }

  return index === 0 ? "Base draft" : `Revision ${index + 1}`;
}

function findRecipeTitle(plan: PlanDetailResponse, recipeId: string): string {
  return plan.template.recipes.find((recipe) => recipe.id === recipeId)?.title ?? "Recipe unavailable";
}

function getRevisionLineageLabel(history: PlanRevision[], index: number): string {
  const revision = history[index];

  if (!revision) {
    return "";
  }

  if (!revision.parentTemplateId) {
    return "Original saved plan";
  }

  const parentIndex = history.findIndex((candidate) => candidate.templateId === revision.parentTemplateId);

  if (parentIndex === -1) {
    return "Based on an earlier saved revision";
  }

  return `Based on ${formatRevisionLabel(history[parentIndex], parentIndex, history.length)}`;
}

export function PlannerPreviewScreen({ navigation, route }: Props): React.JSX.Element {
  const auth = useAuth();
  const { apiClient, plannerCacheStorage } = useAppRuntime();
  const planDays = useAssistantShellStore((state) => state.planDays);
  const includedMeals = useAssistantShellStore((state) => state.includedMeals);
  const lastSavedPlanId = useAssistantShellStore((state) => state.lastSavedPlanId);
  const rememberLastSavedPlan = useAssistantShellStore((state) => state.rememberLastSavedPlan);
  const setLastSavedPlanId = useAssistantShellStore((state) => state.setLastSavedPlanId);
  const setPlanDays = useAssistantShellStore((state) => state.setPlanDays);
  const toggleMeal = useAssistantShellStore((state) => state.toggleMeal);
  const accessToken = auth.session?.accessToken ?? "";
  const [planDetail, setPlanDetail] = React.useState<PlanDetailResponse | null>(null);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [refinementPrompt, setRefinementPrompt] = React.useState("");
  const [refinementError, setRefinementError] = React.useState<string | null>(null);
  const routePlanId = route.params?.planId ?? null;
  const routeReloadToken = route.params?.reopenedAt ?? null;
  const hydratedRouteRequestKeyRef = React.useRef<string | null>(null);
  const userId = auth.user?.id ?? null;

  const persistLastSavedPlan = React.useCallback(
    (planId: string) => {
      rememberLastSavedPlan(planId);

      if (!userId) {
        return;
      }

      void plannerCacheStorage.write(userId, planId);
    },
    [plannerCacheStorage, rememberLastSavedPlan, userId]
  );

  const loadPlanMutation = useMutation({
    mutationFn: ({ planId }: LoadPlanRequest) => apiClient.getPlan(accessToken, planId),
    onMutate: () => {
      setLoadError(null);
      setPlanDetail(null);
    },
    onSuccess: (response) => {
      setPlanDetail(response);
      persistLastSavedPlan(response.template.id);
      setCreateError(null);
      setRefinementError(null);
    },
    onError: (error, request) => {
      setLoadError(error instanceof Error ? error.message : "Saved plan detail could not be loaded.");

      if (request.source === "route" && userId && lastSavedPlanId === request.planId) {
        setLastSavedPlanId(null);
        void plannerCacheStorage.clear(userId);
      }
    }
  });

  const createPlanMutation = useMutation({
    mutationFn: () =>
      apiClient.createPlan(accessToken, {
        durationDays: planDays,
        mealSlots: includedMeals
      }),
    onMutate: () => {
      setCreateError(null);
      setLoadError(null);
    },
    onSuccess: (response) => {
      persistLastSavedPlan(response.template.id);
      loadPlanMutation.mutate({ planId: response.template.id, source: "create" });
      setRefinementPrompt("");
      setRefinementError(null);
    },
    onError: (error) => {
      setCreateError(error instanceof Error ? error.message : "Meal plan generation failed.");
    }
  });

  const refinePlanMutation = useMutation({
    mutationFn: () => {
      if (!planDetail) {
        throw new Error("Create a plan before requesting a refinement.");
      }

      return apiClient.refinePlan(accessToken, planDetail.template.id, refinementPrompt.trim());
    },
    onMutate: () => {
      setRefinementError(null);
      setLoadError(null);
    },
    onSuccess: (response) => {
      setPlanDetail(response);
      persistLastSavedPlan(response.template.id);
      setRefinementPrompt("");
    },
    onError: (error) => {
      setRefinementError(error instanceof Error ? error.message : "Meal plan refinement failed.");
    }
  });

  React.useEffect(() => {
    if (!accessToken || !routePlanId) {
      return;
    }

    const routeRequestKey = `${routePlanId}:${routeReloadToken ?? "initial"}`;

    if (hydratedRouteRequestKeyRef.current === routeRequestKey) {
      return;
    }

    hydratedRouteRequestKeyRef.current = routeRequestKey;
    loadPlanMutation.mutate({ planId: routePlanId, source: "route" });
  }, [accessToken, loadPlanMutation, routePlanId, routeReloadToken]);

  const latestRevision = planDetail ? planDetail.revisionHistory[planDetail.revisionHistory.length - 1] : null;
  const canOpenLastSavedPlan = Boolean(lastSavedPlanId && lastSavedPlanId !== routePlanId && lastSavedPlanId !== planDetail?.template.id);

  return (
    <Screen contentContainerStyle={styles.content}>
      <Card tone="accent">
        <AppText variant="eyebrow">Meal planner</AppText>
        <AppText variant="heading">Create a draft, inspect each day, and refine it with the assistant.</AppText>
        <AppText variant="bodyMuted">
          Choose the planning horizon and meal slots you want, generate a saved plan, then send targeted refinement prompts when you need swaps or adjustments.
        </AppText>
      </Card>

      <Card>
        <AppText variant="title">Planning horizon</AppText>
        <View style={styles.optionsRow}>
          {planDurationOptions.map((option) => {
            const selected = option === planDays;

            return (
              <Button
                key={option}
                label={`${option} day${option === 1 ? "" : "s"}`}
                variant={selected ? "solid" : "ghost"}
                onPress={() => setPlanDays(option)}
              />
            );
          })}
        </View>
      </Card>

      <Card>
        <AppText variant="title">Included meal slots</AppText>
        <View style={styles.optionsRow}>
          {mealSlotValues.map((slot) => {
            const selected = includedMeals.includes(slot);

            return (
              <Button
                key={slot}
                label={slot}
                variant={selected ? "solid" : "ghost"}
                onPress={() => toggleMeal(slot)}
              />
            );
          })}
        </View>
        <View style={styles.summary}>
          <Badge label={`${planDays}-day request`} tone="success" />
          <AppText variant="bodyMuted">{includedMeals.join(", ")}</AppText>
        </View>
        {createError ? (
          <View style={styles.feedbackBlock}>
            <Badge label="Generation failed" tone="warning" />
            <AppText variant="bodyMuted">{createError}</AppText>
          </View>
        ) : null}
        {createPlanMutation.isPending ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={palette.leaf} />
            <AppText variant="body">Generating your meal plan.</AppText>
          </View>
        ) : null}
        {loadPlanMutation.isPending ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={palette.leaf} />
            <AppText variant="body">Loading the latest saved plan detail.</AppText>
          </View>
        ) : null}
        {loadError ? (
          <View style={styles.feedbackBlock}>
            <Badge label="Saved plan unavailable" tone="warning" />
            <AppText variant="bodyMuted">{loadError}</AppText>
          </View>
        ) : null}
        <View style={styles.actionsRow}>
          <Button
            label={createPlanMutation.isPending ? "Generating..." : planDetail ? "Generate a new plan" : "Generate meal plan"}
            disabled={createPlanMutation.isPending || loadPlanMutation.isPending || refinePlanMutation.isPending || !accessToken}
            onPress={() => createPlanMutation.mutate()}
          />
          {canOpenLastSavedPlan && lastSavedPlanId ? (
            <Button
              label="Open last saved plan"
              variant="ghost"
              disabled={createPlanMutation.isPending || loadPlanMutation.isPending || refinePlanMutation.isPending}
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

      {planDetail ? (
        <Card>
          <AppText variant="title">Current plan</AppText>
          <AppText variant="body">{planDetail.template.title}</AppText>
          <View style={styles.metadataRow}>
            <Badge label={`${planDetail.template.durationDays} day${planDetail.template.durationDays === 1 ? "" : "s"}`} tone="success" />
            <Badge label={`${planDetail.revisionHistory.length} revision${planDetail.revisionHistory.length === 1 ? "" : "s"}`} />
          </View>
          {latestRevision ? <AppText variant="bodyMuted">Latest saved state: {latestRevision.title}</AppText> : null}
          <View style={styles.dayStack}>
            {planDetail.template.days.map((day) => (
              <View key={day.dayNumber} style={styles.dayCard}>
                <AppText variant="title">Day {day.dayNumber}</AppText>
                <View style={styles.dayMeals}>
                  {day.meals.map((meal) => (
                    <View key={`${day.dayNumber}-${meal.slot}`} style={styles.dayMealRow}>
                      <Badge label={capitalize(meal.slot)} />
                      <AppText variant="body">{findRecipeTitle(planDetail, meal.recipeId)}</AppText>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {planDetail ? (
        <Card>
          <AppText variant="title">Revision history</AppText>
          <View style={styles.dayStack}>
            {planDetail.revisionHistory.map((revision, index) => (
              <View key={revision.templateId} style={styles.revisionRow}>
                <View style={styles.revisionHeader}>
                  <Badge label={formatRevisionLabel(revision, index, planDetail.revisionHistory.length)} tone={index === planDetail.revisionHistory.length - 1 ? "success" : "neutral"} />
                  <AppText variant="caption">{getRevisionLineageLabel(planDetail.revisionHistory, index)}</AppText>
                </View>
                <AppText variant="body">{revision.title}</AppText>
                <AppText variant="bodyMuted">Saved {new Date(revision.createdAt).toLocaleString()}</AppText>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {planDetail ? (
        <Card>
          <AppText variant="title">Refine with AI</AppText>
          <AppText variant="bodyMuted">Ask for swaps, exclusions, or macro adjustments. Each successful change saves a new revision state.</AppText>
          <TextInput
            value={refinementPrompt}
            onChangeText={setRefinementPrompt}
            placeholder="Example: Swap dinner to tofu-based meals and lower total carbs."
            placeholderTextColor={palette.inkMuted}
            multiline
            editable={!createPlanMutation.isPending && !refinePlanMutation.isPending}
            testID="planner-refinement-input"
            style={styles.composerInput}
          />
          {refinementError ? (
            <View style={styles.feedbackBlock}>
              <Badge label="Refinement failed" tone="warning" />
              <AppText variant="bodyMuted">{refinementError}</AppText>
            </View>
          ) : null}
          {refinePlanMutation.isPending ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={palette.leaf} />
              <AppText variant="body">Applying your refinement request.</AppText>
            </View>
          ) : null}
          <View style={styles.actionsRow}>
            <Button
              label={refinePlanMutation.isPending ? "Refining..." : "Apply refinement"}
              variant="ghost"
              disabled={createPlanMutation.isPending || loadPlanMutation.isPending || refinePlanMutation.isPending || refinementPrompt.trim().length === 0}
              onPress={() => refinePlanMutation.mutate()}
            />
          </View>
        </Card>
      ) : null}

      <Button label="Back to dashboard" onPress={() => navigation.navigate("Dashboard")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg
  },
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md
  },
  summary: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: palette.stroke,
    gap: spacing.sm
  },
  feedbackBlock: {
    gap: spacing.sm,
    marginTop: spacing.md
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md
  },
  metadataRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm
  },
  dayStack: {
    gap: spacing.md,
    marginTop: spacing.md
  },
  dayCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.stroke,
    backgroundColor: palette.paperStrong,
    gap: spacing.sm
  },
  dayMeals: {
    gap: spacing.sm
  },
  dayMealRow: {
    gap: spacing.xs
  },
  revisionRow: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.stroke,
    backgroundColor: palette.paper,
    gap: spacing.xs
  },
  revisionHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm
  },
  composerInput: {
    minHeight: 124,
    borderWidth: 1,
    borderColor: palette.stroke,
    borderRadius: radius.md,
    backgroundColor: palette.paper,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: palette.ink,
    fontFamily: "sans-serif",
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: "top"
  }
});