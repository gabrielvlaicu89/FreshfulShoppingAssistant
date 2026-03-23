import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFreshfulSearchCacheKey,
  createApiApp,
  createFreshfulCatalogClient,
  createFreshfulCatalogRepository,
  createFreshfulCatalogService,
  type ApiConfig,
  type FreshfulCatalogClient
} from "../apps/api/src/index.ts";
import { databaseTables } from "../apps/api/src/db/schema.ts";
import { createMigratedTestDatabase } from "../apps/api/src/db/testing.ts";
import {
  freshfulNormalizedProductFixture,
  freshfulProductReferenceFixture,
  freshfulRecordedSearchInputFixture,
  freshfulRecordedSearchProductCandidateFixture,
  freshfulRecordedSearchResponseFixture
} from "../apps/api/src/freshful/fixtures.ts";

function createTestApiConfig(): ApiConfig {
  return {
    appEnv: "test",
    port: 3110,
    databaseUrl: "postgres://freshful:freshful@localhost:5432/freshful_test",
    session: {
      secret: "abcdefghijklmnopqrstuvwxyz123456",
      ttlSeconds: 3600,
      issuer: "@freshful/api"
    },
    google: {
      webClientId: "test-web-client.apps.googleusercontent.com"
    },
    anthropic: null,
    freshful: {
      baseUrl: "https://www.freshful.ro",
      searchPath: "/api/v2/shop/search",
      requestTimeoutMs: 10000
    }
  };
}

function createSearchPayload(overrides: Partial<typeof freshfulRecordedSearchResponseFixture> = {}) {
  return {
    ...freshfulRecordedSearchResponseFixture,
    ...overrides,
    items: overrides.items ?? freshfulRecordedSearchResponseFixture.items
  };
}

function createDetailPayload(
  reference = freshfulProductReferenceFixture,
  overrides: Partial<{
    name: string;
    price: number;
    imageUrl: string;
    tags: string[];
    isAvailable: boolean;
    maxAvailableQuantity: number;
  }> = {}
) {
  const name = overrides.name ?? freshfulNormalizedProductFixture.name;
  const price = overrides.price ?? freshfulNormalizedProductFixture.price;
  const imageUrl = overrides.imageUrl ?? freshfulNormalizedProductFixture.imageUrl;
  const tags = overrides.tags ?? freshfulNormalizedProductFixture.tags;
  const isAvailable = overrides.isAvailable ?? false;
  const maxAvailableQuantity = overrides.maxAvailableQuantity ?? 0;

  return {
    pageProps: {
      dehydratedState: {
        queries: [
          {
            queryKey: ["product", reference.slug],
            state: {
              data: {
                code: freshfulNormalizedProductFixture.freshfulId,
                sku: freshfulNormalizedProductFixture.freshfulId,
                name,
                slug: reference.slug,
                price,
                currencyCode: freshfulNormalizedProductFixture.currency,
                unitPriceLabel: "153,66 Lei/kg",
                image: {
                  thumbnail: {
                    default: imageUrl
                  }
                },
                tags: tags.map((text) => ({ text })),
                isAvailable,
                maxAvailableQuantity,
                breadcrumbs: [
                  { name: "Dietetic, ECO & international" },
                  { name: "Produse fara gluten" },
                  { name }
                ]
              }
            }
          }
        ]
      }
    }
  };
}

test("Freshful client builds search requests against the confirmed shop search endpoint", async () => {
  const requestedUrls: string[] = [];
  const client = createFreshfulCatalogClient({
    config: createTestApiConfig().freshful,
    fetchImplementation: (async (input) => {
      requestedUrls.push(input instanceof URL ? input.toString() : String(input));

      return new Response(JSON.stringify(createSearchPayload()), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      });
    }) as typeof fetch
  });

  await client.search(freshfulRecordedSearchInputFixture);

  assert.deepEqual(requestedUrls, ["https://www.freshful.ro/api/v2/shop/search/lapte?page=1&itemsPerPage=30"]);
});

test("Freshful adapter normalizes recorded shop search results, persists per-cache candidates, and serves cache hits", async () => {
  const database = await createMigratedTestDatabase();
  let searchCalls = 0;
  const searchNow = new Date("2026-03-23T10:00:00.000Z");
  const repository = createFreshfulCatalogRepository(database.db);
  const client: FreshfulCatalogClient = {
    async search() {
      searchCalls += 1;
      return createSearchPayload();
    },
    async getProductDetail() {
      return createDetailPayload();
    }
  };
  const service = createFreshfulCatalogService({
    repository,
    client,
    now: () => searchNow
  });

  try {
    const firstResult = await service.searchProducts(freshfulRecordedSearchInputFixture);
    const secondResult = await service.searchProducts(freshfulRecordedSearchInputFixture);
    const [storedProduct] = await database.db.select().from(databaseTables.freshfulProducts);
    const [storedCacheEntry] = await database.db.select().from(databaseTables.cachedSearchResults);

    assert.equal(searchCalls, 1);
    assert.equal(firstResult.cache.source, "network");
    assert.deepEqual(firstResult.products[0], {
      ...freshfulRecordedSearchProductCandidateFixture,
      lastSeenAt: searchNow.toISOString()
    });
    assert.equal(secondResult.cache.source, "cache");
    assert.equal(secondResult.products[0]?.searchMetadata?.query, freshfulRecordedSearchInputFixture.query);
    assert.equal(storedProduct?.slug, freshfulRecordedSearchProductCandidateFixture.productReference.slug);
    assert.equal(storedProduct?.detailPath, freshfulRecordedSearchProductCandidateFixture.productReference.detailPath);
    assert.equal(storedProduct?.detailUrl, freshfulRecordedSearchProductCandidateFixture.productReference.detailUrl);
    assert.equal(storedProduct?.searchMetadata, null);
    assert.equal(storedCacheEntry?.cacheKey, buildFreshfulSearchCacheKey(freshfulRecordedSearchInputFixture));
    assert.equal(Array.isArray(storedCacheEntry?.products), true);
    assert.equal(storedCacheEntry?.products[0]?.searchMetadata?.rank, 0);
    assert.equal(storedCacheEntry?.products[0]?.searchMetadata?.matchedTerm, "lapte");
  } finally {
    await database.client.close();
  }
});

test("Freshful adapter falls back to stale cached search results when Freshful search fails", async () => {
  const database = await createMigratedTestDatabase();
  const repository = createFreshfulCatalogRepository(database.db);
  const createdAt = new Date("2026-03-23T10:00:00.000Z");
  const staleReadAt = new Date("2026-03-23T10:16:00.000Z");
  let shouldFail = false;
  const client: FreshfulCatalogClient = {
    async search() {
      if (shouldFail) {
        throw new Error("network unavailable");
      }

      return createSearchPayload();
    },
    async getProductDetail() {
      return createDetailPayload();
    }
  };
  const service = createFreshfulCatalogService({
    repository,
    client,
    now: () => (shouldFail ? staleReadAt : createdAt)
  });

  try {
    await service.searchProducts(freshfulRecordedSearchInputFixture);
    shouldFail = true;

    const staleResult = await service.searchProducts(freshfulRecordedSearchInputFixture);

    assert.equal(staleResult.cache.source, "stale-cache");
    assert.equal(staleResult.cache.isStale, true);
    assert.match(staleResult.cache.fallbackReason ?? "", /network unavailable/u);
    assert.equal(staleResult.products[0]?.freshfulId, freshfulRecordedSearchProductCandidateFixture.freshfulId);
  } finally {
    await database.client.close();
  }
});

test("Freshful adapter preserves per-cache ranking metadata when the same product appears in multiple cache keys", async () => {
  const database = await createMigratedTestDatabase();
  const repository = createFreshfulCatalogRepository(database.db);
  const createdAt = new Date("2026-03-23T10:00:00.000Z");
  const secondCreatedAt = new Date("2026-03-23T10:05:00.000Z");
  const targetProductId = freshfulRecordedSearchProductCandidateFixture.freshfulId;
  const client: FreshfulCatalogClient = {
    async search(input) {
      if (input.filters?.category === "Lapte proaspat") {
        return createSearchPayload({
          items: [freshfulRecordedSearchResponseFixture.items[1], freshfulRecordedSearchResponseFixture.items[0]]
        });
      }

      return createSearchPayload();
    },
    async getProductDetail() {
      return createDetailPayload();
    }
  };
  let now = createdAt;
  const service = createFreshfulCatalogService({
    repository,
    client,
    now: () => now
  });

  try {
    await service.searchProducts(freshfulRecordedSearchInputFixture);
    now = secondCreatedAt;
    await service.searchProducts({
      query: freshfulRecordedSearchInputFixture.query,
      filters: {
        category: "Lapte proaspat"
      }
    });

    now = new Date("2026-03-23T10:06:00.000Z");

    const baseCacheResult = await service.searchProducts(freshfulRecordedSearchInputFixture);
    const filteredCacheResult = await service.searchProducts({
      query: freshfulRecordedSearchInputFixture.query,
      filters: {
        category: "Lapte proaspat"
      }
    });

    const baseProduct = baseCacheResult.products.find((product) => product.freshfulId === targetProductId);
    const filteredProduct = filteredCacheResult.products.find((product) => product.freshfulId === targetProductId);

    assert.equal(baseCacheResult.cache.source, "cache");
    assert.equal(filteredCacheResult.cache.source, "cache");
    assert.equal(baseProduct?.searchMetadata?.rank, 0);
    assert.equal(filteredProduct?.searchMetadata?.rank, 1);
    assert.equal(baseProduct?.searchMetadata?.matchedTerm, "lapte");
    assert.equal(filteredProduct?.searchMetadata?.matchedTerm, "lapte");
  } finally {
    await database.client.close();
  }
});

test("Freshful adapter normalizes product detail payloads and the API shell wires a ready freshful service", async (t) => {
  const database = await createMigratedTestDatabase();
  const detailNow = new Date("2026-03-23T12:00:00.000Z");
  const repository = createFreshfulCatalogRepository(database.db);
  const client: FreshfulCatalogClient = {
    async search() {
      return createSearchPayload();
    },
    async getProductDetail() {
      return createDetailPayload();
    }
  };
  const service = createFreshfulCatalogService({
    repository,
    client,
    now: () => detailNow
  });
  const app = createApiApp({
    config: createTestApiConfig(),
    logger: false,
    freshful: {
      client,
      repository,
      service
    }
  });

  t.after(async () => {
    await app.close();
    await database.client.close();
  });

  const detailResult = await service.getProductDetails(freshfulProductReferenceFixture);
  const healthResponse = await app.inject({
    method: "GET",
    url: "/health?details=full"
  });

  assert.equal(detailResult.cache.source, "network");
  assert.equal(detailResult.product.freshfulId, freshfulNormalizedProductFixture.freshfulId);
  assert.equal(detailResult.product.availability, "out_of_stock");
  assert.equal(detailResult.productReference.detailUrl, freshfulProductReferenceFixture.detailUrl);
  assert.equal(app.appContext.services.freshful.status, "ready");
  assert.equal(healthResponse.statusCode, 200);
  assert.equal(healthResponse.json().services.freshful.status, "ready");
});

test("Freshful adapter keeps separate detail cache entries for the same freshfulId under different slugs", async () => {
  const database = await createMigratedTestDatabase();
  const repository = createFreshfulCatalogRepository(database.db);
  let detailCalls = 0;
  const currentNow = new Date("2026-03-23T12:00:00.000Z");
  const secondReference = {
    ...freshfulProductReferenceFixture,
    slug: `${freshfulProductReferenceFixture.slug}-v2`,
    detailPath: `${freshfulProductReferenceFixture.detailPath}-v2`,
    detailUrl: `${freshfulProductReferenceFixture.detailUrl}-v2`
  };
  const client: FreshfulCatalogClient = {
    async search() {
      return createSearchPayload();
    },
    async getProductDetail(reference) {
      detailCalls += 1;

      if (detailCalls === 1) {
        return createDetailPayload(reference);
      }

      return createDetailPayload(reference, {
        name: `${freshfulNormalizedProductFixture.name} v2`,
        price: freshfulNormalizedProductFixture.price + 1
      });
    }
  };
  const service = createFreshfulCatalogService({
    repository,
    client,
    now: () => currentNow
  });

  try {
    const firstNetworkResult = await service.getProductDetails(freshfulProductReferenceFixture);
    const secondNetworkResult = await service.getProductDetails(secondReference);
    const firstCacheResult = await service.getProductDetails(freshfulProductReferenceFixture);
    const secondCacheResult = await service.getProductDetails(secondReference);
    const storedRows = await database.db.select().from(databaseTables.freshfulProducts);

    assert.equal(firstNetworkResult.cache.source, "network");
    assert.equal(secondNetworkResult.cache.source, "network");
    assert.equal(firstCacheResult.cache.source, "cache");
    assert.equal(secondCacheResult.cache.source, "cache");
    assert.equal(firstCacheResult.productReference.slug, freshfulProductReferenceFixture.slug);
    assert.equal(secondCacheResult.productReference.slug, secondReference.slug);
    assert.equal(firstCacheResult.product.name, freshfulNormalizedProductFixture.name);
    assert.equal(secondCacheResult.product.name, `${freshfulNormalizedProductFixture.name} v2`);
    assert.notEqual(firstCacheResult.product.id, secondCacheResult.product.id);
    assert.equal(detailCalls, 2);
    assert.equal(storedRows.length, 2);
  } finally {
    await database.client.close();
  }
});