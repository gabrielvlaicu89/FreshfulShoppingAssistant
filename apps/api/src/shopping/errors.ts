import { ApiHttpError } from "../errors.js";

export function createShoppingListNotFoundError(): ApiHttpError {
  return new ApiHttpError({
    code: "shopping_list.not_found",
    message: "The requested shopping list was not found for the authenticated user.",
    statusCode: 404
  });
}

export function createShoppingListPlanInstanceRequiredError(): ApiHttpError {
  return new ApiHttpError({
    code: "shopping_list.plan_instance_required",
    message: "A dated meal plan instance is required before generating a shopping-list draft.",
    statusCode: 409
  });
}