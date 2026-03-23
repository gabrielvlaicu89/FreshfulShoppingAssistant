import { createHash } from "node:crypto";

import { freshfulProductSchema } from "@freshful/contracts";

import {
  freshfulCatalogProductDetailResultSchema,
  freshfulCatalogSearchInputSchema,
  freshfulCatalogSearchResultSchema,
  freshfulProductReferenceSchema,
  freshfulSearchProductCandidateSchema,
  type FreshfulCatalogAdapter,
  type FreshfulCatalogProductDetailResult,
  type FreshfulCatalogSearchInput,
  type FreshfulCatalogSearchResult,
  type FreshfulProductReference,
  type FreshfulSearchProductCandidate
} from "./contracts.js";
import { FreshfulCatalogNormalizationError, FreshfulCatalogUnavailableError } from "./errors.js";
import {
  DETAIL_CACHE_TTL_MS,
  SEARCH_CACHE_TTL_MS,
  evaluateFreshfulCatalogRecency,
  freshfulCatalogRecencySchema
} from "./policy.js";
import type { FreshfulCatalogClient } from "./client.js";
import type { FreshfulCatalogRepository } from "./repository.js";

interface RawFreshfulProduct {
  code?: unknown;
  sku?: unknown;
  name?: unknown;
  slug?: unknown;
  price?: unknown;
  currencyCode?: unknown;
  unitPriceLabel?: unknown;
  image?: unknown;
  tags?: unknown;
  isAvailable?: unknown;
  maxAvailableQuantity?: unknown;
  breadcrumbs?: unknown;
  url?: unknown;
}

export interface CreateFreshfulCatalogServiceOptions {
  repository: FreshfulCatalogRepository;
  client: FreshfulCatalogClient;
  now?: () => Date;
}

export interface FreshfulCatalogService extends FreshfulCatalogAdapter {
  refreshSearchProducts(input: FreshfulCatalogSearchInput): Promise<FreshfulCatalogSearchResult>;
  refreshProductDetails(reference: FreshfulProductReference): Promise<FreshfulCatalogProductDetailResult>;
}

function hashResponse(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function toMillis(value: string): number {
  return new Date(value).getTime();
}

function canonicalizeFilters(filters: FreshfulCatalogSearchInput["filters"] | undefined): string {
  if (!filters) {
    return "{}";
  }

  const canonicalFilters: Record<string, string | number> = {};

  if (filters.brand) {
    canonicalFilters.brand = filters.brand.trim().toLowerCase();
  }

  if (filters.category) {
    canonicalFilters.category = filters.category.trim().toLowerCase();
  }

  if (typeof filters.maxPriceRon === "number") {
    canonicalFilters.maxPriceRon = Number(filters.maxPriceRon.toFixed(2));
  }

  return JSON.stringify(canonicalFilters);
}

export function buildFreshfulSearchCacheKey(input: FreshfulCatalogSearchInput): string {
  const parsedInput = freshfulCatalogSearchInputSchema.parse(input);

  return `${parsedInput.query.trim().toLowerCase()}::${canonicalizeFilters(parsedInput.filters)}`;
}

function extractNextDataJson(html: string): unknown | null {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]+?)<\/script>/u);

  if (!match?.[1]) {
    return null;
  }

  try {
    return JSON.parse(match[1]) as unknown;
  } catch {
    return null;
  }
}

function unwrapPayload(payload: unknown): unknown {
  if (typeof payload === "string") {
    return extractNextDataJson(payload) ?? payload;
  }

  return payload;
}

function maybeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getObjectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function readNested(root: unknown, path: readonly string[]): unknown {
  let cursor: unknown = root;

  for (const segment of path) {
    const record = getObjectRecord(cursor);

    if (!record || !(segment in record)) {
      return undefined;
    }

    cursor = record[segment];
  }

  return cursor;
}

function isRawProductRecord(value: unknown): value is RawFreshfulProduct {
  const record = getObjectRecord(value);

  return Boolean(
    record &&
      (typeof record.code === "string" || typeof record.sku === "string") &&
      typeof record.name === "string" &&
      typeof record.slug === "string" &&
      typeof record.price === "number"
  );
}

function collectRawProducts(value: unknown, results: RawFreshfulProduct[] = []): RawFreshfulProduct[] {
  if (isRawProductRecord(value)) {
    results.push(value);
    return results;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectRawProducts(item, results);
    }

    return results;
  }

  const record = getObjectRecord(value);

  if (!record) {
    return results;
  }

  for (const nestedValue of Object.values(record)) {
    collectRawProducts(nestedValue, results);
  }

  return results;
}

function deriveUnit(name: string, unitPriceLabel: unknown): string {
  const nameMatch = name.match(/(\d+[.,]?\d*\s?(?:kg|g|mg|ml|l|buc|bax|pack|set))(?!.*\d)/iu);

  if (nameMatch?.[1]) {
    return nameMatch[1].replace(/\s+/gu, " ").trim();
  }

  if (typeof unitPriceLabel === "string") {
    const labelMatch = unitPriceLabel.match(/\/(kg|g|mg|ml|l|buc)$/iu);

    if (labelMatch?.[1]) {
      return `1 ${labelMatch[1].toLowerCase()}`;
    }
  }

  return "1 item";
}

function deriveCategory(rawProduct: RawFreshfulProduct): string {
  const breadcrumbs = maybeArray(rawProduct.breadcrumbs)
    .map((entry) => getObjectRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));

  if (breadcrumbs.length >= 2) {
    const category = breadcrumbs[breadcrumbs.length - 2]?.name;

    if (typeof category === "string" && category.trim().length > 0) {
      return category.trim();
    }
  }

  return "Unknown";
}

function deriveImageUrl(rawProduct: RawFreshfulProduct): string {
  const thumbnail = readNested(rawProduct.image, ["thumbnail", "default"]);

  if (typeof thumbnail === "string" && thumbnail.startsWith("http")) {
    return thumbnail;
  }

  const large = readNested(rawProduct.image, ["large", "default"]);

  if (typeof large === "string" && large.startsWith("http")) {
    return large;
  }

  throw new FreshfulCatalogNormalizationError("Freshful product image URL is missing.");
}

function deriveAvailability(rawProduct: RawFreshfulProduct): "in_stock" | "low_stock" | "out_of_stock" | "unknown" {
  if (rawProduct.isAvailable === false) {
    return "out_of_stock";
  }

  if (rawProduct.isAvailable === true) {
    const maxAvailableQuantity = typeof rawProduct.maxAvailableQuantity === "number" ? rawProduct.maxAvailableQuantity : null;

    if (typeof maxAvailableQuantity === "number" && maxAvailableQuantity > 0 && maxAvailableQuantity <= 5) {
      return "low_stock";
    }

    return "in_stock";
  }

  return "unknown";
}

function deriveMatchedTerm(query: string, name: string): string | undefined {
  const queryTokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/u)
    .filter(Boolean);
  const normalizedName = name.toLowerCase();

  for (const token of queryTokens) {
    if (normalizedName.includes(token)) {
      return token;
    }
  }

  return undefined;
}

function normalizeProductRecord(
  rawProduct: RawFreshfulProduct,
  fetchedAt: string,
  input: { query?: string; rank?: number; reference?: FreshfulProductReference }
): { product: ReturnType<typeof freshfulProductSchema.parse>; productReference: FreshfulProductReference } {
  const freshfulId =
    typeof rawProduct.code === "string"
      ? rawProduct.code.trim()
      : typeof rawProduct.sku === "string"
        ? rawProduct.sku.trim()
        : input.reference?.freshfulId;

  if (!freshfulId) {
    throw new FreshfulCatalogNormalizationError("Freshful product id is missing.");
  }

  const slug = typeof rawProduct.slug === "string" && rawProduct.slug.trim().length > 0 ? rawProduct.slug.trim() : input.reference?.slug;

  if (!slug) {
    throw new FreshfulCatalogNormalizationError(`Freshful slug is missing for product ${freshfulId}.`);
  }

  const productReference = freshfulProductReferenceSchema.parse({
    freshfulId,
    slug,
    detailPath: `/p/${slug}`,
    detailUrl: typeof rawProduct.url === "string" && rawProduct.url.startsWith("http") ? rawProduct.url : `https://www.freshful.ro/p/${slug}`
  });
  const product = freshfulProductSchema.parse({
    id: `freshful:${freshfulId}:${productReference.slug}`,
    freshfulId,
    name: typeof rawProduct.name === "string" ? rawProduct.name.trim() : `Freshful product ${freshfulId}`,
    price: typeof rawProduct.price === "number" ? rawProduct.price : Number(rawProduct.price),
    currency: rawProduct.currencyCode === "RON" ? "RON" : "RON",
    unit: deriveUnit(typeof rawProduct.name === "string" ? rawProduct.name : `Freshful product ${freshfulId}`, rawProduct.unitPriceLabel),
    category: deriveCategory(rawProduct),
    tags: maybeArray(rawProduct.tags)
      .map((tag) => getObjectRecord(tag)?.text)
      .filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
      .map((tag) => tag.trim()),
    imageUrl: deriveImageUrl(rawProduct),
    lastSeenAt: fetchedAt,
    availability: deriveAvailability(rawProduct),
    searchMetadata:
      typeof input.query === "string" && typeof input.rank === "number"
        ? {
            query: input.query,
            rank: input.rank,
            matchedTerm: deriveMatchedTerm(input.query, typeof rawProduct.name === "string" ? rawProduct.name : "")
          }
        : undefined
  });

  return {
    product,
    productReference
  };
}

function findDetailProduct(payload: unknown, reference: FreshfulProductReference): RawFreshfulProduct | null {
  const unwrappedPayload = unwrapPayload(payload);
  const queryEntries = maybeArray(readNested(unwrappedPayload, ["pageProps", "dehydratedState", "queries"]));

  for (const queryEntry of queryEntries) {
    const queryKey = maybeArray(getObjectRecord(queryEntry)?.queryKey);

    if (queryKey[0] !== "product") {
      continue;
    }

    const stateData = readNested(queryEntry, ["state", "data"]);

    if (isRawProductRecord(stateData)) {
      return stateData;
    }
  }

  return collectRawProducts(unwrappedPayload).find((product) => {
    const code = typeof product.code === "string" ? product.code : typeof product.sku === "string" ? product.sku : null;
    return code === reference.freshfulId || product.slug === reference.slug;
  }) ?? null;
}

function applySearchFilters(products: FreshfulSearchProductCandidate[], input: FreshfulCatalogSearchInput) {
  return products.filter((product) => {
    if (input.filters?.brand) {
      const brandPattern = new RegExp(input.filters.brand.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "iu");

      if (!brandPattern.test(product.productReference.slug) && !brandPattern.test(product.name)) {
        return false;
      }
    }

    if (input.filters?.category && product.category.toLowerCase() !== input.filters.category.toLowerCase()) {
      return false;
    }

    if (typeof input.filters?.maxPriceRon === "number" && product.price > input.filters.maxPriceRon) {
      return false;
    }

    return true;
  });
}

function normalizeSearchPayload(payload: unknown, input: FreshfulCatalogSearchInput, fetchedAt: string): FreshfulSearchProductCandidate[] {
  const unwrappedPayload = unwrapPayload(payload);
  const rawProducts = collectRawProducts(unwrappedPayload);

  if (rawProducts.length === 0) {
    return [];
  }

  const dedupedProducts = new Map<string, FreshfulSearchProductCandidate>();

  rawProducts.forEach((rawProduct, index) => {
    const normalizedProduct = normalizeProductRecord(rawProduct, fetchedAt, {
      query: input.query,
      rank: index
    });

    dedupedProducts.set(
      normalizedProduct.product.freshfulId,
      freshfulSearchProductCandidateSchema.parse({
        ...normalizedProduct.product,
        productReference: normalizedProduct.productReference
      })
    );
  });

  return applySearchFilters([...dedupedProducts.values()], input);
}

function normalizeDetailPayload(
  payload: unknown,
  reference: FreshfulProductReference,
  fetchedAt: string
): FreshfulCatalogProductDetailResult {
  const rawProduct = findDetailProduct(payload, reference);

  if (!rawProduct) {
    throw new FreshfulCatalogNormalizationError(`Freshful detail payload did not include product ${reference.freshfulId}.`);
  }

  const normalizedProduct = normalizeProductRecord(rawProduct, fetchedAt, {
    reference
  });

  return freshfulCatalogProductDetailResultSchema.parse({
    product: normalizedProduct.product,
    productReference: normalizedProduct.productReference,
    cache: {
      source: "network",
      isStale: false,
      fetchedAt,
      expiresAt: new Date(toMillis(fetchedAt) + DETAIL_CACHE_TTL_MS).toISOString(),
      recency: evaluateFreshfulCatalogRecency({
        policy: "product-detail",
        observedAt: fetchedAt,
        now: new Date(fetchedAt)
      })
    }
  });
}

function buildSearchCacheMetadata(args: {
  source: "network" | "cache" | "stale-cache";
  fetchedAt: string;
  now: Date;
  fallbackReason?: string;
}) {
  const recency = freshfulCatalogRecencySchema.parse(
    evaluateFreshfulCatalogRecency({
      policy: "search",
      observedAt: args.fetchedAt,
      now: args.now
    })
  );

  return {
    source: args.source,
    isStale: args.source === "stale-cache",
    fetchedAt: args.fetchedAt,
    expiresAt: recency.freshUntil,
    recency,
    ...(args.fallbackReason ? { fallbackReason: args.fallbackReason } : {})
  };
}

function buildDetailCacheMetadata(args: {
  source: "network" | "cache" | "stale-cache";
  observedAt: string;
  now: Date;
  fallbackReason?: string;
}) {
  const recency = freshfulCatalogRecencySchema.parse(
    evaluateFreshfulCatalogRecency({
      policy: "product-detail",
      observedAt: args.observedAt,
      now: args.now
    })
  );

  return {
    source: args.source,
    isStale: args.source === "stale-cache",
    fetchedAt: args.observedAt,
    expiresAt: recency.freshUntil,
    recency,
    ...(args.fallbackReason ? { fallbackReason: args.fallbackReason } : {})
  };
}

export function createFreshfulCatalogService(options: CreateFreshfulCatalogServiceOptions): FreshfulCatalogService {
  const now = options.now ?? (() => new Date());

  async function searchProductsInternal(
    input: FreshfulCatalogSearchInput,
    refreshBehavior: { forceRefresh: boolean; allowStaleFallback: boolean }
  ): Promise<FreshfulCatalogSearchResult> {
    const parsedInput = freshfulCatalogSearchInputSchema.parse(input);
    const currentDate = now();
    const cacheKey = buildFreshfulSearchCacheKey(parsedInput);
    const cachedSearch = await options.repository.getSearchCacheByKey(cacheKey);
    const cachedRecency = cachedSearch
      ? evaluateFreshfulCatalogRecency({
          policy: "search",
          observedAt: cachedSearch.fetchedAt,
          now: currentDate
        })
      : null;

    if (!refreshBehavior.forceRefresh && cachedSearch && cachedRecency?.status === "fresh") {
      return freshfulCatalogSearchResultSchema.parse({
        products: cachedSearch.products,
        cache: buildSearchCacheMetadata({
          source: "cache",
          fetchedAt: cachedSearch.fetchedAt,
          now: currentDate
        })
      });
    }

    try {
      const fetchedAt = currentDate.toISOString();
      const rawPayload = await options.client.search(parsedInput);
      const products = normalizeSearchPayload(rawPayload, parsedInput, fetchedAt);
      const expiresAt = new Date(currentDate.getTime() + SEARCH_CACHE_TTL_MS).toISOString();

      await options.repository.saveSearchResult({
        cacheKey,
        input: parsedInput,
        products,
        fetchedAt,
        expiresAt,
        responseHash: hashResponse(rawPayload)
      });

      return freshfulCatalogSearchResultSchema.parse({
        products,
        cache: buildSearchCacheMetadata({
          source: "network",
          fetchedAt,
          now: currentDate
        })
      });
    } catch (error) {
      if (refreshBehavior.allowStaleFallback && cachedSearch && cachedRecency?.status === "stale") {
        return freshfulCatalogSearchResultSchema.parse({
          products: cachedSearch.products,
          cache: buildSearchCacheMetadata({
            source: "stale-cache",
            fetchedAt: cachedSearch.fetchedAt,
            now: currentDate,
            fallbackReason: error instanceof Error ? error.message : "Freshful search request failed."
          })
        });
      }

      if (error instanceof FreshfulCatalogUnavailableError || error instanceof FreshfulCatalogNormalizationError) {
        throw error;
      }

      throw new FreshfulCatalogUnavailableError("Freshful search failed.", { cause: error });
    }
  }

  async function getProductDetailsInternal(
    reference: FreshfulProductReference,
    refreshBehavior: { forceRefresh: boolean; allowStaleFallback: boolean }
  ): Promise<FreshfulCatalogProductDetailResult> {
    const parsedReference = freshfulProductReferenceSchema.parse(reference);
    const currentDate = now();
    const cachedProduct = await options.repository.getProductByReference(parsedReference);
    const cachedRecency = cachedProduct
      ? evaluateFreshfulCatalogRecency({
          policy: "product-detail",
          observedAt: cachedProduct.product.lastSeenAt,
          now: currentDate
        })
      : null;

    if (!refreshBehavior.forceRefresh && cachedProduct && cachedRecency?.status === "fresh") {
      return freshfulCatalogProductDetailResultSchema.parse({
        product: cachedProduct.product,
        productReference: cachedProduct.productReference,
        cache: buildDetailCacheMetadata({
          source: "cache",
          observedAt: cachedProduct.product.lastSeenAt,
          now: currentDate
        })
      });
    }

    try {
      const fetchedAt = currentDate.toISOString();
      const rawPayload = await options.client.getProductDetail(parsedReference);
      const normalizedResult = normalizeDetailPayload(rawPayload, parsedReference, fetchedAt);
      const persisted = await options.repository.saveProductDetail({
        reference: normalizedResult.productReference,
        product: normalizedResult.product
      });

      return freshfulCatalogProductDetailResultSchema.parse({
        product: persisted.product,
        productReference: persisted.productReference,
        cache: buildDetailCacheMetadata({
          source: "network",
          observedAt: persisted.product.lastSeenAt,
          now: currentDate
        })
      });
    } catch (error) {
      if (refreshBehavior.allowStaleFallback && cachedProduct && cachedRecency?.status === "stale") {
        return freshfulCatalogProductDetailResultSchema.parse({
          product: cachedProduct.product,
          productReference: cachedProduct.productReference,
          cache: buildDetailCacheMetadata({
            source: "stale-cache",
            observedAt: cachedProduct.product.lastSeenAt,
            now: currentDate,
            fallbackReason: error instanceof Error ? error.message : "Freshful product detail request failed."
          })
        });
      }

      if (error instanceof FreshfulCatalogUnavailableError || error instanceof FreshfulCatalogNormalizationError) {
        throw error;
      }

      throw new FreshfulCatalogUnavailableError("Freshful product detail lookup failed.", { cause: error });
    }
  }

  return {
    async searchProducts(input) {
      return searchProductsInternal(input, {
        forceRefresh: false,
        allowStaleFallback: true
      });
    },

    async refreshSearchProducts(input) {
      return searchProductsInternal(input, {
        forceRefresh: true,
        allowStaleFallback: false
      });
    },

    async getProductDetails(reference) {
      return getProductDetailsInternal(reference, {
        forceRefresh: false,
        allowStaleFallback: true
      });
    },

    async refreshProductDetails(reference) {
      return getProductDetailsInternal(reference, {
        forceRefresh: true,
        allowStaleFallback: false
      });
    }
  };
}