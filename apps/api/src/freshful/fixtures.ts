import type { FreshfulProduct } from "@freshful/contracts";

import type {
  FreshfulCatalogSearchInput,
  FreshfulProductReference,
  FreshfulRecordedPageObservation,
  FreshfulRecordedRequest,
  FreshfulSearchProductCandidate
} from "./contracts.ts";

export const freshfulRecordedAt = "2026-03-23T00:00:00.000Z";
export const freshfulRecordedBuildId = "PXzVM2nYJsWBOgoX7IFYw";
export const freshfulRecordedProductSlug = "100075626-soligrano-mix-clatite-din-mei-cu-afine-fara-gluten-71g";

export const freshfulRecordedRequestFixtures: FreshfulRecordedRequest[] = [
  {
    operation: "search",
    surface: "html-page",
    method: "GET",
    url: "https://www.freshful.ro/search?query=lapte",
    routePattern: "/search?query={term}",
    notes: [
      "Public search route is server-rendered by Next.js page /search/[[...slug]].",
      "Recorded page metadata kept query.query but did not hydrate search results server-side."
    ]
  },
  {
    operation: "search",
    surface: "next-data",
    method: "GET",
    url: `https://www.freshful.ro/_next/data/${freshfulRecordedBuildId}/search.json?query=lapte`,
    routePattern: "/_next/data/{buildId}/search.json?query={term}",
    notes: [
      "Recorded payload returned route metadata and config only.",
      "Search result acquisition must stay behind an adapter boundary because this surface is incomplete for catalog reads."
    ]
  },
  {
    operation: "product-detail",
    surface: "html-page",
    method: "GET",
    url: `https://www.freshful.ro/p/${freshfulRecordedProductSlug}`,
    routePattern: "/p/{freshfulId}-{slug}",
    notes: [
      "Product detail route is a public Next.js page resolved by /p/[[...slug]].",
      "The recorded slug embeds the Freshful product code and a human-readable name segment."
    ]
  },
  {
    operation: "product-detail",
    surface: "next-data",
    method: "GET",
    url: `https://www.freshful.ro/_next/data/${freshfulRecordedBuildId}/p/${freshfulRecordedProductSlug}.json`,
    routePattern: "/_next/data/{buildId}/p/{freshfulId}-{slug}.json",
    notes: [
      "Recorded payload exposed a dehydrated query keyed as ['product', slug].",
      "Stable fields observed in the payload include code, sku, slug, name, price, currencyCode, image, tags, and isAvailable."
    ]
  }
];

export const freshfulRecordedPageObservationFixtures: FreshfulRecordedPageObservation[] = [
  {
    operation: "search",
    page: "/search/[[...slug]]",
    buildId: freshfulRecordedBuildId,
    pageType: "search",
    query: {
      query: "lapte"
    },
    urlParams: {
      page: 1,
      isPaginated: false,
      orderBy: null,
      isOrdered: false,
      filters: null,
      filtersCount: 0,
      filtersIndexable: true,
      isFiltered: false,
      searchQuery: null,
      hasSearchQuery: false,
      indexable: true,
      isDefault: true,
      pageType: "search",
      prefix: "/search",
      base: null,
      identifier: null,
      category: null,
      isDefaultCategory: false
    },
    dehydratedQueryKeys: [["config"]]
  },
  {
    operation: "product-detail",
    page: "/p/[[...slug]]",
    buildId: freshfulRecordedBuildId,
    pageType: "product",
    query: {
      slug: [freshfulRecordedProductSlug]
    },
    urlParams: {
      pageType: "product",
      prefix: null,
      base: null,
      identifier: null,
      isDefaultCategory: false,
      category: null,
      page: 1,
      isPaginated: false,
      filters: null,
      isFiltered: false,
      filtersCount: 0,
      filtersIndexable: false,
      orderBy: null,
      isOrdered: false,
      searchQuery: null,
      hasSearchQuery: false,
      indexable: false,
      isDefault: true
    },
    dehydratedQueryKeys: [["product", freshfulRecordedProductSlug], ["config"]]
  }
];

export const freshfulAdapterSearchInputFixture: FreshfulCatalogSearchInput = {
  query: "clatite fara gluten",
  filters: {
    brand: "Soligrano",
    maxPriceRon: 15
  }
};

export const freshfulProductReferenceFixture: FreshfulProductReference = {
  freshfulId: "100075626",
  slug: freshfulRecordedProductSlug,
  detailPath: `/p/${freshfulRecordedProductSlug}`,
  detailUrl: `https://www.freshful.ro/p/${freshfulRecordedProductSlug}`
};

export const freshfulSearchProductCandidateFixture: FreshfulSearchProductCandidate = {
  id: "freshful:100075626",
  freshfulId: "100075626",
  name: "Mix clatite din mei cu afine fara gluten 71g",
  price: 10.91,
  currency: "RON",
  unit: "71 g",
  category: "Unknown",
  tags: ["Fara gluten", "Vegan"],
  imageUrl: "https://cdn.freshful.ro/media/cache/sylius_shop_product_thumbnail/d5/2d/1ab0786dcfb6829b3b8b58fe5831.jpg",
  lastSeenAt: freshfulRecordedAt,
  availability: "out_of_stock",
  searchMetadata: {
    query: freshfulAdapterSearchInputFixture.query,
    rank: 0,
    matchedTerm: "Mix clatite"
  },
  productReference: freshfulProductReferenceFixture
};

export const freshfulNormalizedProductFixture: FreshfulProduct = {
  id: "freshful:100075626",
  freshfulId: "100075626",
  name: "Mix clatite din mei cu afine fara gluten 71g",
  price: 10.91,
  currency: "RON",
  unit: "71 g",
  category: "Unknown",
  tags: ["Fara gluten", "Vegan"],
  imageUrl: "https://cdn.freshful.ro/media/cache/sylius_shop_product_thumbnail/d5/2d/1ab0786dcfb6829b3b8b58fe5831.jpg",
  lastSeenAt: freshfulRecordedAt,
  availability: "out_of_stock"
};