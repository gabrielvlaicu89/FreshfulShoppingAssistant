import React from "react";
import { StyleSheet, View } from "react-native";

import { palette, radius, spacing } from "../theme/tokens";
import { AppText } from "./Text";

type Tone = "neutral" | "success" | "warning";

const toneStyles: Record<Tone, { backgroundColor: string; textColor: string }> = {
  neutral: {
    backgroundColor: palette.paperStrong,
    textColor: palette.ink
  },
  success: {
    backgroundColor: palette.successSoft,
    textColor: palette.leafDeep
  },
  warning: {
    backgroundColor: palette.coralSoft,
    textColor: palette.warning
  }
};

export interface BadgeProps {
  label: string;
  tone?: Tone;
}

export function Badge({ label, tone = "neutral" }: BadgeProps): React.JSX.Element {
  const selectedTone = toneStyles[tone];

  return (
    <View style={[styles.container, { backgroundColor: selectedTone.backgroundColor }]}> 
      <AppText variant="caption" style={{ color: selectedTone.textColor }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg
  }
});