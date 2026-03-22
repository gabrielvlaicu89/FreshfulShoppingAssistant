import React from "react";
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { palette, spacing } from "../theme/tokens";

export interface ScreenProps {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

export function Screen({ children, contentContainerStyle }: ScreenProps): React.JSX.Element {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <View style={styles.background} pointerEvents="none">
        <View style={styles.blobLarge} />
        <View style={styles.blobSmall} />
      </View>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, contentContainerStyle]}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.canvas
  },
  background: {
    ...StyleSheet.absoluteFillObject
  },
  blobLarge: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: palette.coralSoft,
    opacity: 0.5,
    top: -70,
    right: -40
  },
  blobSmall: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: palette.successSoft,
    opacity: 0.7,
    bottom: 60,
    left: -30
  },
  content: {
    flexGrow: 1,
    padding: spacing.lg,
    gap: spacing.md
  }
});