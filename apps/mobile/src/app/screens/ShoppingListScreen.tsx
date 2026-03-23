import React from "react";
import { ActivityIndicator, Linking, StyleSheet, View } from "react-native";
import { useMutation } from "@tanstack/react-query";
import type { ShoppingList, ShoppingListItem } from "@freshful/contracts";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import type { RootStackParamList } from "../navigation/RootNavigator";
import { useAppRuntime } from "../runtime/context";
import { useAuth } from "../auth/context";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Screen } from "../ui/Screen";
import { AppText } from "../ui/Text";
import { palette, radius, spacing } from "../theme/tokens";

type Props = NativeStackScreenProps<RootStackParamList, "ShoppingList">;
type LoadRequest = { planId: string; source: "route" | "refresh" };

const freshfulWebUrl = "https://www.freshful.ro/";
const freshfulAppUrl = "freshful://";
const unresolvedCategoryLabel = "Needs review";

interface ShoppingListGroup {
  title: string;
  items: ShoppingListItem[];
}

function formatCurrency(value: number): string {
  return `RON ${value.toFixed(2)}`;
}

function formatQuantity(quantity: number, unit: string): string {
  return `${quantity} ${unit}`;
}

function getCategoryLabel(item: ShoppingListItem): string {
  return item.category?.trim() ? item.category : unresolvedCategoryLabel;
}

function groupItemsByCategory(items: ShoppingListItem[]): ShoppingListGroup[] {
  const groups = new Map<string, ShoppingListItem[]>();

  for (const item of items) {
    const category = getCategoryLabel(item);
    const existing = groups.get(category);

    if (existing) {
      existing.push(item);
      continue;
    }

    groups.set(category, [item]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => {
      if (left === unresolvedCategoryLabel) {
        return 1;
      }

      if (right === unresolvedCategoryLabel) {
        return -1;
      }

      return left.localeCompare(right);
    })
    .map(([title, groupedItems]) => ({
      title,
      items: [...groupedItems].sort((left, right) => left.ingredientName.localeCompare(right.ingredientName))
    }));
}

function getItemBadge(item: ShoppingListItem): { label: string; tone: "neutral" | "success" | "warning" } {
  if (item.resolutionSource === "unresolved") {
    return {
      label: "Needs review",
      tone: "warning"
    };
  }

  if (item.resolutionSource === "ai") {
    return {
      label: "AI-assisted match",
      tone: "success"
    };
  }

  return {
    label: "Freshful match",
    tone: "success"
  };
}

async function openFreshfulWeb(): Promise<void> {
  await Linking.openURL(freshfulWebUrl);
}

async function openFreshfulApp(): Promise<void> {
  const canOpenApp = await Linking.canOpenURL(freshfulAppUrl);

  await Linking.openURL(canOpenApp ? freshfulAppUrl : freshfulWebUrl);
}

export function ShoppingListScreen({ navigation, route }: Props): React.JSX.Element {
  const auth = useAuth();
  const { apiClient } = useAppRuntime();
  const accessToken = auth.session?.accessToken ?? "";
  const routePlanId = route.params.planId;
  const routeReloadToken = route.params.reopenedAt ?? null;
  const [shoppingList, setShoppingList] = React.useState<ShoppingList | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [handoffError, setHandoffError] = React.useState<string | null>(null);
  const hydratedRouteRequestKeyRef = React.useRef<string | null>(null);

  const loadShoppingListMutation = useMutation({
    mutationFn: ({ planId }: LoadRequest) => apiClient.createShoppingList(accessToken, planId),
    onMutate: (request) => {
      setLoadError(null);

      if (request.source === "route") {
        setShoppingList(null);
      }
    },
    onSuccess: (response) => {
      setShoppingList(response);
    },
    onError: (error) => {
      setLoadError(error instanceof Error ? error.message : "Shopping list generation failed.");
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
    loadShoppingListMutation.mutate({ planId: routePlanId, source: "route" });
  }, [accessToken, loadShoppingListMutation, routePlanId, routeReloadToken]);

  const groupedItems = shoppingList ? groupItemsByCategory(shoppingList.items) : [];
  const unresolvedCount = shoppingList?.items.filter((item) => item.resolutionSource === "unresolved").length ?? 0;

  const handleHandoff = React.useCallback(async (action: () => Promise<void>) => {
    setHandoffError(null);

    try {
      await action();
    } catch {
      setHandoffError("Freshful could not be opened right now. Try again in a moment.");
    }
  }, []);

  return (
    <Screen contentContainerStyle={styles.content}>
      <Card tone="accent">
        <AppText variant="eyebrow">Shopping list</AppText>
        <AppText variant="heading">Review the Freshful handoff before you leave the app.</AppText>
        <AppText variant="bodyMuted">
          Items are grouped by category, pricing is estimate-only, and unresolved ingredients stay visible so you can finish the handoff in Freshful without any unsupported cart autofill.
        </AppText>
      </Card>

      <Card>
        <AppText variant="title">Handoff summary</AppText>
        {route.params.planTitle ? <AppText variant="body">Plan: {route.params.planTitle}</AppText> : null}
        <AppText variant="bodyMuted">This version only opens Freshful web or app. It does not pre-fill the Freshful cart.</AppText>
        <View style={styles.metadataRow}>
          {shoppingList ? <Badge label={`${shoppingList.items.length} item${shoppingList.items.length === 1 ? "" : "s"}`} /> : null}
          {shoppingList ? (
            <Badge label={unresolvedCount > 0 ? `${unresolvedCount} unresolved` : "All items matched"} tone={unresolvedCount > 0 ? "warning" : "success"} />
          ) : null}
        </View>
        {shoppingList ? (
          <View style={styles.summaryBlock}>
            <View style={styles.estimateCard}>
              <AppText variant="caption">Estimated total</AppText>
              <AppText variant="title">{formatCurrency(shoppingList.totalEstimatedCost)}</AppText>
              <AppText variant="bodyMuted">Estimate only. Freshful pricing and availability can change before checkout.</AppText>
            </View>
            <AppText variant="bodyMuted">Generated {new Date(shoppingList.createdAt).toLocaleString()}</AppText>
          </View>
        ) : null}
        {loadShoppingListMutation.isPending && !shoppingList ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={palette.leaf} />
            <AppText variant="body">Generating your shopping list from the saved meal plan.</AppText>
          </View>
        ) : null}
        {loadError ? (
          <View style={styles.feedbackBlock}>
            <Badge label="Shopping list unavailable" tone="warning" />
            <AppText variant="bodyMuted">{loadError}</AppText>
          </View>
        ) : null}
        {handoffError ? (
          <View style={styles.feedbackBlock}>
            <Badge label="Freshful unavailable" tone="warning" />
            <AppText variant="bodyMuted">{handoffError}</AppText>
          </View>
        ) : null}
        {loadShoppingListMutation.isPending && shoppingList ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={palette.leaf} />
            <AppText variant="body">Refreshing estimate-only pricing and product matches.</AppText>
          </View>
        ) : null}
        <View style={styles.actionsRow}>
          <Button
            label="Refresh estimates"
            variant="ghost"
            disabled={loadShoppingListMutation.isPending || !accessToken}
            onPress={() => loadShoppingListMutation.mutate({ planId: routePlanId, source: "refresh" })}
          />
          <Button label="Open Freshful web" variant="ghost" onPress={() => void handleHandoff(openFreshfulWeb)} />
          <Button label="Open Freshful app" onPress={() => void handleHandoff(openFreshfulApp)} />
        </View>
      </Card>

      {groupedItems.map((group) => (
        <Card key={group.title}>
          <View style={styles.groupHeader}>
            <AppText variant="title">{group.title}</AppText>
            <Badge label={`${group.items.length} item${group.items.length === 1 ? "" : "s"}`} />
          </View>
          <View style={styles.itemStack}>
            {group.items.map((item) => {
              const itemBadge = getItemBadge(item);

              return (
                <View key={item.id} style={styles.itemCard}>
                  <View style={styles.itemHeader}>
                    <View style={styles.itemCopy}>
                      <AppText variant="title">{item.ingredientName}</AppText>
                      <AppText variant="bodyMuted">Need {formatQuantity(item.requiredQuantity, item.requiredUnit)}</AppText>
                    </View>
                    <Badge label={itemBadge.label} tone={itemBadge.tone} />
                  </View>
                  {item.matchedProduct ? <AppText variant="body">Matched: {item.matchedProduct.name}</AppText> : null}
                  {item.chosenQuantity && item.chosenUnit ? (
                    <AppText variant="bodyMuted">Freshful pack: {formatQuantity(item.chosenQuantity, item.chosenUnit)}</AppText>
                  ) : null}
                  <AppText variant="bodyMuted">{item.estimatedPrice !== null ? `Estimate: ${formatCurrency(item.estimatedPrice)}` : "Price estimate unavailable"}</AppText>
                  <AppText variant="bodyMuted">{item.resolutionReason}</AppText>
                </View>
              );
            })}
          </View>
        </Card>
      ))}

      <Button label="Back to dashboard" variant="ghost" onPress={() => navigation.navigate("Dashboard")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg
  },
  metadataRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md
  },
  summaryBlock: {
    gap: spacing.sm,
    marginTop: spacing.md
  },
  estimateCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.stroke,
    backgroundColor: palette.paperStrong,
    gap: spacing.xs
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md
  },
  feedbackBlock: {
    gap: spacing.sm,
    marginTop: spacing.md
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md
  },
  groupHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm
  },
  itemStack: {
    gap: spacing.md,
    marginTop: spacing.md
  },
  itemCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.stroke,
    backgroundColor: palette.paper,
    gap: spacing.xs
  },
  itemHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm
  },
  itemCopy: {
    flex: 1,
    gap: spacing.xs
  }
});