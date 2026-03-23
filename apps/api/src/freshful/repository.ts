import { randomUUID } from "node:crypto";

import type { FreshfulProduct } from "@freshful/contracts";
import { freshfulProductSchema } from "@freshful/contracts";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import { createApiDatabase } from "../db/client.js";
import { databaseTables } from "../db/schema.js";
import {
  freshfulCatalogSearchInputSchema,
  freshfulProductReferenceSchema,
  freshfulSearchProductCandidateSchema,
  type FreshfulCatalogSearchInput,
  type FreshfulProductReference,
  type FreshfulSearchProductCandidate
} from "./contracts.js";

export type FreshfulDatabase = ReturnType<typeof createApiDatabase>["db"];

const persistedProductSchema = z
  .object({
    id: z.string().trim().min(1),
    freshfulId: z.string().trim().min(1),
    name: z.string().trim().min(1),
    price: z.number().finite().min(0),
    currency: z.literal("RON"),
    unit: z.string().trim().min(1),
    category: z.string().trim().min(1),
    tags: z.array(z.string().trim().min(1)),
    imageUrl: z.string().url(),
    slug: z.string().trim().min(1).nullable(),
    detailPath: z.string().trim().min(1).nullable(),
    detailUrl: z.string().url().nullable(),
    lastSeenAt: z.string().datetime({ offset: true }),
    availability: z.enum(["in_stock", "low_stock", "out_of_stock", "unknown"]),
    searchMetadata: z
      .object({
        query: z.string().trim().min(1),
        rank: z.number().int().min(0),
        matchedTerm: z.string().trim().min(1).optional()
      })
      .strict()
      .nullable()
      .optional()
  })
  .strict();

const persistedSearchCacheSchema = z
  .object({
    cacheKey: z.string().trim().min(1),
    query: z.string().trim().min(1),
    filters: freshfulCatalogSearchInputSchema.shape.filters.nullable().optional(),
    productIds: z.array(z.string().trim().min(1)),
    products: z.array(freshfulSearchProductCandidateSchema).default([]),
    fetchedAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true })
  })
  .strict();

interface PersistedSearchCacheEntry {
  cacheKey: string;
  query: string;
  filters: FreshfulCatalogSearchInput["filters"] | null;
  productIds: string[];
  products: FreshfulSearchProductCandidate[];
  fetchedAt: string;
  expiresAt: string;
}

export interface PersistedProductEntry {
  product: FreshfulProduct;
  productReference: FreshfulProductReference;
}

export interface FreshfulCatalogRepository {
  getSearchCacheByKey(cacheKey: string): Promise<PersistedSearchCacheEntry | null>;
  listSearchCaches(options?: { limit?: number }): Promise<Array<{ input: FreshfulCatalogSearchInput; fetchedAt: string; expiresAt: string }>>;
  saveSearchResult(args: {
    cacheKey: string;
    input: FreshfulCatalogSearchInput;
    products: FreshfulSearchProductCandidate[];
    fetchedAt: string;
    expiresAt: string;
    responseHash: string;
  }): Promise<PersistedSearchCacheEntry>;
  getProductByReference(reference: FreshfulProductReference): Promise<{
    product: FreshfulProduct;
    productReference: FreshfulProductReference;
  } | null>;
  listProductReferences(options?: { limit?: number }): Promise<PersistedProductEntry[]>;
  saveProductDetail(args: {
    reference: FreshfulProductReference;
    product: FreshfulProduct;
  }): Promise<{
    product: FreshfulProduct;
    productReference: FreshfulProductReference;
  }>;
}

export interface CreateFreshfulCatalogRepositoryOptions {
  createId?: () => string;
}

function toIsoDateTime(value: string): string {
  return new Date(value).toISOString();
}

function normalizePersistedProductRecord(record: {
  id: string;
  freshfulId: string;
  name: string;
  price: number;
  currency: string;
  unit: string;
  category: string;
  tags: string[];
  imageUrl: string;
  slug: string | null;
  detailPath: string | null;
  detailUrl: string | null;
  lastSeenAt: string;
  availability: "in_stock" | "low_stock" | "out_of_stock" | "unknown";
  searchMetadata:
    | {
        query: string;
        rank: number;
        matchedTerm?: string | undefined;
      }
    | null
    | undefined;
}): z.infer<typeof persistedProductSchema> {
  return persistedProductSchema.parse({
    ...record,
    currency: "RON",
    lastSeenAt: toIsoDateTime(record.lastSeenAt)
  });
}

function normalizePersistedSearchCacheRecord(record: {
  cacheKey: string;
  query: string;
  filters: FreshfulCatalogSearchInput["filters"] | null | undefined;
  productIds: string[];
  products: Record<string, unknown>[] | null | undefined;
  fetchedAt: string;
  expiresAt: string;
}): z.infer<typeof persistedSearchCacheSchema> {
  return persistedSearchCacheSchema.parse({
    ...record,
    filters: record.filters ?? null,
    products: record.products ?? [],
    fetchedAt: toIsoDateTime(record.fetchedAt),
    expiresAt: toIsoDateTime(record.expiresAt)
  });
}

function toProductReference(record: z.infer<typeof persistedProductSchema>): FreshfulProductReference | null {
  if (!record.slug || !record.detailPath || !record.detailUrl) {
    return null;
  }

  return freshfulProductReferenceSchema.parse({
    freshfulId: record.freshfulId,
    slug: record.slug,
    detailPath: record.detailPath,
    detailUrl: record.detailUrl
  });
}

function toFreshfulProduct(record: z.infer<typeof persistedProductSchema>): FreshfulProduct {
  return freshfulProductSchema.parse({
    id: record.id,
    freshfulId: record.freshfulId,
    name: record.name,
    price: record.price,
    currency: record.currency,
    unit: record.unit,
    category: record.category,
    tags: record.tags,
    imageUrl: record.imageUrl,
    lastSeenAt: record.lastSeenAt,
    availability: record.availability,
    searchMetadata: record.searchMetadata ?? undefined
  });
}

function toSearchCandidate(record: z.infer<typeof persistedProductSchema>): FreshfulSearchProductCandidate | null {
  const productReference = toProductReference(record);

  if (!productReference) {
    return null;
  }

  return freshfulSearchProductCandidateSchema.parse({
    ...toFreshfulProduct(record),
    productReference
  });
}

function toPersistedSearchCacheProducts(products: FreshfulSearchProductCandidate[]): Record<string, unknown>[] {
  return products.map((product) => ({
    id: product.id,
    freshfulId: product.freshfulId,
    name: product.name,
    price: product.price,
    currency: product.currency,
    unit: product.unit,
    category: product.category,
    tags: [...product.tags],
    imageUrl: product.imageUrl,
    lastSeenAt: product.lastSeenAt,
    availability: product.availability,
    searchMetadata: product.searchMetadata
      ? {
          query: product.searchMetadata.query,
          rank: product.searchMetadata.rank,
          ...(product.searchMetadata.matchedTerm ? { matchedTerm: product.searchMetadata.matchedTerm } : {})
        }
      : undefined,
    productReference: {
      freshfulId: product.productReference.freshfulId,
      slug: product.productReference.slug,
      detailPath: product.productReference.detailPath,
      detailUrl: product.productReference.detailUrl
    }
  }));
}

async function selectProductsByIds(database: FreshfulDatabase, productIds: string[]) {
  if (productIds.length === 0) {
    return [];
  }

  const rows = await database
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
      slug: databaseTables.freshfulProducts.slug,
      detailPath: databaseTables.freshfulProducts.detailPath,
      detailUrl: databaseTables.freshfulProducts.detailUrl,
      lastSeenAt: databaseTables.freshfulProducts.lastSeenAt,
      availability: databaseTables.freshfulProducts.availability,
      searchMetadata: databaseTables.freshfulProducts.searchMetadata
    })
    .from(databaseTables.freshfulProducts)
    .where(inArray(databaseTables.freshfulProducts.id, productIds));

  const rowsById = new Map(rows.map((row) => [row.id, normalizePersistedProductRecord(row)]));

  return productIds.map((productId) => rowsById.get(productId)).filter((row): row is z.infer<typeof persistedProductSchema> => Boolean(row));
}

export function createFreshfulCatalogRepository(
  database: FreshfulDatabase,
  options: CreateFreshfulCatalogRepositoryOptions = {}
): FreshfulCatalogRepository {
  const createId = options.createId ?? randomUUID;

  return {
    async getSearchCacheByKey(cacheKey) {
      const [cacheEntry] = await database
        .select({
          cacheKey: databaseTables.cachedSearchResults.cacheKey,
          query: databaseTables.cachedSearchResults.query,
          filters: databaseTables.cachedSearchResults.filters,
          productIds: databaseTables.cachedSearchResults.productIds,
          products: databaseTables.cachedSearchResults.products,
          fetchedAt: databaseTables.cachedSearchResults.fetchedAt,
          expiresAt: databaseTables.cachedSearchResults.expiresAt
        })
        .from(databaseTables.cachedSearchResults)
        .where(eq(databaseTables.cachedSearchResults.cacheKey, cacheKey))
        .limit(1);

      if (!cacheEntry) {
        return null;
      }

      const parsedCacheEntry = normalizePersistedSearchCacheRecord(cacheEntry);

      if (parsedCacheEntry.products.length > 0) {
        return {
          cacheKey: parsedCacheEntry.cacheKey,
          query: parsedCacheEntry.query,
          filters: parsedCacheEntry.filters ?? null,
          productIds: parsedCacheEntry.productIds,
          products: parsedCacheEntry.products,
          fetchedAt: parsedCacheEntry.fetchedAt,
          expiresAt: parsedCacheEntry.expiresAt
        };
      }

      const products = (await selectProductsByIds(database, parsedCacheEntry.productIds))
        .map((productRow) => toSearchCandidate(productRow))
        .filter((product): product is FreshfulSearchProductCandidate => Boolean(product));

      if (products.length !== parsedCacheEntry.productIds.length) {
        return null;
      }

      return {
        cacheKey: parsedCacheEntry.cacheKey,
        query: parsedCacheEntry.query,
        filters: parsedCacheEntry.filters ?? null,
        productIds: parsedCacheEntry.productIds,
        fetchedAt: parsedCacheEntry.fetchedAt,
        expiresAt: parsedCacheEntry.expiresAt,
        products
      };
    },

    async saveSearchResult({ cacheKey, input, products, fetchedAt, expiresAt, responseHash }) {
      return database.transaction(async (transaction) => {
        const internalProductIds: string[] = [];
        const persistedProducts = toPersistedSearchCacheProducts(products);

        for (const product of products) {
          const [persistedProduct] = await transaction
            .insert(databaseTables.freshfulProducts)
            .values({
              id: product.id,
              freshfulId: product.freshfulId,
              name: product.name,
              price: product.price,
              currency: product.currency,
              unit: product.unit,
              category: product.category,
              tags: product.tags,
              imageUrl: product.imageUrl,
              slug: product.productReference.slug,
              detailPath: product.productReference.detailPath,
              detailUrl: product.productReference.detailUrl,
              lastSeenAt: product.lastSeenAt,
              availability: product.availability,
              searchMetadata: null
            })
            .onConflictDoUpdate({
              target: [databaseTables.freshfulProducts.freshfulId, databaseTables.freshfulProducts.slug],
              set: {
                id: product.id,
                name: product.name,
                price: product.price,
                currency: product.currency,
                unit: product.unit,
                category: product.category,
                tags: product.tags,
                imageUrl: product.imageUrl,
                slug: product.productReference.slug,
                detailPath: product.productReference.detailPath,
                detailUrl: product.productReference.detailUrl,
                lastSeenAt: product.lastSeenAt,
                availability: product.availability,
                searchMetadata: null,
                updatedAt: fetchedAt
              }
            })
            .returning({
              id: databaseTables.freshfulProducts.id
            });

          internalProductIds.push(persistedProduct.id);
        }

        await transaction
          .insert(databaseTables.cachedSearchResults)
          .values({
            id: createId(),
            cacheKey,
            query: input.query,
            filters: input.filters ?? null,
            productIds: internalProductIds,
            products: persistedProducts,
            fetchedAt,
            expiresAt,
            source: "freshful.search",
            responseHash
          })
          .onConflictDoUpdate({
            target: databaseTables.cachedSearchResults.cacheKey,
            set: {
              query: input.query,
              filters: input.filters ?? null,
              productIds: internalProductIds,
              products: persistedProducts,
              fetchedAt,
              expiresAt,
              source: "freshful.search",
              responseHash,
              updatedAt: fetchedAt
            }
          });

        return {
          cacheKey,
          query: input.query,
          filters: input.filters ?? null,
          productIds: internalProductIds,
          products,
          fetchedAt,
          expiresAt
        };
      });
    },

    async listSearchCaches(options = {}) {
      const rows = await database
        .select({
          query: databaseTables.cachedSearchResults.query,
          filters: databaseTables.cachedSearchResults.filters,
          fetchedAt: databaseTables.cachedSearchResults.fetchedAt,
          expiresAt: databaseTables.cachedSearchResults.expiresAt
        })
        .from(databaseTables.cachedSearchResults)
        .orderBy(asc(databaseTables.cachedSearchResults.fetchedAt))
        .limit(options.limit ?? 100);

      return rows.map((row) => {
        const normalizedRow = normalizePersistedSearchCacheRecord({
          cacheKey: row.query,
          query: row.query,
          filters: row.filters,
          productIds: [],
          products: [],
          fetchedAt: row.fetchedAt,
          expiresAt: row.expiresAt
        });

        return {
          input: freshfulCatalogSearchInputSchema.parse({
            query: normalizedRow.query,
            ...(normalizedRow.filters ? { filters: normalizedRow.filters } : {})
          }),
          fetchedAt: normalizedRow.fetchedAt,
          expiresAt: normalizedRow.expiresAt
        };
      });
    },

    async getProductByReference(reference) {
      const [row] = await database
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
          slug: databaseTables.freshfulProducts.slug,
          detailPath: databaseTables.freshfulProducts.detailPath,
          detailUrl: databaseTables.freshfulProducts.detailUrl,
          lastSeenAt: databaseTables.freshfulProducts.lastSeenAt,
          availability: databaseTables.freshfulProducts.availability,
          searchMetadata: databaseTables.freshfulProducts.searchMetadata
        })
        .from(databaseTables.freshfulProducts)
        .where(
          and(
            eq(databaseTables.freshfulProducts.freshfulId, reference.freshfulId),
            eq(databaseTables.freshfulProducts.slug, reference.slug)
          )
        )
        .limit(1);

      if (!row) {
        return null;
      }

      const parsedRow = normalizePersistedProductRecord(row);

      return {
        product: toFreshfulProduct(parsedRow),
        productReference: toProductReference(parsedRow) ?? freshfulProductReferenceSchema.parse(reference)
      };
    },

    async listProductReferences(options = {}) {
      const rows = await database
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
          slug: databaseTables.freshfulProducts.slug,
          detailPath: databaseTables.freshfulProducts.detailPath,
          detailUrl: databaseTables.freshfulProducts.detailUrl,
          lastSeenAt: databaseTables.freshfulProducts.lastSeenAt,
          availability: databaseTables.freshfulProducts.availability,
          searchMetadata: databaseTables.freshfulProducts.searchMetadata
        })
        .from(databaseTables.freshfulProducts)
        .where(
          and(
            isNotNull(databaseTables.freshfulProducts.slug),
            isNotNull(databaseTables.freshfulProducts.detailPath),
            isNotNull(databaseTables.freshfulProducts.detailUrl)
          )
        )
        .orderBy(asc(databaseTables.freshfulProducts.lastSeenAt))
        .limit(options.limit ?? 100);

      return rows.map((row) => {
        const parsedRow = normalizePersistedProductRecord(row);

        return {
          product: toFreshfulProduct(parsedRow),
          productReference: toProductReference(parsedRow) ??
            freshfulProductReferenceSchema.parse({
              freshfulId: parsedRow.freshfulId,
              slug: parsedRow.slug,
              detailPath: parsedRow.detailPath,
              detailUrl: parsedRow.detailUrl
            })
        };
      });
    },

    async saveProductDetail({ reference, product }) {
      const [row] = await database
        .insert(databaseTables.freshfulProducts)
        .values({
          id: product.id,
          freshfulId: product.freshfulId,
          name: product.name,
          price: product.price,
          currency: product.currency,
          unit: product.unit,
          category: product.category,
          tags: product.tags,
          imageUrl: product.imageUrl,
          slug: reference.slug,
          detailPath: reference.detailPath,
          detailUrl: reference.detailUrl,
          lastSeenAt: product.lastSeenAt,
          availability: product.availability,
          searchMetadata: product.searchMetadata ?? null
        })
        .onConflictDoUpdate({
          target: [databaseTables.freshfulProducts.freshfulId, databaseTables.freshfulProducts.slug],
          set: {
            id: product.id,
            name: product.name,
            price: product.price,
            currency: product.currency,
            unit: product.unit,
            category: product.category,
            tags: product.tags,
            imageUrl: product.imageUrl,
            slug: reference.slug,
            detailPath: reference.detailPath,
            detailUrl: reference.detailUrl,
            lastSeenAt: product.lastSeenAt,
            availability: product.availability,
            searchMetadata:
              product.searchMetadata ?? sql`${databaseTables.freshfulProducts.searchMetadata}`,
            updatedAt: product.lastSeenAt
          }
        })
        .returning({
          id: databaseTables.freshfulProducts.id,
          freshfulId: databaseTables.freshfulProducts.freshfulId,
          name: databaseTables.freshfulProducts.name,
          price: databaseTables.freshfulProducts.price,
          currency: databaseTables.freshfulProducts.currency,
          unit: databaseTables.freshfulProducts.unit,
          category: databaseTables.freshfulProducts.category,
          tags: databaseTables.freshfulProducts.tags,
          imageUrl: databaseTables.freshfulProducts.imageUrl,
          slug: databaseTables.freshfulProducts.slug,
          detailPath: databaseTables.freshfulProducts.detailPath,
          detailUrl: databaseTables.freshfulProducts.detailUrl,
          lastSeenAt: databaseTables.freshfulProducts.lastSeenAt,
          availability: databaseTables.freshfulProducts.availability,
          searchMetadata: databaseTables.freshfulProducts.searchMetadata
        });

      const parsedRow = normalizePersistedProductRecord(row);

      return {
        product: toFreshfulProduct(parsedRow),
        productReference: toProductReference(parsedRow) ?? freshfulProductReferenceSchema.parse(reference)
      };
    }
  };
}