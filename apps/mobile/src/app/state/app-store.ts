import { mealSlotValues } from "@freshful/contracts";
import { create } from "zustand";

export type PlanDuration = 1 | 3 | 5 | 7;
export type MealSlot = (typeof mealSlotValues)[number];

export interface AssistantShellState {
  hasSeenWelcome: boolean;
  planDays: PlanDuration;
  includedMeals: MealSlot[];
  markWelcomeSeen(): void;
  setPlanDays(planDays: PlanDuration): void;
  toggleMeal(mealSlot: MealSlot): void;
  reset(): void;
}

const defaultIncludedMeals: MealSlot[] = ["breakfast", "lunch", "dinner"];

function createInitialState() {
  return {
    hasSeenWelcome: false,
    planDays: 3 as PlanDuration,
    includedMeals: defaultIncludedMeals
  };
}

export const useAssistantShellStore = create<AssistantShellState>((set) => ({
  ...createInitialState(),
  markWelcomeSeen() {
    set({ hasSeenWelcome: true });
  },
  setPlanDays(planDays) {
    set({ planDays });
  },
  toggleMeal(mealSlot) {
    set((state) => {
      const includedMeals = state.includedMeals.includes(mealSlot)
        ? state.includedMeals.filter((candidate) => candidate !== mealSlot)
        : [...state.includedMeals, mealSlot];

      const orderedMeals = mealSlotValues.filter((candidate) => includedMeals.includes(candidate));

      return {
        includedMeals: orderedMeals.length > 0 ? orderedMeals : defaultIncludedMeals
      };
    });
  },
  reset() {
    set(createInitialState());
  }
}));

export function resetAssistantShellStore(): void {
  useAssistantShellStore.getState().reset();
}