import assert from "node:assert/strict";
import test from "node:test";

import { freshfulProductSchema } from "@freshful/contracts";

import {
  freshfulCatalogSearchInputSchema,
  freshfulProductReferenceSchema,
  freshfulRecordedPageObservationSchema,
  freshfulRecordedRequestSchema,
  freshfulSearchProductCandidateSchema
} from "../apps/api/src/freshful/contracts.ts";
import {
  freshfulAdapterSearchInputFixture,
  freshfulNormalizedProductFixture,
  freshfulProductReferenceFixture,
  freshfulRecordedPageObservationFixtures,
  freshfulRecordedProductSlug,
  freshfulRecordedRequestFixtures,
  freshfulSearchProductCandidateFixture
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
  const searchInput = freshfulCatalogSearchInputSchema.parse(freshfulAdapterSearchInputFixture);
  const productReference = freshfulProductReferenceSchema.parse(freshfulProductReferenceFixture);
  const searchCandidate = freshfulSearchProductCandidateSchema.parse(freshfulSearchProductCandidateFixture);
  const normalizedProduct = freshfulProductSchema.parse(freshfulNormalizedProductFixture);

  assert.equal(searchInput.query, "clatite fara gluten");
  assert.equal(productReference.slug, freshfulRecordedProductSlug);
  assert.equal(searchCandidate.productReference.detailUrl, productReference.detailUrl);
  assert.equal(searchCandidate.searchMetadata?.rank, 0);
  assert.equal(searchCandidate.availability, "out_of_stock");
  assert.equal(normalizedProduct.freshfulId, productReference.freshfulId);
  assert.equal(normalizedProduct.currency, "RON");
  assert.equal(normalizedProduct.category, "Unknown");
});