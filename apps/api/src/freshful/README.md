# Freshful Catalog Contract

This folder captures the P7-S1 Freshful catalog integration contract and the reverse-engineering findings that the backend will implement in P7-S2. It does not include a network client, parser, or cache implementation yet.

## Scope Boundary

- v1 is read-only catalog access for search and product details.
- Anonymous storefront reads are in scope.
- Cart, login, address-specific sessions, and checkout flows are explicitly out of scope for this step.

## Recorded Request Patterns

Recorded fixtures live in `fixtures.ts` and are covered by `tests/api-freshful-contract.test.ts`.

### Search

- Public route sample: `GET https://www.freshful.ro/search?query=lapte`
- Next.js data sample: `GET https://www.freshful.ro/_next/data/{buildId}/search.json?query=lapte`
- Recorded page: `/search/[[...slug]]`
- Recorded finding: the server payload preserved `query.query = lapte`, but the recorded `pageProps.urlParams.searchQuery` stayed `null` and the dehydrated query keys only contained `config`.

Practical consequence: treat the public search page and the matching `/_next/data` route as routing metadata only until a result-carrying client fetch is confirmed in P7-S2. Search parsing must stay behind an adapter seam so the product layer does not couple itself to a fragile storefront hydration path.

### Product Detail

- Public route sample: `GET https://www.freshful.ro/p/{freshfulId}-{slug}`
- Next.js data sample: `GET https://www.freshful.ro/_next/data/{buildId}/p/{freshfulId}-{slug}.json`
- Recorded page: `/p/[[...slug]]`
- Recorded dehydrated query key: `['product', slug]`

Recorded stable detail fields from the storefront payload:

- `code` and `sku` for the upstream product identifier
- `slug` and canonical `url`
- `name`
- `price` and `currencyCode`
- `image.thumbnail.default`
- `tags[*].text`
- `isAvailable`

These fields are sufficient to normalize a `FreshfulProduct` plus a separate `FreshfulProductReference` that preserves the storefront slug required by the detail route.

## Anti-Fragility Constraints

- Never hardcode a Next.js `buildId`; it is a recording artifact, not a stable identifier.
- Keep search and detail fetch logic isolated behind `FreshfulCatalogAdapter` so storefront changes do not leak into planner or shopping-list code.
- Preserve both `freshfulId` and slug from any search candidate. The recorded detail route is slug-based even when the upstream numeric code is known.
- Normalize missing catalog fields defensively. The recorded detail payload did not expose a reliable category value, so the adapter contract allows a fallback such as `Unknown`.
- Derive pack-size display carefully. The recorded payload exposed `unitPriceLabel` but not a dedicated normalized unit field, so adapters may need to infer `unit` from the title or other storefront metadata.
- Treat timeout or parse failures as cacheable integration failures rather than planner failures. Upstream services should be able to fall back to stale normalized data.
- Stay within low-volume, anonymous catalog reads until the integration proves stable.

## Caching Expectations

- Search cache key: lowercase trimmed query plus canonicalized filters from `FreshfulCatalogSearchInput`.
- Search cache TTL target: 15 minutes.
- Detail cache key: `freshfulId + slug` from `FreshfulProductReference`.
- Detail cache TTL target: 6 hours.
- Every successful search or detail normalization should stamp `lastSeenAt` on the normalized product payload.
- If Freshful is unavailable, the adapter should prefer a stale cached search or detail record up to 24 hours old and mark the caller-facing result as stale in P7-S2.

These are implementation expectations for the adapter layer, not guarantees already enforced in code.

## Normalized Adapter Contract

`contracts.ts` defines the backend-facing seam for product code:

- `FreshfulCatalogSearchInput`: user query plus optional shared `FreshfulSearchFilters`
- `FreshfulProductReference`: upstream `freshfulId` plus the recorded storefront slug and detail URL
- `FreshfulSearchProductCandidate`: normalized shared product fields plus the `FreshfulProductReference` needed for detail hydration
- `FreshfulCatalogAdapter`: `searchProducts(input)` and `getProductDetails(reference)`
- `FreshfulCatalogCacheMetadata`: caller-facing freshness metadata, including stale-cache fallback reason when Freshful is unavailable

The runtime P7-S2 adapter returns result envelopes instead of bare arrays or products so upstream services can distinguish fresh cache hits, live network reads, and stale fallback behavior without coupling themselves to persistence details.

The deliberate split between `FreshfulProduct` and `FreshfulProductReference` keeps the shared product schema stable while still carrying the slug that the storefront detail route currently requires.