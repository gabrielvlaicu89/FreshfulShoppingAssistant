import type { MealPlanOverride } from "@freshful/contracts";

import type { PlanDetailResponse } from "../planner/contracts.js";

export interface AggregatedShoppingIngredient {
  ingredientName: string;
  requiredQuantity: number;
  requiredUnit: string;
}

interface NormalizedMeasurement {
  quantity: number;
  unit: string;
}

const unitNormalizationMap = new Map<string, NormalizedMeasurement>([
  ["g", { quantity: 1, unit: "g" }],
  ["gram", { quantity: 1, unit: "g" }],
  ["grams", { quantity: 1, unit: "g" }],
  ["kg", { quantity: 1000, unit: "g" }],
  ["kgs", { quantity: 1000, unit: "g" }],
  ["kilogram", { quantity: 1000, unit: "g" }],
  ["kilograms", { quantity: 1000, unit: "g" }],
  ["ml", { quantity: 1, unit: "ml" }],
  ["milliliter", { quantity: 1, unit: "ml" }],
  ["milliliters", { quantity: 1, unit: "ml" }],
  ["millilitre", { quantity: 1, unit: "ml" }],
  ["millilitres", { quantity: 1, unit: "ml" }],
  ["l", { quantity: 1000, unit: "ml" }],
  ["liter", { quantity: 1000, unit: "ml" }],
  ["liters", { quantity: 1000, unit: "ml" }],
  ["litre", { quantity: 1000, unit: "ml" }],
  ["litres", { quantity: 1000, unit: "ml" }],
  ["pc", { quantity: 1, unit: "piece" }],
  ["pcs", { quantity: 1, unit: "piece" }],
  ["piece", { quantity: 1, unit: "piece" }],
  ["pieces", { quantity: 1, unit: "piece" }],
  ["item", { quantity: 1, unit: "piece" }],
  ["items", { quantity: 1, unit: "piece" }],
  ["clove", { quantity: 1, unit: "clove" }],
  ["cloves", { quantity: 1, unit: "clove" }],
  ["bunch", { quantity: 1, unit: "bunch" }],
  ["bunches", { quantity: 1, unit: "bunch" }],
  ["can", { quantity: 1, unit: "can" }],
  ["cans", { quantity: 1, unit: "can" }],
  ["cup", { quantity: 1, unit: "cup" }],
  ["cups", { quantity: 1, unit: "cup" }],
  ["tbsp", { quantity: 1, unit: "tbsp" }],
  ["tablespoon", { quantity: 1, unit: "tbsp" }],
  ["tablespoons", { quantity: 1, unit: "tbsp" }],
  ["tsp", { quantity: 1, unit: "tsp" }],
  ["teaspoon", { quantity: 1, unit: "tsp" }],
  ["teaspoons", { quantity: 1, unit: "tsp" }]
]);

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function roundToTwo(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeIngredientName(value: string): string {
  return normalizeText(value).toLowerCase();
}

function normalizeMeasurement(quantity: number, unit: string): NormalizedMeasurement {
  const normalizedUnitKey = normalizeText(unit).toLowerCase().replace(/\./gu, "");
  const normalizedUnit = unitNormalizationMap.get(normalizedUnitKey);

  if (!normalizedUnit) {
    return {
      quantity: roundToTwo(quantity),
      unit: normalizedUnitKey
    };
  }

  return {
    quantity: roundToTwo(quantity * normalizedUnit.quantity),
    unit: normalizedUnit.unit
  };
}

function createOverrideLookup(overrides: MealPlanOverride[]): Map<string, MealPlanOverride> {
  const lookup = new Map<string, MealPlanOverride>();

  for (const override of overrides) {
    lookup.set(`${override.dayNumber}:${override.slot}`, override);
  }

  return lookup;
}

export function aggregateIngredientsFromPlan(plan: PlanDetailResponse): AggregatedShoppingIngredient[] {
  const recipeById = new Map(plan.template.recipes.map((recipe) => [recipe.id, recipe]));
  const overrideLookup = createOverrideLookup(plan.instance?.overrides ?? []);
  const totals = new Map<string, AggregatedShoppingIngredient>();
  const days = [...plan.template.days].sort((left, right) => left.dayNumber - right.dayNumber);

  for (const day of days) {
    const meals = [...day.meals].sort((left, right) => left.slot.localeCompare(right.slot));

    for (const meal of meals) {
      const override = overrideLookup.get(`${day.dayNumber}:${meal.slot}`);
      const recipeId = override?.recipeId ?? meal.recipeId;
      const recipe = recipeById.get(recipeId);

      if (!recipe) {
        throw new Error(`Recipe '${recipeId}' was not found while aggregating shopping-list ingredients.`);
      }

      for (const ingredient of recipe.ingredients) {
        const ingredientName = normalizeIngredientName(ingredient.name);
        const measurement = normalizeMeasurement(ingredient.quantity, ingredient.unit);
        const aggregateKey = `${ingredientName}::${measurement.unit}`;
        const current = totals.get(aggregateKey);

        if (current) {
          current.requiredQuantity = roundToTwo(current.requiredQuantity + measurement.quantity);
          continue;
        }

        totals.set(aggregateKey, {
          ingredientName,
          requiredQuantity: measurement.quantity,
          requiredUnit: measurement.unit
        });
      }
    }
  }

  return [...totals.values()].sort((left, right) => {
    const ingredientComparison = left.ingredientName.localeCompare(right.ingredientName);

    if (ingredientComparison !== 0) {
      return ingredientComparison;
    }

    return left.requiredUnit.localeCompare(right.requiredUnit);
  });
}