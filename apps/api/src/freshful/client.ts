import type { ApiConfig } from "../config.js";
import type { FreshfulCatalogSearchInput, FreshfulProductReference } from "./contracts.js";
import { FreshfulCatalogUnavailableError } from "./errors.js";

export interface FreshfulCatalogClient {
  search(input: FreshfulCatalogSearchInput): Promise<unknown>;
  getProductDetail(reference: FreshfulProductReference): Promise<unknown>;
}

export interface CreateFreshfulCatalogClientOptions {
  config: ApiConfig["freshful"];
  fetchImplementation?: typeof fetch;
}

const DEFAULT_SEARCH_PAGE = 1;
const DEFAULT_SEARCH_ITEMS_PER_PAGE = 30;

function buildSearchUrl(config: ApiConfig["freshful"], input: FreshfulCatalogSearchInput): URL {
  const normalizedSearchPath = config.searchPath.endsWith("/") ? config.searchPath.slice(0, -1) : config.searchPath;
  const url = new URL(`${normalizedSearchPath}/${encodeURIComponent(input.query.trim())}`, config.baseUrl);

  url.searchParams.set("page", String(DEFAULT_SEARCH_PAGE));
  url.searchParams.set("itemsPerPage", String(DEFAULT_SEARCH_ITEMS_PER_PAGE));

  return url;
}

async function fetchCatalogSurface(
  fetchImplementation: typeof fetch,
  url: URL,
  timeoutMs: number
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImplementation(url, {
      headers: {
        accept: "application/json, text/html;q=0.9"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new FreshfulCatalogUnavailableError(`Freshful request failed with status ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const bodyText = await response.text();

    if (contentType.includes("application/json")) {
      try {
        return JSON.parse(bodyText) as unknown;
      } catch (error) {
        throw new FreshfulCatalogUnavailableError("Freshful returned invalid JSON.", { cause: error });
      }
    }

    return bodyText;
  } catch (error) {
    if (error instanceof FreshfulCatalogUnavailableError) {
      throw error;
    }

    throw new FreshfulCatalogUnavailableError("Freshful catalog request failed.", { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

export function createFreshfulCatalogClient(options: CreateFreshfulCatalogClientOptions): FreshfulCatalogClient {
  const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;

  if (typeof fetchImplementation !== "function") {
    throw new Error("Global fetch is unavailable. Provide fetchImplementation to createFreshfulCatalogClient().");
  }

  return {
    async search(input) {
      return fetchCatalogSurface(fetchImplementation, buildSearchUrl(options.config, input), options.config.requestTimeoutMs);
    },

    async getProductDetail(reference) {
      const url = new URL(reference.detailPath, options.config.baseUrl);

      return fetchCatalogSurface(fetchImplementation, url, options.config.requestTimeoutMs);
    }
  };
}