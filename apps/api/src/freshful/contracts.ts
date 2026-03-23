import type { FreshfulProduct } from "@freshful/contracts";
import { freshfulSearchFiltersSchema } from "@freshful/contracts";
import { z } from "zod";

import { freshfulCatalogRecencySchema } from "./policy.js";

const trimmedStringSchema = z.string().trim().min(1);
const recordedRequestOperationValues = ["search", "product-detail"] as const;
const recordedRequestSurfaceValues = ["html-page", "next-data"] as const;
const freshfulCatalogCacheSourceValues = ["network", "cache", "stale-cache"] as const;
const recordedQueryKeyPartSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const freshfulRecordedRequestSchema = z
  .object({
    operation: z.enum(recordedRequestOperationValues),
    surface: z.enum(recordedRequestSurfaceValues),
    method: z.literal("GET"),
    url: z.string().url(),
    routePattern: trimmedStringSchema,
    notes: z.array(trimmedStringSchema).min(1)
  })
  .strict();

export type FreshfulRecordedRequest = z.infer<typeof freshfulRecordedRequestSchema>;

export const freshfulRecordedPageObservationSchema = z
  .object({
    operation: z.enum(recordedRequestOperationValues),
    page: trimmedStringSchema,
    buildId: trimmedStringSchema,
    pageType: trimmedStringSchema,
    query: z.record(z.string(), z.unknown()),
    urlParams: z.record(z.string(), z.unknown()),
    dehydratedQueryKeys: z.array(z.array(recordedQueryKeyPartSchema))
  })
  .strict();

export type FreshfulRecordedPageObservation = z.infer<typeof freshfulRecordedPageObservationSchema>;

export const freshfulProductReferenceSchema = z
  .object({
    freshfulId: trimmedStringSchema,
    slug: trimmedStringSchema,
    detailPath: z.string().trim().startsWith("/p/"),
    detailUrl: z.string().url()
  })
  .strict();

export type FreshfulProductReference = z.infer<typeof freshfulProductReferenceSchema>;

export const freshfulCatalogSearchInputSchema = z
  .object({
    query: trimmedStringSchema,
    filters: freshfulSearchFiltersSchema.optional()
  })
  .strict();

export type FreshfulCatalogSearchInput = z.infer<typeof freshfulCatalogSearchInputSchema>;

export type FreshfulSearchProductCandidate = FreshfulProduct & {
  productReference: FreshfulProductReference;
};

export const freshfulSearchProductCandidateSchema = z
  .object({
    id: trimmedStringSchema,
    freshfulId: trimmedStringSchema,
    name: trimmedStringSchema,
    price: z.number().finite().min(0),
    currency: z.literal("RON"),
    unit: trimmedStringSchema,
    category: trimmedStringSchema,
    tags: z.array(trimmedStringSchema),
    imageUrl: z.string().url(),
    lastSeenAt: z.string().datetime({ offset: true }),
    availability: z.enum(["in_stock", "low_stock", "out_of_stock", "unknown"]),
    searchMetadata: z
      .object({
        query: trimmedStringSchema,
        rank: z.number().int().min(0),
        matchedTerm: trimmedStringSchema.optional()
      })
      .strict()
      .optional(),
    productReference: freshfulProductReferenceSchema
  })
  .strict();

export const freshfulCatalogCacheMetadataSchema = z
  .object({
    source: z.enum(freshfulCatalogCacheSourceValues),
    isStale: z.boolean(),
    fetchedAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
    recency: freshfulCatalogRecencySchema,
    fallbackReason: trimmedStringSchema.optional()
  })
  .strict();

export type FreshfulCatalogCacheMetadata = z.infer<typeof freshfulCatalogCacheMetadataSchema>;

export const freshfulCatalogSearchResultSchema = z
  .object({
    products: z.array(freshfulSearchProductCandidateSchema),
    cache: freshfulCatalogCacheMetadataSchema
  })
  .strict();

export type FreshfulCatalogSearchResult = z.infer<typeof freshfulCatalogSearchResultSchema>;

export const freshfulCatalogProductDetailResultSchema = z
  .object({
    product: z
      .object({
        id: trimmedStringSchema,
        freshfulId: trimmedStringSchema,
        name: trimmedStringSchema,
        price: z.number().finite().min(0),
        currency: z.literal("RON"),
        unit: trimmedStringSchema,
        category: trimmedStringSchema,
        tags: z.array(trimmedStringSchema),
        imageUrl: z.string().url(),
        lastSeenAt: z.string().datetime({ offset: true }),
        availability: z.enum(["in_stock", "low_stock", "out_of_stock", "unknown"]),
        searchMetadata: z
          .object({
            query: trimmedStringSchema,
            rank: z.number().int().min(0),
            matchedTerm: trimmedStringSchema.optional()
          })
          .strict()
          .optional()
      })
      .strict(),
    productReference: freshfulProductReferenceSchema,
    cache: freshfulCatalogCacheMetadataSchema
  })
  .strict();

export type FreshfulCatalogProductDetailResult = z.infer<typeof freshfulCatalogProductDetailResultSchema>;

export interface FreshfulCatalogAdapter {
  searchProducts(input: FreshfulCatalogSearchInput): Promise<FreshfulCatalogSearchResult>;
  getProductDetails(reference: FreshfulProductReference): Promise<FreshfulCatalogProductDetailResult>;
}