import React from "react";
import { StyleSheet, View, type ViewProps } from "react-native";

import { palette, radius, spacing } from "../theme/tokens";

type Tone = "default" | "accent";

export interface CardProps extends ViewProps {
  children: React.ReactNode;
  tone?: Tone;
}

export function Card({ children, style, tone = "default", ...rest }: CardProps): React.JSX.Element {
  return <View {...rest} style={[styles.base, tone === "accent" ? styles.accent : styles.default, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    gap: spacing.sm
  },
  default: {
    backgroundColor: palette.paper,
    borderColor: palette.stroke
  },
  accent: {
    backgroundColor: palette.paperStrong,
    borderColor: palette.coralSoft
  }
});