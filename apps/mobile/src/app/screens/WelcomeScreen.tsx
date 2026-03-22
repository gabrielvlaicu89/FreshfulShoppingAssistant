import React from "react";
import { StyleSheet, View } from "react-native";

import { useAuth } from "../auth/context";
import { useAppRuntime } from "../runtime/context";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Screen } from "../ui/Screen";
import { AppText } from "../ui/Text";
import { spacing } from "../theme/tokens";

export function WelcomeScreen(): React.JSX.Element {
  const { config } = useAppRuntime();
  const auth = useAuth();

  return (
    <Screen contentContainerStyle={styles.content}>
      <Card tone="accent">
        <Badge label="Google Sign-In" tone="success" />
        <AppText variant="heading">Freshful Assistant</AppText>
        <AppText variant="body">
          Plan meals, map ingredients to Freshful, and keep the experience fast enough for everyday grocery planning.
        </AppText>
        <AppText variant="bodyMuted">
          Sign in with Google, exchange the ID token with the backend, and keep only the backend session in secure device storage for relaunch.
        </AppText>
      </Card>

      <View style={styles.featureGrid}>
        <Card>
          <AppText variant="title">Backend session only</AppText>
          <AppText variant="bodyMuted">Google proves identity once. The app persists only the backend-issued session for authenticated API calls.</AppText>
        </Card>
        <Card>
          <AppText variant="title">Secure restore</AppText>
          <AppText variant="bodyMuted">The stored session is read from encrypted device storage when the app boots, so relaunch does not force a new sign-in.</AppText>
        </Card>
        <Card>
          <AppText variant="title">Runtime config</AppText>
          <AppText variant="bodyMuted">API base URL: {config.apiBaseUrl}</AppText>
          <AppText variant="bodyMuted">Android client ID: {config.google.androidClientId}</AppText>
        </Card>
      </View>

      {auth.errorMessage ? (
        <Card>
          <Badge label="Sign-in failed" tone="warning" />
          <AppText variant="bodyMuted">{auth.errorMessage}</AppText>
        </Card>
      ) : null}

      <View style={styles.actionsRow}>
        <Button label={auth.isBusy ? "Signing in..." : "Continue with Google"} disabled={auth.isBusy} onPress={() => void auth.signIn()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    justifyContent: "center"
  },
  featureGrid: {
    gap: spacing.md
  },
  actionsRow: {
    gap: spacing.sm
  }
});