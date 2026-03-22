import React from "react";
import { ActivityIndicator, StyleSheet, TextInput, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { HouseholdProfile, OnboardingChatMessage } from "@freshful/contracts";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import {
  editableProfileSchema,
  partialEditableProfileSchema,
  type EditableProfile,
  type OnboardingStructuredProfile,
  type PartialEditableProfile
} from "../api/client";
import { useAuth } from "../auth/context";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { toDashboardProfileSummary } from "../profile/cache-storage";
import { useProfileDetails } from "../queries/profile";
import { useAppRuntime } from "../runtime/context";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Screen } from "../ui/Screen";
import { AppText } from "../ui/Text";
import { palette, radius, spacing } from "../theme/tokens";

type Props = NativeStackScreenProps<RootStackParamList, "Onboarding">;

function toEditableProfile(profile: HouseholdProfile): EditableProfile {
  return editableProfileSchema.parse({
    householdType: profile.householdType,
    numChildren: profile.numChildren,
    dietaryRestrictions: profile.dietaryRestrictions,
    allergies: profile.allergies,
    medicalFlags: profile.medicalFlags,
    goals: profile.goals,
    cuisinePreferences: profile.cuisinePreferences,
    favoriteIngredients: profile.favoriteIngredients,
    dislikedIngredients: profile.dislikedIngredients,
    budgetBand: profile.budgetBand,
    maxPrepTimeMinutes: profile.maxPrepTimeMinutes,
    cookingSkill: profile.cookingSkill
  });
}

function mergeDraftProfile(current: PartialEditableProfile | null, incoming: PartialEditableProfile | null): PartialEditableProfile | null {
  if (!incoming) {
    return current;
  }

  return partialEditableProfileSchema.parse({
    ...current,
    ...incoming,
    allergies: incoming.allergies || current?.allergies
      ? {
          ...(current?.allergies ?? {}),
          ...(incoming.allergies ?? {})
        }
      : undefined,
    medicalFlags: incoming.medicalFlags || current?.medicalFlags
      ? {
          ...(current?.medicalFlags ?? {}),
          ...(incoming.medicalFlags ?? {})
        }
      : undefined
  });
}

function formatList(values: string[] | undefined, emptyLabel: string): string {
  return values && values.length > 0 ? values.join(", ") : emptyLabel;
}

function formatHousehold(profile: PartialEditableProfile | null): string {
  if (!profile?.householdType) {
    return "Not captured yet";
  }

  const householdLabel =
    profile.householdType === "single"
      ? "Single household"
      : profile.householdType === "couple"
        ? "Couple household"
        : "Family household";

  if (typeof profile.numChildren !== "number" || profile.numChildren <= 0) {
    return householdLabel;
  }

  return `${householdLabel} · ${profile.numChildren} ${profile.numChildren === 1 ? "child" : "children"}`;
}

function formatBudgetAndPrep(profile: PartialEditableProfile | null): string {
  if (!profile?.budgetBand && typeof profile?.maxPrepTimeMinutes !== "number") {
    return "Not captured yet";
  }

  const parts = [profile?.budgetBand ? `${profile.budgetBand} budget` : null, typeof profile?.maxPrepTimeMinutes === "number" ? `${profile.maxPrepTimeMinutes} min max prep` : null].filter(
    Boolean
  );

  return parts.join(" · ");
}

function formatMedicalFlags(profile: PartialEditableProfile | null): string {
  if (!profile?.medicalFlags) {
    return "Not captured yet";
  }

  const flags = [
    profile.medicalFlags.diabetes ? "Diabetes" : null,
    profile.medicalFlags.hypertension ? "Hypertension" : null
  ].filter(Boolean);

  return flags.length > 0 ? flags.join(", ") : "None flagged";
}

function formatAllergies(profile: PartialEditableProfile | null): string {
  if (!profile?.allergies) {
    return "Not captured yet";
  }

  const normalized = profile.allergies.normalized;
  const freeText = profile.allergies.freeText;
  const parts = [
    normalized.length > 0 ? `Known: ${normalized.join(", ")}` : null,
    freeText.length > 0 ? `Notes: ${freeText.join(", ")}` : null
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "None reported";
}

function getStructuredProfileStatusLabel(structuredProfile: OnboardingStructuredProfile | null, canConfirm: boolean): string {
  if (structuredProfile?.status === "invalid") {
    return "Needs revision";
  }

  if (structuredProfile?.status === "incomplete") {
    return "Profile in progress";
  }

  if (canConfirm) {
    return "Ready to confirm";
  }

  return "Profile draft";
}

function getStructuredProfileTone(structuredProfile: OnboardingStructuredProfile | null, canConfirm: boolean): "success" | "warning" {
  if (structuredProfile?.status === "invalid" || structuredProfile?.status === "incomplete") {
    return "warning";
  }

  return canConfirm ? "success" : "warning";
}

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallbackMessage;
}

function getConfirmButtonLabel(confirming: boolean, hasExistingProfile: boolean): string {
  if (confirming) {
    return hasExistingProfile ? "Saving profile..." : "Confirming profile...";
  }

  return hasExistingProfile ? "Save profile" : "Confirm profile";
}

export function OnboardingScreen({ navigation }: Props): React.JSX.Element {
  const auth = useAuth();
  const { apiClient, profileCacheStorage } = useAppRuntime();
  const queryClient = useQueryClient();
  const profileDetails = useProfileDetails();
  const accessToken = auth.session?.accessToken ?? "";
  const userId = auth.user?.id ?? "";
  const [composerValue, setComposerValue] = React.useState("");
  const [messages, setMessages] = React.useState<OnboardingChatMessage[]>([]);
  const [draftProfile, setDraftProfile] = React.useState<PartialEditableProfile | null>(null);
  const [structuredProfile, setStructuredProfile] = React.useState<OnboardingStructuredProfile | null>(null);
  const [lastSubmittedMessage, setLastSubmittedMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    const existingProfile = profileDetails.profile;

    if (!existingProfile) {
      return;
    }

    setDraftProfile((current: PartialEditableProfile | null) => current ?? toEditableProfile(existingProfile));
  }, [profileDetails.profile]);

  const confirmCandidate = React.useMemo(() => {
    const result = editableProfileSchema.safeParse(draftProfile);

    return result.success ? result.data : null;
  }, [draftProfile]);

  const sendMessageMutation = useMutation({
    mutationFn: (message: string) => apiClient.sendOnboardingMessage(accessToken, message),
    onSuccess(response) {
      setMessages(response.transcript.messages);
      setStructuredProfile(response.structuredProfile);
      setDraftProfile((current: PartialEditableProfile | null) => mergeDraftProfile(current, response.structuredProfile.profile));
      setComposerValue("");
    }
  });

  const confirmProfileMutation = useMutation({
    mutationFn: (profile: EditableProfile) => apiClient.updateProfile(accessToken, profile),
    async onSuccess(profile) {
      queryClient.setQueryData(["profile", userId], profile);
      await profileCacheStorage.write(toDashboardProfileSummary(profile));
      navigation.navigate("Dashboard");
    }
  });

  const confirmProfilePending = confirmProfileMutation.isPending;
  const assistantUpdatePending = sendMessageMutation.isPending;
  const onboardingActionsDisabled = assistantUpdatePending || confirmProfilePending;

  function submitMessage(message: string): void {
    const nextMessage = message.trim();

    if (!nextMessage || onboardingActionsDisabled || !accessToken) {
      return;
    }

    setLastSubmittedMessage(nextMessage);
    sendMessageMutation.mutate(nextMessage);
  }
  const hasExistingProfile = Boolean(profileDetails.profile);

  return (
    <Screen contentContainerStyle={styles.content}>
      <Card tone="accent">
        <Badge label={hasExistingProfile ? "Profile review" : "AI onboarding"} tone="success" />
        <AppText variant="heading">Build your household profile.</AppText>
        <AppText variant="bodyMuted">
          Ask the assistant to capture household size, diet, allergies, goals, budget, and prep constraints. Each reply updates the structured profile snapshot below.
        </AppText>
        {hasExistingProfile ? (
          <AppText variant="bodyMuted">Your saved profile is preloaded, so you can review it, confirm it again, or revise it through chat.</AppText>
        ) : null}
      </Card>

      <Card>
        <View style={styles.sectionHeader}>
          <AppText variant="title">Onboarding chat</AppText>
          {profileDetails.isRefreshing ? <AppText variant="caption">Refreshing saved profile…</AppText> : null}
        </View>
        <View style={styles.chatStack}>
          {messages.length === 0 ? (
            <View style={[styles.messageBubble, styles.assistantBubble]}>
              <AppText variant="caption">Assistant</AppText>
              <AppText variant="body">Tell me about your household, dietary needs, favorite cuisines, budget, and how much time you want to spend cooking.</AppText>
            </View>
          ) : null}
          {messages.map((message) => {
            const userMessage = message.role === "user";

            return (
              <View key={message.id} style={[styles.messageBubble, userMessage ? styles.userBubble : styles.assistantBubble]}>
                <AppText variant="caption">{userMessage ? "You" : "Assistant"}</AppText>
                <AppText variant="body">{message.content}</AppText>
              </View>
            );
          })}
          {sendMessageMutation.isPending ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={palette.leaf} />
              <AppText variant="body">Assistant is updating your household profile.</AppText>
            </View>
          ) : null}
        </View>
        <View style={styles.composerCard}>
          <TextInput
            accessibilityLabel="Onboarding message"
            editable={!confirmProfilePending}
            multiline
            onChangeText={setComposerValue}
            placeholder="Describe your household or ask for a correction."
            placeholderTextColor={palette.inkMuted}
            style={styles.composerInput}
            testID="onboarding-composer-input"
            value={composerValue}
          />
          <Button
            label={sendMessageMutation.isPending ? "Sending..." : "Send message"}
            disabled={onboardingActionsDisabled || composerValue.trim().length === 0}
            onPress={() => submitMessage(composerValue)}
          />
        </View>
      </Card>

      {sendMessageMutation.isError ? (
        <Card>
          <Badge label="Chat unavailable" tone="warning" />
          <AppText variant="bodyMuted">{getErrorMessage(sendMessageMutation.error, "The onboarding assistant could not answer right now.")}</AppText>
          <View style={styles.actionsRow}>
            <Button
              label="Retry last message"
              variant="ghost"
              disabled={!lastSubmittedMessage || onboardingActionsDisabled}
              onPress={() => {
                if (lastSubmittedMessage) {
                  submitMessage(lastSubmittedMessage);
                }
              }}
            />
          </View>
        </Card>
      ) : null}

      <Card>
        <View style={styles.sectionHeader}>
          <AppText variant="title">Structured profile</AppText>
          <Badge label={getStructuredProfileStatusLabel(structuredProfile, Boolean(confirmCandidate))} tone={getStructuredProfileTone(structuredProfile, Boolean(confirmCandidate))} />
        </View>
        {profileDetails.isLoading && !draftProfile ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={palette.leaf} />
            <AppText variant="body">Loading your current saved profile.</AppText>
          </View>
        ) : null}
        <View style={styles.summaryGrid}>
          <View style={styles.summaryItem}>
            <AppText variant="caption">Household</AppText>
            <AppText variant="body">{formatHousehold(draftProfile)}</AppText>
          </View>
          <View style={styles.summaryItem}>
            <AppText variant="caption">Budget and prep</AppText>
            <AppText variant="body">{formatBudgetAndPrep(draftProfile)}</AppText>
          </View>
          <View style={styles.summaryItem}>
            <AppText variant="caption">Dietary restrictions</AppText>
            <AppText variant="body">{formatList(draftProfile?.dietaryRestrictions, "Not captured yet")}</AppText>
          </View>
          <View style={styles.summaryItem}>
            <AppText variant="caption">Allergies</AppText>
            <AppText variant="body">{formatAllergies(draftProfile)}</AppText>
          </View>
          <View style={styles.summaryItem}>
            <AppText variant="caption">Health flags</AppText>
            <AppText variant="body">{formatMedicalFlags(draftProfile)}</AppText>
          </View>
          <View style={styles.summaryItem}>
            <AppText variant="caption">Goals</AppText>
            <AppText variant="body">{formatList(draftProfile?.goals, "Not captured yet")}</AppText>
          </View>
          <View style={styles.summaryItem}>
            <AppText variant="caption">Cuisine preferences</AppText>
            <AppText variant="body">{formatList(draftProfile?.cuisinePreferences, "Not captured yet")}</AppText>
          </View>
          <View style={styles.summaryItem}>
            <AppText variant="caption">Favorite ingredients</AppText>
            <AppText variant="body">{formatList(draftProfile?.favoriteIngredients, "Not captured yet")}</AppText>
          </View>
          <View style={styles.summaryItem}>
            <AppText variant="caption">Disliked ingredients</AppText>
            <AppText variant="body">{formatList(draftProfile?.dislikedIngredients, "Not captured yet")}</AppText>
          </View>
          <View style={styles.summaryItem}>
            <AppText variant="caption">Cooking skill</AppText>
            <AppText variant="body">{draftProfile?.cookingSkill ?? "Not captured yet"}</AppText>
          </View>
        </View>
        {structuredProfile?.missingFields.length ? (
          <AppText variant="bodyMuted">Still missing: {structuredProfile.missingFields.join(", ")}.</AppText>
        ) : null}
        {structuredProfile?.status === "invalid" ? (
          <AppText variant="bodyMuted">The last response could not be turned into a valid profile. Ask the assistant to restate or correct the details.</AppText>
        ) : null}
        {confirmProfileMutation.isError ? (
          <View style={styles.stack}>
            <Badge label="Profile save failed" tone="warning" />
            <AppText variant="bodyMuted">{getErrorMessage(confirmProfileMutation.error, "The profile could not be confirmed right now.")}</AppText>
          </View>
        ) : null}
        <View style={styles.actionsRow}>
          <Button
            label={getConfirmButtonLabel(confirmProfileMutation.isPending, hasExistingProfile)}
            disabled={!confirmCandidate || confirmProfileMutation.isPending || assistantUpdatePending}
            onPress={() => {
              if (confirmCandidate) {
                confirmProfileMutation.mutate(confirmCandidate);
              }
            }}
          />
          <Button label="Back to dashboard" variant="ghost" onPress={() => navigation.navigate("Dashboard")} />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm
  },
  chatStack: {
    gap: spacing.sm
  },
  messageBubble: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    maxWidth: "92%"
  },
  assistantBubble: {
    alignSelf: "flex-start",
    backgroundColor: palette.paper,
    borderColor: palette.stroke
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: palette.paperStrong,
    borderColor: palette.coralSoft
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  composerCard: {
    marginTop: spacing.md,
    gap: spacing.sm
  },
  composerInput: {
    minHeight: 112,
    borderWidth: 1,
    borderColor: palette.stroke,
    borderRadius: radius.md,
    backgroundColor: palette.paper,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: palette.ink,
    textAlignVertical: "top",
    fontFamily: "sans-serif",
    fontSize: 16,
    lineHeight: 22
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  summaryItem: {
    minWidth: 140,
    flexGrow: 1,
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
  },
  stack: {
    gap: spacing.sm,
    marginTop: spacing.md
  }
});