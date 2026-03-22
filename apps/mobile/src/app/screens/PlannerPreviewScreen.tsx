import React from "react";
import { StyleSheet, View } from "react-native";
import { mealSlotValues } from "@freshful/contracts";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import type { RootStackParamList } from "../navigation/RootNavigator";
import { useAssistantShellStore, type PlanDuration } from "../state/app-store";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Screen } from "../ui/Screen";
import { AppText } from "../ui/Text";
import { palette, spacing } from "../theme/tokens";

type Props = NativeStackScreenProps<RootStackParamList, "PlannerPreview">;

const planDurationOptions: PlanDuration[] = [1, 3, 5, 7];

export function PlannerPreviewScreen({ navigation }: Props): React.JSX.Element {
  const planDays = useAssistantShellStore((state) => state.planDays);
  const includedMeals = useAssistantShellStore((state) => state.includedMeals);
  const setPlanDays = useAssistantShellStore((state) => state.setPlanDays);
  const toggleMeal = useAssistantShellStore((state) => state.toggleMeal);

  return (
    <Screen contentContainerStyle={styles.content}>
      <Card tone="accent">
        <AppText variant="eyebrow">Shared shell state</AppText>
        <AppText variant="heading">This is the draft plan surface that authenticated flows will extend.</AppText>
        <AppText variant="bodyMuted">
          Zustand keeps these choices live across navigation without introducing persistence or auth concerns too early.
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
          <Badge label={`${planDays}-day preview`} tone="success" />
          <AppText variant="bodyMuted">{includedMeals.join(", ")}</AppText>
        </View>
      </Card>

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
  summary: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: palette.stroke,
    gap: spacing.sm
  }
});