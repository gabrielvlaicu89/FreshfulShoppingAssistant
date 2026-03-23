import { shoppingListSchema, type ShoppingList } from "@freshful/contracts";

import type { PlannerService } from "../planner/service.js";
import { aggregateIngredientsFromPlan } from "./aggregation.js";
import { createShoppingListNotFoundError, createShoppingListPlanInstanceRequiredError } from "./errors.js";
import type { ShoppingListRepository } from "./repository.js";

export interface ShoppingListService {
  createDraftForPlan(userId: string, planId: string): Promise<ShoppingList>;
  getShoppingList(userId: string, listId: string): Promise<ShoppingList>;
}

export interface CreateShoppingListServiceOptions {
  repository: ShoppingListRepository;
  plannerService: PlannerService;
}

export function createShoppingListService(options: CreateShoppingListServiceOptions): ShoppingListService {
  return {
    async createDraftForPlan(userId, planId) {
      const plan = await options.plannerService.getPlan(userId, planId);

      if (!plan.instance) {
        throw createShoppingListPlanInstanceRequiredError();
      }

      const items = aggregateIngredientsFromPlan(plan);

      return shoppingListSchema.parse(await options.repository.upsertDraftForPlan(userId, plan.instance.id, items));
    },

    async getShoppingList(userId, listId) {
      const shoppingList = await options.repository.getForUser(userId, listId);

      if (!shoppingList) {
        throw createShoppingListNotFoundError();
      }

      return shoppingListSchema.parse(shoppingList);
    }
  };
}