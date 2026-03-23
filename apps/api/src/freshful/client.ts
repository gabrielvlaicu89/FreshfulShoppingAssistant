import type { ApiConfig } from "../config.js";
import { getRequestLogger } from "../request-context.js";
import type { FreshfulCatalogSearchInput, FreshfulProductReference } from "./contracts.js";
import { FreshfulCatalogUnavailableError } from "./errors.js";

export interface FreshfulCatalogClient {
  search(input: FreshfulCatalogSearchInput): Promise<unknown>;
  getProductDetail(reference: FreshfulProductReference): Promise<unknown>;
}

export interface CreateFreshfulCatalogClientOptions {
  config: ApiConfig["freshful"];
  fetchImplementation?: typeof fetch;
  now?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
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
      throw new FreshfulCatalogUnavailableError(`Freshful request failed with status ${response.status}.`, {
        statusCode: response.status,
        retryable: response.status === 429 || response.status >= 500
      });
    }

    const contentType = response.headers.get("content-type") ?? "";
    const bodyText = await response.text();

    if (contentType.includes("application/json")) {
      try {
        return JSON.parse(bodyText) as unknown;
      } catch (error) {
        throw new FreshfulCatalogUnavailableError("Freshful returned invalid JSON.", {
          cause: error,
          retryable: false
        });
      }
    }

    return bodyText;
  } catch (error) {
    if (error instanceof FreshfulCatalogUnavailableError) {
      throw error;
    }

    const isAbortError = error instanceof Error && error.name === "AbortError";

    throw new FreshfulCatalogUnavailableError(
      isAbortError ? "Freshful catalog request timed out." : "Freshful catalog request failed.",
      {
        cause: error,
        statusCode: isAbortError ? 504 : undefined,
        retryable: true
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function createFreshfulCatalogClient(options: CreateFreshfulCatalogClientOptions): FreshfulCatalogClient {
  const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  const safeguards = {
    minIntervalMs: options.config.safeguards?.minIntervalMs ?? 250,
    maxRetries: options.config.safeguards?.maxRetries ?? 2,
    retryBaseDelayMs: options.config.safeguards?.retryBaseDelayMs ?? 300
  };
  let nextPermittedRequestAtMs = 0;
  let activeRequestChain = Promise.resolve();

  if (typeof fetchImplementation !== "function") {
    throw new Error("Global fetch is unavailable. Provide fetchImplementation to createFreshfulCatalogClient().");
  }

  async function waitForTurn(operation: "search" | "product-detail", targetUrl: URL) {
    const previousRequest = activeRequestChain;
    let releaseCurrentRequest: (() => void) | undefined;

    activeRequestChain = new Promise<void>((resolve) => {
      releaseCurrentRequest = resolve;
    });

    await previousRequest;

    const waitMs = Math.max(0, nextPermittedRequestAtMs - now());

    if (waitMs > 0) {
      getRequestLogger({ provider: "freshful", operation })?.info?.(
        {
          targetUrl: targetUrl.toString(),
          waitMs
        },
        "Throttling Freshful request to reduce burstiness."
      );
      await sleep(waitMs);
    }

    nextPermittedRequestAtMs = now() + safeguards.minIntervalMs;

    return () => {
      releaseCurrentRequest?.();
    };
  }

  async function executeWithSafeguards(operation: "search" | "product-detail", url: URL): Promise<unknown> {
    const releaseTurn = await waitForTurn(operation, url);

    try {
      for (let attempt = 0; attempt <= safeguards.maxRetries; attempt += 1) {
        try {
          return await fetchCatalogSurface(fetchImplementation, url, options.config.requestTimeoutMs);
        } catch (error) {
          const isRetryable = error instanceof FreshfulCatalogUnavailableError && error.retryable;

          if (!isRetryable || attempt >= safeguards.maxRetries) {
            throw error;
          }

          const delayMs = safeguards.retryBaseDelayMs * 2 ** attempt;

          getRequestLogger({ provider: "freshful", operation })?.warn?.(
            {
              err: error,
              attempt: attempt + 1,
              delayMs,
              targetUrl: url.toString(),
              statusCode: error.statusCode
            },
            "Retrying Freshful request after a retryable upstream failure."
          );
          await sleep(delayMs);
        }
      }

      throw new FreshfulCatalogUnavailableError("Freshful request retries were exhausted.");
    } finally {
      releaseTurn();
    }
  }

  return {
    async search(input) {
      return executeWithSafeguards("search", buildSearchUrl(options.config, input));
    },

    async getProductDetail(reference) {
      const url = new URL(reference.detailPath, options.config.baseUrl);

      return executeWithSafeguards("product-detail", url);
    }
  };
}