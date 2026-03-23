import assert from "node:assert/strict";
import test from "node:test";

import { freshfulProductSchema } from "@freshful/contracts";
import { evaluateFreshfulCatalogRecency } from "../apps/api/src/index.ts";

import {
  freshfulCatalogProductDetailResultSchema,
  freshfulCatalogSearchResultSchema,
  freshfulCatalogSearchInputSchema,
  freshfulProductReferenceSchema,
  freshfulRecordedPageObservationSchema,
  freshfulRecordedRequestSchema,
  freshfulSearchProductCandidateSchema
} from "../apps/api/src/freshful/contracts.ts";
import {
  freshfulNormalizedProductFixture,
  freshfulProductReferenceFixture,
  freshfulRecordedPageObservationFixtures,
  freshfulRecordedSearchInputFixture,
  freshfulRecordedSearchProductCandidateFixture,
  freshfulRecordedSearchResponseFixture,
  freshfulRecordedProductSlug,
  freshfulRecordedRequestFixtures,
} from "../apps/api/src/freshful/fixtures.ts";

test("recorded Freshful request samples match the documented search and detail route patterns", () => {
  const parsedRequests = freshfulRecordedRequestSchema.array().parse(freshfulRecordedRequestFixtures);
  const searchRequests = parsedRequests.filter((request) => request.operation === "search");
  const detailRequests = parsedRequests.filter((request) => request.operation === "product-detail");

  assert.equal(searchRequests.length, 2);
  assert.equal(detailRequests.length, 2);
  assert.equal(searchRequests[0]?.url, "https://www.freshful.ro/search?query=lapte");
  assert.match(searchRequests[1]?.url ?? "", /\/_next\/data\/.+\/search\.json\?query=lapte$/u);
  assert.equal(detailRequests[0]?.url, `https://www.freshful.ro/p/${freshfulRecordedProductSlug}`);
  assert.match(detailRequests[1]?.url ?? "", new RegExp(`/_next/data/.+/p/${freshfulRecordedProductSlug}\\.json$`, "u"));
});

test("recorded page observations capture the current Freshful hydration boundary", () => {
  const parsedObservations = freshfulRecordedPageObservationSchema.array().parse(freshfulRecordedPageObservationFixtures);
  const searchObservation = parsedObservations.find((observation) => observation.operation === "search");
  const detailObservation = parsedObservations.find((observation) => observation.operation === "product-detail");

  assert.ok(searchObservation);
  assert.ok(detailObservation);

  assert.equal(searchObservation.page, "/search/[[...slug]]");
  assert.deepEqual(searchObservation.dehydratedQueryKeys, [["config"]]);
  assert.deepEqual(searchObservation.query, { query: "lapte" });
  assert.equal(searchObservation.urlParams.searchQuery, null);
  assert.equal(searchObservation.urlParams.hasSearchQuery, false);

  assert.equal(detailObservation.page, "/p/[[...slug]]");
  assert.deepEqual(detailObservation.query, { slug: [freshfulRecordedProductSlug] });
  assert.deepEqual(detailObservation.dehydratedQueryKeys[0], ["product", freshfulRecordedProductSlug]);
});

test("adapter fixtures cover the normalized search candidate and product detail output", () => {
  const searchInput = freshfulCatalogSearchInputSchema.parse(freshfulRecordedSearchInputFixture);
  const productReference = freshfulProductReferenceSchema.parse(freshfulProductReferenceFixture);
  const searchCandidate = freshfulSearchProductCandidateSchema.parse(freshfulRecordedSearchProductCandidateFixture);
  const normalizedProduct = freshfulProductSchema.parse(freshfulNormalizedProductFixture);
  const searchResult = freshfulCatalogSearchResultSchema.parse({
    products: [freshfulRecordedSearchProductCandidateFixture],
    cache: {
      source: "network",
      isStale: false,
      fetchedAt: freshfulRecordedSearchProductCandidateFixture.lastSeenAt,
      expiresAt: "2026-03-23T00:15:00.000Z",
      recency: evaluateFreshfulCatalogRecency({
        policy: "search",
        observedAt: freshfulRecordedSearchProductCandidateFixture.lastSeenAt,
        now: new Date(freshfulRecordedSearchProductCandidateFixture.lastSeenAt)
      })
    }
  });
  const productDetailResult = freshfulCatalogProductDetailResultSchema.parse({
    product: freshfulNormalizedProductFixture,
    productReference: freshfulProductReferenceFixture,
    cache: {
      source: "cache",
      isStale: false,
      fetchedAt: freshfulNormalizedProductFixture.lastSeenAt,
      expiresAt: "2026-03-23T06:00:00.000Z",
      recency: evaluateFreshfulCatalogRecency({
        policy: "product-detail",
        observedAt: freshfulNormalizedProductFixture.lastSeenAt,
        now: new Date(freshfulNormalizedProductFixture.lastSeenAt)
      })
    }
  });

  assert.equal(searchInput.query, "lapte");
  assert.equal(productReference.slug, freshfulRecordedProductSlug);
  assert.equal(searchCandidate.productReference.detailUrl, "https://www.freshful.ro/p/100003632-laptaria-cu-caimac-lapte-de-la-vaca-3-8-4-1-grasime-1l");
  assert.equal(searchCandidate.searchMetadata?.rank, 0);
  assert.equal(searchCandidate.availability, "in_stock");
  assert.equal(searchResult.cache.source, "network");
  assert.equal(searchResult.cache.recency.status, "fresh");
  assert.equal(searchResult.products[0]?.freshfulId, "100003632");
  assert.equal(normalizedProduct.freshfulId, productReference.freshfulId);
  assert.equal(normalizedProduct.currency, "RON");
  assert.equal(normalizedProduct.category, "Unknown");
  assert.equal(productDetailResult.productReference.slug, freshfulRecordedProductSlug);
  assert.equal(productDetailResult.cache.recency.policy, "product-detail");
});

test("recorded Freshful shop search fixture preserves the result-carrying items payload shape", () => {
  assert.equal(freshfulRecordedSearchResponseFixture.page, 1);
  assert.equal(freshfulRecordedSearchResponseFixture.itemsPerPage, 30);
  assert.equal(freshfulRecordedSearchResponseFixture.items.length, 2);
  assert.equal(freshfulRecordedSearchResponseFixture.items[0].code, "100003632");
  assert.equal(freshfulRecordedSearchResponseFixture.items[0].currencyCode, "RON");
  assert.equal(freshfulRecordedSearchResponseFixture.items[0].breadcrumbs[2]?.name, "Lapte proaspat");
  assert.equal(freshfulRecordedSearchResponseFixture.items[1].tags[0]?.text, "Fara lactoza");
});