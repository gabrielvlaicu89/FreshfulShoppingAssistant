import { shoppingListSchema } from "@freshful/contracts";
import { z } from "zod";

const identifierSchema = z.string().trim().min(1);

export const shoppingListParamsSchema = z
  .object({
    id: identifierSchema
  })
  .strict();

export type ShoppingListParams = z.infer<typeof shoppingListParamsSchema>;

export const shoppingListResponseSchema = shoppingListSchema;