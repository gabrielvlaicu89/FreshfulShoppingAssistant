import React from "react";
import { StyleSheet, Text, type TextProps } from "react-native";

import { palette } from "../theme/tokens";

type Variant = "eyebrow" | "heading" | "title" | "body" | "bodyMuted" | "caption" | "button";

const variantStyles = StyleSheet.create({
  eyebrow: {
    fontFamily: "sans-serif-medium",
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: palette.leafDeep
  },
  heading: {
    fontFamily: "serif",
    fontSize: 34,
    lineHeight: 40,
    color: palette.ink
  },
  title: {
    fontFamily: "sans-serif-medium",
    fontSize: 20,
    lineHeight: 26,
    color: palette.ink
  },
  body: {
    fontFamily: "sans-serif",
    fontSize: 16,
    lineHeight: 23,
    color: palette.ink
  },
  bodyMuted: {
    fontFamily: "sans-serif",
    fontSize: 15,
    lineHeight: 22,
    color: palette.inkMuted
  },
  caption: {
    fontFamily: "sans-serif-medium",
    fontSize: 12,
    lineHeight: 16,
    color: palette.inkMuted
  },
  button: {
    fontFamily: "sans-serif-medium",
    fontSize: 15,
    lineHeight: 20
  }
});

export interface AppTextProps extends TextProps {
  variant?: Variant;
}

export function AppText({ children, style, variant = "body", ...rest }: AppTextProps): React.JSX.Element {
  return (
    <Text {...rest} style={[variantStyles[variant], style]}>
      {children}
    </Text>
  );
}