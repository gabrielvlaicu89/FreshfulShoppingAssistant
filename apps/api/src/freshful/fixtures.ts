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

export const freshfulRecordedSearchInputFixture: FreshfulCatalogSearchInput = {
  query: "lapte"
};

export const freshfulRecordedSearchResponseFixture = {
  page: 1,
  itemsPerPage: 30,
  pages: 3,
  total: 64,
  items: [
    {
      sponsored: null,
      scoreExplained: null,
      code: "100003632",
      variantCode: "100003632",
      name: "Lapte de la vaca 3.8-4.1% grasime, 1l",
      slug: "100003632-laptaria-cu-caimac-lapte-de-la-vaca-3-8-4-1-grasime-1l",
      unitPriceLabel: "10,99 Lei/l",
      brand: "Laptaria cu caimac",
      brandCode: "1",
      brandFilterCode: "laptaria-cu-caimac-b1",
      sku: "100003632",
      price: 10.99,
      originalPrice: 12.69,
      currencyCode: "RON",
      currency: "Lei",
      image: {
        thumbnail: {
          default: "https://cdn.freshful.ro/media/cache/sylius_shop_product_thumbnail/71/1e/7dddeae4da51a8a85dfd2c876a21.jpg"
        },
        large: {
          default: "https://cdn.freshful.ro/media/cache/freshful_large/71/1e/7dddeae4da51a8a85dfd2c876a21.jpg"
        }
      },
      tags: [
        {
          type: "MadeInRomania",
          text: "Made In Romania",
          icon: "https://cdn.freshful.ro/assets/product_tags/made_in_romania.svg",
          iconPng: "https://cdn.freshful.ro/assets/product_tags/made_in_romania.png",
          backgroundColor: "#EDF2FD",
          textColor: "#1653CA"
        }
      ],
      isAvailable: true,
      maxAvailableQuantity: 100,
      maxAllowedQuantity: 100,
      breadcrumbs: [
        {
          code: "4",
          name: "Lactate & oua",
          slug: "4-lactate-branzeturi-si-oua"
        },
        {
          code: "401",
          name: "Lapte, smantana si branza proaspata",
          slug: "401-lapte-smantana-si-branza-proaspata"
        },
        {
          code: "40101",
          name: "Lapte proaspat",
          slug: "40101-lapte-proaspat"
        },
        {
          code: "100003632",
          name: "Lapte de la vaca 3.8-4.1% grasime, 1l",
          slug: "100003632-laptaria-cu-caimac-lapte-de-la-vaca-3-8-4-1-grasime-1l"
        }
      ]
    },
    {
      sponsored: null,
      scoreExplained: null,
      code: "100138896",
      variantCode: "100138896",
      name: "Lapte fara lactoza, 3.5% grasime, 1l",
      slug: "100138896-napolact-lapte-fara-lactoza-3-5-grasime-1l",
      unitPriceLabel: "9,99 Lei/l",
      brand: "Napolact",
      brandCode: "79",
      brandFilterCode: "napolact-b77",
      sku: "100138896",
      price: 9.99,
      originalPrice: 12.99,
      currencyCode: "RON",
      currency: "Lei",
      image: {
        thumbnail: {
          default: "https://cdn.freshful.ro/media/cache/sylius_shop_product_thumbnail/42/14/f0bee6bf3bc65280a0c7a0c0690d.jpg"
        },
        large: {
          default: "https://cdn.freshful.ro/media/cache/freshful_large/42/14/f0bee6bf3bc65280a0c7a0c0690d.jpg"
        }
      },
      tags: [
        {
          type: "LactoseFree",
          text: "Fara lactoza",
          icon: "https://cdn.freshful.ro/assets/product_tags/fara_lactoza.svg",
          iconPng: "https://cdn.freshful.ro/assets/product_tags/fara_lactoza.png",
          backgroundColor: "#E9F7FB",
          textColor: "#25A6D0"
        },
        {
          type: "MadeInRomania",
          text: "Made In Romania",
          icon: "https://cdn.freshful.ro/assets/product_tags/made_in_romania.svg",
          iconPng: "https://cdn.freshful.ro/assets/product_tags/made_in_romania.png",
          backgroundColor: "#EDF2FD",
          textColor: "#1653CA"
        }
      ],
      isAvailable: true,
      maxAvailableQuantity: 100,
      maxAllowedQuantity: 100,
      breadcrumbs: [
        {
          code: "4",
          name: "Lactate & oua",
          slug: "4-lactate-branzeturi-si-oua"
        },
        {
          code: "401",
          name: "Lapte, smantana si branza proaspata",
          slug: "401-lapte-smantana-si-branza-proaspata"
        },
        {
          code: "40101",
          name: "Lapte proaspat",
          slug: "40101-lapte-proaspat"
        },
        {
          code: "100138896",
          name: "Lapte fara lactoza, 3.5% grasime, 1l",
          slug: "100138896-napolact-lapte-fara-lactoza-3-5-grasime-1l"
        }
      ]
    }
  ]
} as const;

export const freshfulRecordedSearchProductReferenceFixture: FreshfulProductReference = {
  freshfulId: "100003632",
  slug: "100003632-laptaria-cu-caimac-lapte-de-la-vaca-3-8-4-1-grasime-1l",
  detailPath: "/p/100003632-laptaria-cu-caimac-lapte-de-la-vaca-3-8-4-1-grasime-1l",
  detailUrl: "https://www.freshful.ro/p/100003632-laptaria-cu-caimac-lapte-de-la-vaca-3-8-4-1-grasime-1l"
};

export const freshfulRecordedSearchProductCandidateFixture: FreshfulSearchProductCandidate = {
  id: "freshful:100003632:100003632-laptaria-cu-caimac-lapte-de-la-vaca-3-8-4-1-grasime-1l",
  freshfulId: "100003632",
  name: "Lapte de la vaca 3.8-4.1% grasime, 1l",
  price: 10.99,
  currency: "RON",
  unit: "1l",
  category: "Lapte proaspat",
  tags: ["Made In Romania"],
  imageUrl: "https://cdn.freshful.ro/media/cache/sylius_shop_product_thumbnail/71/1e/7dddeae4da51a8a85dfd2c876a21.jpg",
  lastSeenAt: freshfulRecordedAt,
  availability: "in_stock",
  searchMetadata: {
    query: freshfulRecordedSearchInputFixture.query,
    rank: 0,
    matchedTerm: "lapte"
  },
  productReference: freshfulRecordedSearchProductReferenceFixture
};

export const freshfulProductReferenceFixture: FreshfulProductReference = {
  freshfulId: "100075626",
  slug: freshfulRecordedProductSlug,
  detailPath: `/p/${freshfulRecordedProductSlug}`,
  detailUrl: `https://www.freshful.ro/p/${freshfulRecordedProductSlug}`
};

export const freshfulSearchProductCandidateFixture: FreshfulSearchProductCandidate = {
  id: `freshful:100075626:${freshfulRecordedProductSlug}`,
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
  id: `freshful:100075626:${freshfulRecordedProductSlug}`,
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