import { z } from "zod";

import {
  freshfulCatalogProductDetailResultSchema,
  freshfulCatalogSearchInputSchema,
  freshfulCatalogSearchResultSchema,
  freshfulProductReferenceSchema,
  type FreshfulCatalogSearchInput,
  type FreshfulProductReference
} from "./contracts.js";
import { evaluateFreshfulCatalogRecency, type FreshfulCatalogRecencyStatus } from "./policy.js";
import type { FreshfulCatalogRepository } from "./repository.js";
import { buildFreshfulSearchCacheKey } from "./service.js";
import type { FreshfulCatalogService } from "./service.js";

const refreshModeValues = ["stale-only", "all"] as const;
const refreshTargetKindValues = ["search", "product"] as const;

export const freshfulCatalogRefreshModeSchema = z.enum(refreshModeValues);
export type FreshfulCatalogRefreshMode = z.infer<typeof freshfulCatalogRefreshModeSchema>;

export const freshfulCatalogRefreshFailureSchema = z
  .object({
    kind: z.enum(refreshTargetKindValues),
    target: z.string().trim().min(1),
    message: z.string().trim().min(1)
  })
  .strict();

export type FreshfulCatalogRefreshFailure = z.infer<typeof freshfulCatalogRefreshFailureSchema>;

const refreshCounterSchema = z
  .object({
    queued: z.number().int().min(0),
    refreshed: z.number().int().min(0),
    skippedFresh: z.number().int().min(0),
    failed: z.number().int().min(0)
  })
  .strict();

export const freshfulCatalogRefreshResultSchema = z
  .object({
    mode: freshfulCatalogRefreshModeSchema,
    startedAt: z.string().datetime({ offset: true }),
    completedAt: z.string().datetime({ offset: true }),
    search: refreshCounterSchema,
    products: refreshCounterSchema,
    failures: z.array(freshfulCatalogRefreshFailureSchema)
  })
  .strict();

export type FreshfulCatalogRefreshResult = z.infer<typeof freshfulCatalogRefreshResultSchema>;

export interface FreshfulCatalogRefreshRunner {
  run(options?: FreshfulCatalogRefreshRunOptions): Promise<FreshfulCatalogRefreshResult>;
}

export interface FreshfulCatalogRefreshRunOptions {
  mode?: FreshfulCatalogRefreshMode;
  searchInputs?: FreshfulCatalogSearchInput[];
  productReferences?: FreshfulProductReference[];
  searchLimit?: number;
  productLimit?: number;
}

export interface CreateFreshfulCatalogRefreshRunnerOptions {
  repository: FreshfulCatalogRepository;
  service: FreshfulCatalogService;
  now?: () => Date;
}

function toFailureMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.cause instanceof Error && error.cause.message.trim().length > 0) {
    return error.cause.message;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallbackMessage;
}

function shouldRefresh(mode: FreshfulCatalogRefreshMode, recencyStatus: FreshfulCatalogRecencyStatus): boolean {
  return mode === "all" || recencyStatus !== "fresh";
}

function dedupeSearchCandidates(
  candidates: Array<FreshfulCatalogSearchInput | { input: FreshfulCatalogSearchInput; fetchedAt: string; expiresAt: string }>
) {
  const dedupedCandidates = new Map<string, FreshfulCatalogSearchInput | { input: FreshfulCatalogSearchInput; fetchedAt: string; expiresAt: string }>();

  for (const candidate of candidates) {
    const input = "query" in candidate ? freshfulCatalogSearchInputSchema.parse(candidate) : candidate.input;

    dedupedCandidates.set(buildFreshfulSearchCacheKey(input), candidate);
  }

  return [...dedupedCandidates.values()];
}

function dedupeProductCandidates(
  candidates: Array<FreshfulProductReference | { productReference: FreshfulProductReference; product: { lastSeenAt: string } }>
) {
  const dedupedCandidates = new Map<
    string,
    FreshfulProductReference | { productReference: FreshfulProductReference; product: { lastSeenAt: string } }
  >();

  for (const candidate of candidates) {
    const reference = "freshfulId" in candidate ? freshfulProductReferenceSchema.parse(candidate) : candidate.productReference;

    dedupedCandidates.set(`${reference.freshfulId}:${reference.slug}`, candidate);
  }

  return [...dedupedCandidates.values()];
}

export function createFreshfulCatalogRefreshRunner(
  options: CreateFreshfulCatalogRefreshRunnerOptions
): FreshfulCatalogRefreshRunner {
  const now = options.now ?? (() => new Date());

  return {
    async run(runOptions = {}) {
      const mode = runOptions.mode ?? "stale-only";
      const startedAt = now().toISOString();
      const failures: FreshfulCatalogRefreshFailure[] = [];
      const search = {
        queued: 0,
        refreshed: 0,
        skippedFresh: 0,
        failed: 0
      };
      const products = {
        queued: 0,
        refreshed: 0,
        skippedFresh: 0,
        failed: 0
      };

      const explicitSearchInputs = runOptions.searchInputs?.map((input) => freshfulCatalogSearchInputSchema.parse(input)) ?? null;
      const explicitProductReferences =
        runOptions.productReferences?.map((reference) => freshfulProductReferenceSchema.parse(reference)) ?? null;
      const searchCandidates = dedupeSearchCandidates(
        explicitSearchInputs ?? (await options.repository.listSearchCaches({ limit: runOptions.searchLimit }))
      );
      const productCandidates = dedupeProductCandidates(
        explicitProductReferences ?? (await options.repository.listProductReferences({ limit: runOptions.productLimit }))
      );

      search.queued = searchCandidates.length;
      products.queued = productCandidates.length;

      for (const candidate of searchCandidates) {
        const input = "query" in candidate ? freshfulCatalogSearchInputSchema.parse(candidate) : candidate.input;

        if (!("query" in candidate)) {
          const recency = evaluateFreshfulCatalogRecency({
            policy: "search",
            observedAt: candidate.fetchedAt,
            now: now()
          });

          if (!shouldRefresh(mode, recency.status)) {
            search.skippedFresh += 1;
            continue;
          }
        }

        try {
          freshfulCatalogSearchResultSchema.parse(await options.service.refreshSearchProducts(input));
          search.refreshed += 1;
        } catch (error) {
          search.failed += 1;
          failures.push(
            freshfulCatalogRefreshFailureSchema.parse({
              kind: "search",
              target: input.query,
              message: toFailureMessage(error, "Freshful search refresh failed.")
            })
          );
        }
      }

      for (const candidate of productCandidates) {
        const reference = "freshfulId" in candidate ? freshfulProductReferenceSchema.parse(candidate) : candidate.productReference;

        if (!("freshfulId" in candidate)) {
          const recency = evaluateFreshfulCatalogRecency({
            policy: "product-detail",
            observedAt: candidate.product.lastSeenAt,
            now: now()
          });

          if (!shouldRefresh(mode, recency.status)) {
            products.skippedFresh += 1;
            continue;
          }
        }

        try {
          freshfulCatalogProductDetailResultSchema.parse(await options.service.refreshProductDetails(reference));
          products.refreshed += 1;
        } catch (error) {
          products.failed += 1;
          failures.push(
            freshfulCatalogRefreshFailureSchema.parse({
              kind: "product",
              target: `${reference.freshfulId}:${reference.slug}`,
              message: toFailureMessage(error, "Freshful product refresh failed.")
            })
          );
        }
      }

      return freshfulCatalogRefreshResultSchema.parse({
        mode,
        startedAt,
        completedAt: now().toISOString(),
        search,
        products,
        failures
      });
    }
  };
}