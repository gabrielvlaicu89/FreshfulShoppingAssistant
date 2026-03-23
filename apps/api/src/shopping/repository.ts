import { randomUUID } from "node:crypto";

import type { ShoppingList, ShoppingListItem } from "@freshful/contracts";
import { freshfulProductSchema, shoppingListSchema } from "@freshful/contracts";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { createApiDatabase } from "../db/client.js";
import { databaseTables } from "../db/schema.js";
import type { AggregatedShoppingIngredient } from "./aggregation.js";

export type ShoppingDatabase = ReturnType<typeof createApiDatabase>["db"];

type ShoppingDatabaseExecutor = Pick<ShoppingDatabase, "delete" | "insert" | "select" | "update">;

interface ShoppingListRecord {
  id: string;
  userId: string;
  planId: string;
  createdAt: string;
  updatedAt: string;
  totalEstimatedCost: number;
  status: "draft" | "final";
}

interface ActiveDraftRecord {
  id: string;
  updatedAt: string;
}

interface ShoppingListItemRecord {
  id: string;
  listId: string;
  ingredientName: string;
  requiredQuantity: number;
  requiredUnit: string;
  freshfulProductId: string | null;
  chosenQuantity: number | null;
  chosenUnit: string | null;
  estimatedPrice: number | null;
  category: string | null;
  status: "pending" | "bought" | "replaced";
}

export interface CreateShoppingListRepositoryOptions {
  now?: () => Date;
  createId?: () => string;
  onActiveDraftLoadedForUpsert?: (draftListId: string | null) => Promise<void> | void;
}

export interface ShoppingListRepository {
  upsertDraftForPlan(userId: string, planInstanceId: string, items: AggregatedShoppingIngredient[]): Promise<ShoppingList>;
  getForUser(userId: string, listId: string): Promise<ShoppingList | null>;
}

function toUtcIsoDateTime(value: string): string {
  return new Date(value).toISOString();
}

function isActiveDraftUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorWithCode = error as Error & { code?: string; cause?: { code?: string } };

  return (
    errorWithCode.code === "23505" ||
    errorWithCode.cause?.code === "23505" ||
    error.message.includes("shopping_lists_active_draft_user_plan_idx")
  );
}

async function loadShoppingListRecord(
  executor: ShoppingDatabaseExecutor,
  userId: string,
  listId: string
): Promise<ShoppingListRecord | null> {
  const [record] = await executor
    .select({
      id: databaseTables.shoppingLists.id,
      userId: databaseTables.shoppingLists.userId,
      planId: databaseTables.shoppingLists.planId,
      createdAt: databaseTables.shoppingLists.createdAt,
      updatedAt: databaseTables.shoppingLists.updatedAt,
      totalEstimatedCost: databaseTables.shoppingLists.totalEstimatedCost,
      status: databaseTables.shoppingLists.status
    })
    .from(databaseTables.shoppingLists)
    .where(and(eq(databaseTables.shoppingLists.userId, userId), eq(databaseTables.shoppingLists.id, listId)))
    .limit(1);

  return record ?? null;
}

async function loadActiveDraftRecord(
  executor: Pick<ShoppingDatabase, "select"> | Pick<ShoppingDatabaseExecutor, "select">,
  userId: string,
  planInstanceId: string
): Promise<ActiveDraftRecord | null> {
  const [record] = await executor
    .select({
      id: databaseTables.shoppingLists.id,
      updatedAt: databaseTables.shoppingLists.updatedAt
    })
    .from(databaseTables.shoppingLists)
    .where(
      and(
        eq(databaseTables.shoppingLists.userId, userId),
        eq(databaseTables.shoppingLists.planId, planInstanceId),
        eq(databaseTables.shoppingLists.status, "draft")
      )
    )
    .orderBy(desc(databaseTables.shoppingLists.updatedAt), desc(databaseTables.shoppingLists.id))
    .limit(1);

  return record ?? null;
}

async function loadShoppingListItems(
  executor: ShoppingDatabaseExecutor,
  listId: string
): Promise<ShoppingListItemRecord[]> {
  return executor
    .select({
      id: databaseTables.shoppingListItems.id,
      listId: databaseTables.shoppingListItems.listId,
      ingredientName: databaseTables.shoppingListItems.ingredientName,
      requiredQuantity: databaseTables.shoppingListItems.requiredQuantity,
      requiredUnit: databaseTables.shoppingListItems.requiredUnit,
      freshfulProductId: databaseTables.shoppingListItems.freshfulProductId,
      chosenQuantity: databaseTables.shoppingListItems.chosenQuantity,
      chosenUnit: databaseTables.shoppingListItems.chosenUnit,
      estimatedPrice: databaseTables.shoppingListItems.estimatedPrice,
      category: databaseTables.shoppingListItems.category,
      status: databaseTables.shoppingListItems.status
    })
    .from(databaseTables.shoppingListItems)
    .where(eq(databaseTables.shoppingListItems.listId, listId))
    .orderBy(
      asc(databaseTables.shoppingListItems.ingredientName),
      asc(databaseTables.shoppingListItems.requiredUnit),
      asc(databaseTables.shoppingListItems.id)
    );
}

async function loadMatchedProducts(
  executor: ShoppingDatabaseExecutor,
  productIds: string[]
) {
  if (productIds.length === 0) {
    return new Map();
  }

  const records = await executor
    .select({
      id: databaseTables.freshfulProducts.id,
      freshfulId: databaseTables.freshfulProducts.freshfulId,
      name: databaseTables.freshfulProducts.name,
      price: databaseTables.freshfulProducts.price,
      currency: databaseTables.freshfulProducts.currency,
      unit: databaseTables.freshfulProducts.unit,
      category: databaseTables.freshfulProducts.category,
      tags: databaseTables.freshfulProducts.tags,
      imageUrl: databaseTables.freshfulProducts.imageUrl,
      lastSeenAt: databaseTables.freshfulProducts.lastSeenAt,
      availability: databaseTables.freshfulProducts.availability,
      searchMetadata: databaseTables.freshfulProducts.searchMetadata
    })
    .from(databaseTables.freshfulProducts)
    .where(inArray(databaseTables.freshfulProducts.id, productIds));

  return new Map(
    records.map((record) => [
      record.id,
      freshfulProductSchema.parse({
        id: record.id,
        freshfulId: record.freshfulId,
        name: record.name,
        price: record.price,
        currency: record.currency,
        unit: record.unit,
        category: record.category,
        tags: record.tags,
        imageUrl: record.imageUrl,
        lastSeenAt: toUtcIsoDateTime(record.lastSeenAt),
        availability: record.availability,
        searchMetadata: record.searchMetadata ?? undefined
      })
    ])
  );
}

async function hydrateShoppingList(
  executor: ShoppingDatabaseExecutor,
  userId: string,
  listId: string
): Promise<ShoppingList | null> {
  const listRecord = await loadShoppingListRecord(executor, userId, listId);

  if (!listRecord) {
    return null;
  }

  const itemRecords = await loadShoppingListItems(executor, listId);
  const matchedProducts = await loadMatchedProducts(
    executor,
    [...new Set(itemRecords.flatMap((item) => (item.freshfulProductId ? [item.freshfulProductId] : [])))]
  );

  const items: ShoppingListItem[] = itemRecords.map((record) => ({
    id: record.id,
    listId: record.listId,
    ingredientName: record.ingredientName,
    requiredQuantity: record.requiredQuantity,
    requiredUnit: record.requiredUnit,
    freshfulProductId: record.freshfulProductId,
    chosenQuantity: record.chosenQuantity,
    chosenUnit: record.chosenUnit,
    estimatedPrice: record.estimatedPrice,
    category: record.category,
    status: record.status,
    matchedProduct: record.freshfulProductId ? matchedProducts.get(record.freshfulProductId) ?? null : null
  }));

  return shoppingListSchema.parse({
    id: listRecord.id,
    userId: listRecord.userId,
    planId: listRecord.planId,
    createdAt: toUtcIsoDateTime(listRecord.createdAt),
    totalEstimatedCost: listRecord.totalEstimatedCost,
    status: listRecord.status,
    items
  });
}

export function createShoppingListRepository(
  database: ShoppingDatabase,
  options: CreateShoppingListRepositoryOptions = {}
): ShoppingListRepository {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? randomUUID;
  const onActiveDraftLoadedForUpsert = options.onActiveDraftLoadedForUpsert;

  return {
    async upsertDraftForPlan(userId, planInstanceId, items) {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        try {
          const activeDraft = await loadActiveDraftRecord(database, userId, planInstanceId);

          if (onActiveDraftLoadedForUpsert) {
            await onActiveDraftLoadedForUpsert(activeDraft?.id ?? null);
          }

          const shoppingList = await database.transaction(async (transaction) => {
            const timestamp = now().toISOString();
            const listId = activeDraft?.id ?? createId();

            if (activeDraft) {
              const [updatedDraft] = await transaction
                .update(databaseTables.shoppingLists)
                .set({
                  updatedAt: timestamp,
                  totalEstimatedCost: 0,
                  status: "draft"
                })
                .where(
                  and(
                    eq(databaseTables.shoppingLists.id, listId),
                    eq(databaseTables.shoppingLists.userId, userId),
                    eq(databaseTables.shoppingLists.planId, planInstanceId),
                    eq(databaseTables.shoppingLists.status, "draft"),
                    eq(databaseTables.shoppingLists.updatedAt, activeDraft.updatedAt)
                  )
                )
                .returning({
                  id: databaseTables.shoppingLists.id
                });

              if (!updatedDraft) {
                return null;
              }

              await transaction
                .delete(databaseTables.shoppingListItems)
                .where(eq(databaseTables.shoppingListItems.listId, listId));
            } else {
              await transaction.insert(databaseTables.shoppingLists).values({
                id: listId,
                userId,
                planId: planInstanceId,
                createdAt: timestamp,
                updatedAt: timestamp,
                totalEstimatedCost: 0,
                status: "draft"
              });
            }

            await transaction.insert(databaseTables.shoppingListItems).values(
              items.map((item) => ({
                id: createId(),
                listId,
                ingredientName: item.ingredientName,
                requiredQuantity: item.requiredQuantity,
                requiredUnit: item.requiredUnit,
                freshfulProductId: null,
                chosenQuantity: null,
                chosenUnit: null,
                estimatedPrice: null,
                category: null,
                status: "pending" as const,
                createdAt: timestamp,
                updatedAt: timestamp
              }))
            );

            const shoppingList = await hydrateShoppingList(transaction, userId, listId);

            if (!shoppingList) {
              throw new Error(`Shopping list '${listId}' was not found after draft persistence.`);
            }

            return shoppingList;
          });

          if (shoppingList) {
            return shoppingList;
          }

          continue;
        } catch (error) {
          if (isActiveDraftUniqueViolation(error)) {
            continue;
          }

          throw error;
        }
      }

      throw new Error(
        `Failed to persist a shopping-list draft for user '${userId}' and plan instance '${planInstanceId}' after repeated concurrent updates.`
      );
    },

    async getForUser(userId, listId) {
      return hydrateShoppingList(database, userId, listId);
    }
  };
}