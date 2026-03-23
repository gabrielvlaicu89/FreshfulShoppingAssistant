import type { HouseholdProfile, ShoppingListItemResolutionSource } from "@freshful/contracts";

import { ClaudeUsageLimitError } from "../ai/errors.js";
import type { ClaudeService } from "../ai/service.js";
import type { FreshfulCatalogAdapter, FreshfulSearchProductCandidate } from "../freshful/contracts.js";
import type { AggregatedShoppingIngredient } from "./aggregation.js";

const unitAliases = new Map<string, { kind: "mass" | "volume" | "count"; multiplier: number }>([
  ["g", { kind: "mass", multiplier: 1 }],
  ["gram", { kind: "mass", multiplier: 1 }],
  ["grams", { kind: "mass", multiplier: 1 }],
  ["gr", { kind: "mass", multiplier: 1 }],
  ["kg", { kind: "mass", multiplier: 1000 }],
  ["kilogram", { kind: "mass", multiplier: 1000 }],
  ["kilograms", { kind: "mass", multiplier: 1000 }],
  ["ml", { kind: "volume", multiplier: 1 }],
  ["milliliter", { kind: "volume", multiplier: 1 }],
  ["milliliters", { kind: "volume", multiplier: 1 }],
  ["l", { kind: "volume", multiplier: 1000 }],
  ["lt", { kind: "volume", multiplier: 1000 }],
  ["liter", { kind: "volume", multiplier: 1000 }],
  ["liters", { kind: "volume", multiplier: 1000 }],
  ["piece", { kind: "count", multiplier: 1 }],
  ["pieces", { kind: "count", multiplier: 1 }],
  ["pc", { kind: "count", multiplier: 1 }],
  ["pcs", { kind: "count", multiplier: 1 }],
  ["buc", { kind: "count", multiplier: 1 }],
  ["buc.", { kind: "count", multiplier: 1 }],
  ["tbsp", { kind: "volume", multiplier: 15 }],
  ["tablespoon", { kind: "volume", multiplier: 15 }],
  ["tablespoons", { kind: "volume", multiplier: 15 }],
  ["tsp", { kind: "volume", multiplier: 5 }],
  ["teaspoon", { kind: "volume", multiplier: 5 }],
  ["teaspoons", { kind: "volume", multiplier: 5 }]
]);

const animalProductTokens = [
  "chicken",
  "beef",
  "pork",
  "fish",
  "shrimp",
  "meat",
  "egg",
  "eggs",
  "ou",
  "oua",
  "lapte",
  "milk",
  "cheese",
  "branza",
  "yogurt",
  "iaurt",
  "butter",
  "unt"
] as const;
const vegetarianAnimalTokens = ["chicken", "beef", "pork", "fish", "shrimp", "meat", "pui", "vita", "porc"] as const;
const glutenTokens = ["gluten", "wheat", "grau", "paste", "pasta"] as const;
const dairyTokens = ["milk", "lapte", "branza", "cheese", "iaurt", "yogurt", "unt", "butter"] as const;
const eggTokens = ["egg", "eggs", "ou", "oua"] as const;
const peanutTokens = ["peanut", "peanuts", "arahide"] as const;
const nutTokens = ["almond", "almonds", "migdal", "nuci", "nuts", "hazelnut", "hazelnuts", "caju", "cashew"] as const;
const soyTokens = ["soy", "soia"] as const;
const fishTokens = ["fish", "peste", "somon", "salmon", "ton", "tuna"] as const;
const shellfishTokens = ["shrimp", "creveti", "shellfish", "fructe de mare"] as const;
const sesameTokens = ["sesame", "susan"] as const;

export interface ResolvedShoppingListItemInput extends AggregatedShoppingIngredient {
  freshfulProductId: string | null;
  chosenQuantity: number | null;
  chosenUnit: string | null;
  estimatedPrice: number | null;
  category: string | null;
  resolutionSource: ShoppingListItemResolutionSource;
  resolutionReason: string;
}

export interface ResolveShoppingListItemsOptions {
  items: AggregatedShoppingIngredient[];
  profile: HouseholdProfile | null;
  freshfulCatalog: FreshfulCatalogAdapter;
  aiService: ClaudeService | null;
}

interface ComparableQuantity {
  kind: "mass" | "volume" | "count";
  amount: number;
}

interface ScoredCandidate {
  candidate: FreshfulSearchProductCandidate;
  score: number;
}

interface ResolutionMetadata {
  source: ShoppingListItemResolutionSource;
  reason: string;
}

interface DeterministicSelectionResult {
  chosenCandidate: FreshfulSearchProductCandidate | null;
  needsAiTieBreak: boolean;
  rankedCandidates: FreshfulSearchProductCandidate[];
  reason: string;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/\s+/u)
    .filter((token) => token.length > 1);
}

function singularizeTerm(value: string): string {
  if (value.endsWith("ies")) {
    return `${value.slice(0, -3)}y`;
  }

  if (value.endsWith("oes")) {
    return value.slice(0, -2);
  }

  if (value.endsWith("ses") || value.endsWith("ss")) {
    return value;
  }

  if (value.endsWith("s")) {
    return value.slice(0, -1);
  }

  return value;
}

function createSearchQueries(ingredientName: string): string[] {
  const normalizedIngredient = ingredientName.trim();
  const singularized = normalizedIngredient
    .split(/\s+/u)
    .map((term) => singularizeTerm(term))
    .join(" ")
    .trim();

  return [...new Set([normalizedIngredient, singularized].filter((term) => term.length > 0))];
}

function parseComparableQuantity(quantity: number, unit: string): ComparableQuantity | null {
  const normalizedUnit = normalizeText(unit).replace(/\.+$/u, "");
  const alias = unitAliases.get(normalizedUnit);

  if (!alias) {
    return null;
  }

  return {
    kind: alias.kind,
    amount: quantity * alias.multiplier
  };
}

function parseComparableProductQuantity(unitLabel: string): ComparableQuantity | null {
  const match = normalizeText(unitLabel).match(/(?<amount>\d+(?:[.,]\d+)?)\s*(?<unit>[a-z.]+)/u);

  if (!match?.groups) {
    return null;
  }

  const amount = Number(match.groups.amount.replace(",", "."));

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return parseComparableQuantity(amount, match.groups.unit);
}

function estimateCoverage(
  item: AggregatedShoppingIngredient,
  candidate: FreshfulSearchProductCandidate
): { chosenQuantity: number; chosenUnit: string; estimatedPrice: number } {
  const requiredQuantity = parseComparableQuantity(item.requiredQuantity, item.requiredUnit);
  const packageQuantity = parseComparableProductQuantity(candidate.unit);

  if (!requiredQuantity || !packageQuantity || requiredQuantity.kind !== packageQuantity.kind) {
    return {
      chosenQuantity: 1,
      chosenUnit: candidate.unit,
      estimatedPrice: roundCurrency(candidate.price)
    };
  }

  const chosenQuantity = Math.max(1, Math.ceil(requiredQuantity.amount / packageQuantity.amount));

  return {
    chosenQuantity,
    chosenUnit: candidate.unit,
    estimatedPrice: roundCurrency(chosenQuantity * candidate.price)
  };
}

function hasAnyTokenMatch(text: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => text.includes(token));
}

function getHardConstraintViolations(
  candidate: FreshfulSearchProductCandidate,
  profile: HouseholdProfile | null
): string[] {
  if (!profile) {
    return [];
  }

  const candidateText = normalizeText(`${candidate.name} ${candidate.category} ${candidate.tags.join(" ")}`);
  const violations: string[] = [];

  if (profile.dietaryRestrictions.includes("vegan") && hasAnyTokenMatch(candidateText, animalProductTokens)) {
    violations.push("the candidate is not vegan");
  } else if (
    profile.dietaryRestrictions.includes("vegetarian") &&
    hasAnyTokenMatch(candidateText, vegetarianAnimalTokens)
  ) {
    violations.push("the candidate is not vegetarian");
  }

  if (
    profile.dietaryRestrictions.includes("gluten-free") &&
    !candidateText.includes("fara gluten") &&
    !candidateText.includes("gluten free") &&
    hasAnyTokenMatch(candidateText, glutenTokens)
  ) {
    violations.push("the candidate is not gluten-free");
  }

  if (profile.allergies.normalized.includes("dairy") && hasAnyTokenMatch(candidateText, dairyTokens)) {
    violations.push("the candidate conflicts with the dairy allergy");
  }

  if (profile.allergies.normalized.includes("eggs") && hasAnyTokenMatch(candidateText, eggTokens)) {
    violations.push("the candidate conflicts with the egg allergy");
  }

  if (profile.allergies.normalized.includes("peanuts") && hasAnyTokenMatch(candidateText, peanutTokens)) {
    violations.push("the candidate conflicts with the peanut allergy");
  }

  if (profile.allergies.normalized.includes("tree-nuts") && hasAnyTokenMatch(candidateText, nutTokens)) {
    violations.push("the candidate conflicts with the tree-nut allergy");
  }

  if (profile.allergies.normalized.includes("soy") && hasAnyTokenMatch(candidateText, soyTokens)) {
    violations.push("the candidate conflicts with the soy allergy");
  }

  if (profile.allergies.normalized.includes("fish") && hasAnyTokenMatch(candidateText, fishTokens)) {
    violations.push("the candidate conflicts with the fish allergy");
  }

  if (profile.allergies.normalized.includes("shellfish") && hasAnyTokenMatch(candidateText, shellfishTokens)) {
    violations.push("the candidate conflicts with the shellfish allergy");
  }

  if (profile.allergies.normalized.includes("sesame") && hasAnyTokenMatch(candidateText, sesameTokens)) {
    violations.push("the candidate conflicts with the sesame allergy");
  }

  return violations;
}

function scoreProfileCompatibility(candidate: FreshfulSearchProductCandidate, profile: HouseholdProfile | null): number {
  if (!profile) {
    return 0;
  }

  const candidateText = normalizeText(`${candidate.name} ${candidate.category} ${candidate.tags.join(" ")}`);
  let score = 0;

  if (
    profile.dietaryRestrictions.includes("gluten-free") &&
    (candidateText.includes("fara gluten") || candidateText.includes("gluten free"))
  ) {
    score += 14;
  }

  if (profile.favoriteIngredients.some((ingredient) => candidateText.includes(normalizeText(ingredient)))) {
    score += 6;
  }

  if (profile.dislikedIngredients.some((ingredient) => candidateText.includes(normalizeText(ingredient)))) {
    score -= 20;
  }

  return score;
}

function scoreCandidate(
  item: AggregatedShoppingIngredient,
  candidate: FreshfulSearchProductCandidate,
  profile: HouseholdProfile | null,
  candidatePrices: number[]
): number {
  const ingredientPhrase = normalizeText(item.ingredientName);
  const ingredientTokens = tokenize(item.ingredientName);
  const productName = normalizeText(candidate.name);
  const categoryText = normalizeText(candidate.category);
  const candidateText = normalizeText(`${candidate.name} ${candidate.category} ${candidate.tags.join(" ")}`);
  const tokenMatches = ingredientTokens.filter((token) => candidateText.includes(token)).length;
  const requiredQuantity = parseComparableQuantity(item.requiredQuantity, item.requiredUnit);
  const packageQuantity = parseComparableProductQuantity(candidate.unit);
  const minPrice = candidatePrices.length > 0 ? Math.min(...candidatePrices) : candidate.price;
  const maxPrice = candidatePrices.length > 0 ? Math.max(...candidatePrices) : candidate.price;
  const hasComparableUnit = Boolean(requiredQuantity && packageQuantity && requiredQuantity.kind === packageQuantity.kind);
  let score = 0;

  if (productName.includes(ingredientPhrase)) {
    score += 34;
  }

  score += tokenMatches * 10;

  if (categoryText.includes(ingredientPhrase) || ingredientTokens.some((token) => categoryText.includes(token))) {
    score += 8;
  }

  if (hasComparableUnit) {
    score += 14;
  }

  if (candidate.availability === "in_stock") {
    score += 16;
  } else if (candidate.availability === "low_stock") {
    score += 8;
  } else if (candidate.availability === "unknown") {
    score += 3;
  } else {
    score -= 20;
  }

  score += Math.max(0, 12 - (candidate.searchMetadata?.rank ?? 4) * 3);

  if (maxPrice > minPrice) {
    score += ((maxPrice - candidate.price) / (maxPrice - minPrice)) * 6;
  }

  score += scoreProfileCompatibility(candidate, profile);

  return roundCurrency(score);
}

function chooseDeterministicCandidate(
  item: AggregatedShoppingIngredient,
  candidates: FreshfulSearchProductCandidate[],
  profile: HouseholdProfile | null
): DeterministicSelectionResult {
  if (candidates.length === 0) {
    return {
      chosenCandidate: null,
      needsAiTieBreak: false,
      rankedCandidates: [],
      reason: "Freshful search returned no candidates for this ingredient."
    };
  }

  const safeCandidates = candidates.filter((candidate) => getHardConstraintViolations(candidate, profile).length === 0);

  if (safeCandidates.length === 0) {
    return {
      chosenCandidate: null,
      needsAiTieBreak: false,
      rankedCandidates: [],
      reason:
        "No safe Freshful candidates remained after applying hard dietary and allergy constraints for this household."
    };
  }

  const availableCandidates = safeCandidates.filter((candidate) => candidate.availability !== "out_of_stock");
  const consideredCandidates = availableCandidates.length > 0 ? availableCandidates : safeCandidates;
  const candidatePrices = consideredCandidates.map((candidate) => candidate.price);
  const scoredCandidates: ScoredCandidate[] = consideredCandidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(item, candidate, profile, candidatePrices)
    }))
    .sort((left, right) => right.score - left.score);

  if (scoredCandidates.length === 0) {
    return {
      chosenCandidate: null,
      needsAiTieBreak: false,
      rankedCandidates: [],
      reason: "Available Freshful candidates conflicted with the household constraints or stock status."
    };
  }

  const [topCandidate, secondCandidate] = scoredCandidates;

  if (!secondCandidate) {
    return {
      chosenCandidate: topCandidate.score >= 18 ? topCandidate.candidate : null,
      needsAiTieBreak: false,
      rankedCandidates: scoredCandidates.map((entry) => entry.candidate),
      reason:
        topCandidate.score >= 18
          ? `Deterministic rules selected "${topCandidate.candidate.name}" as the only viable Freshful candidate.`
          : `Only "${topCandidate.candidate.name}" remained, but the deterministic score was too weak for an automatic match.`
    };
  }

  const scoreLead = topCandidate.score - secondCandidate.score;
  const shouldTrustTopCandidate = topCandidate.score >= 32 && scoreLead >= 8;

  return {
    chosenCandidate: shouldTrustTopCandidate ? topCandidate.candidate : null,
    needsAiTieBreak: !shouldTrustTopCandidate,
    rankedCandidates: scoredCandidates.map((entry) => entry.candidate),
    reason: shouldTrustTopCandidate
      ? `Deterministic rules selected "${topCandidate.candidate.name}" with a clear lead over other Freshful candidates.`
      : `Multiple Freshful candidates remained plausible, so deterministic scoring deferred to an AI tie-break.`
  };
}

async function searchCandidates(
  freshfulCatalog: FreshfulCatalogAdapter,
  ingredientName: string
): Promise<FreshfulSearchProductCandidate[]> {
  for (const query of createSearchQueries(ingredientName)) {
    const result = await freshfulCatalog.searchProducts({ query });

    if (result.products.length > 0) {
      return result.products;
    }
  }

  return [];
}

function toResolvedItem(
  item: AggregatedShoppingIngredient,
  candidate: FreshfulSearchProductCandidate | null,
  resolution: ResolutionMetadata
): ResolvedShoppingListItemInput {
  if (!candidate) {
    return {
      ...item,
      freshfulProductId: null,
      chosenQuantity: null,
      chosenUnit: null,
      estimatedPrice: null,
      category: null,
      resolutionSource: resolution.source,
      resolutionReason: resolution.reason
    };
  }

  const coverage = estimateCoverage(item, candidate);

  return {
    ...item,
    freshfulProductId: candidate.id,
    chosenQuantity: coverage.chosenQuantity,
    chosenUnit: coverage.chosenUnit,
    estimatedPrice: coverage.estimatedPrice,
    category: candidate.category,
    resolutionSource: resolution.source,
    resolutionReason: resolution.reason
  };
}

export async function resolveShoppingListItems(
  options: ResolveShoppingListItemsOptions
): Promise<ResolvedShoppingListItemInput[]> {
  const resolvedItems: ResolvedShoppingListItemInput[] = [];

  for (const item of options.items) {
    let candidates: FreshfulSearchProductCandidate[];

    try {
      candidates = await searchCandidates(options.freshfulCatalog, item.ingredientName);
    } catch {
      resolvedItems.push(
        toResolvedItem(item, null, {
          source: "unresolved",
          reason: "Freshful search failed while resolving this ingredient."
        })
      );
      continue;
    }

    const deterministicSelection = chooseDeterministicCandidate(item, candidates, options.profile);

    if (deterministicSelection.chosenCandidate) {
      resolvedItems.push(
        toResolvedItem(item, deterministicSelection.chosenCandidate, {
          source: "deterministic",
          reason: deterministicSelection.reason
        })
      );
      continue;
    }

    if (options.aiService && deterministicSelection.needsAiTieBreak && deterministicSelection.rankedCandidates.length > 1) {
      try {
        const aiSelection = await options.aiService.selectShoppingProduct({
          ingredientName: item.ingredientName,
          requiredQuantity: item.requiredQuantity,
          requiredUnit: item.requiredUnit,
          profile: options.profile
            ? {
                dietaryRestrictions: options.profile.dietaryRestrictions,
                allergies: options.profile.allergies,
                favoriteIngredients: options.profile.favoriteIngredients,
                dislikedIngredients: options.profile.dislikedIngredients,
                cuisinePreferences: options.profile.cuisinePreferences,
                budgetBand: options.profile.budgetBand
              }
            : null,
          candidates: deterministicSelection.rankedCandidates.slice(0, 4).map((candidate) => ({
            id: candidate.id,
            name: candidate.name,
            price: candidate.price,
            currency: candidate.currency,
            unit: candidate.unit,
            category: candidate.category,
            tags: candidate.tags,
            availability: candidate.availability,
            searchRank: candidate.searchMetadata?.rank ?? null
          }))
        });
        const selectedCandidate = deterministicSelection.rankedCandidates.find(
          (candidate) => candidate.id === aiSelection.selectedProductId
        );

        resolvedItems.push(
          toResolvedItem(item, selectedCandidate ?? null, {
            source: selectedCandidate ? "ai" : "unresolved",
            reason: aiSelection.reason
          })
        );
        continue;
      } catch (error) {
        const resolutionReason =
          error instanceof ClaudeUsageLimitError
            ? "AI tie-break was skipped because the Anthropic usage budget is currently exhausted."
            : "AI tie-break failed after deterministic scoring could not choose a safe match.";

        resolvedItems.push(
          toResolvedItem(item, null, {
            source: "unresolved",
            reason: resolutionReason
          })
        );
        continue;
      }
    }

    resolvedItems.push(
      toResolvedItem(item, null, {
        source: "unresolved",
        reason: deterministicSelection.reason
      })
    );
  }

  return resolvedItems;
}