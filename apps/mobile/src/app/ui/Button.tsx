import React from "react";
import { Pressable, StyleSheet, ViewStyle } from "react-native";

import { palette, radius, spacing } from "../theme/tokens";
import { AppText } from "./Text";

type Variant = "solid" | "ghost";

export interface ButtonProps {
  label: string;
  onPress(): void;
  variant?: Variant;
  style?: ViewStyle;
  disabled?: boolean;
}

export function Button({ label, onPress, variant = "solid", style, disabled = false }: ButtonProps): React.JSX.Element {
  const solid = variant === "solid";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        solid ? styles.solid : styles.ghost,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style
      ]}
    >
      <AppText variant="button" style={solid ? styles.solidText : styles.ghostText}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center"
  },
  solid: {
    backgroundColor: palette.leaf
  },
  ghost: {
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: palette.stroke
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }]
  },
  disabled: {
    opacity: 0.58
  },
  solidText: {
    color: palette.paper
  },
  ghostText: {
    color: palette.ink
  }
});