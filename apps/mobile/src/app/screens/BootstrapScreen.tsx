import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { Card } from "../ui/Card";
import { Screen } from "../ui/Screen";
import { AppText } from "../ui/Text";
import { palette, spacing } from "../theme/tokens";

export function BootstrapScreen(): React.JSX.Element {
  return (
    <Screen contentContainerStyle={styles.content}>
      <Card tone="accent">
        <View style={styles.loadingRow}>
          <ActivityIndicator color={palette.leaf} />
          <AppText variant="title">Restoring your Freshful session</AppText>
        </View>
        <AppText variant="bodyMuted">
          The app is reading the stored backend session from secure device storage before deciding whether sign-in is needed.
        </AppText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    justifyContent: "center"
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  }
});