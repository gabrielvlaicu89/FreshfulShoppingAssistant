export class FreshfulCatalogError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "FreshfulCatalogError";
    this.code = code;
  }
}

export class FreshfulCatalogUnavailableError extends FreshfulCatalogError {
  readonly statusCode?: number;
  readonly retryable: boolean;

  constructor(message: string, options?: { cause?: unknown; statusCode?: number; retryable?: boolean }) {
    super("freshful.catalog_unavailable", message, options);
    this.name = "FreshfulCatalogUnavailableError";
    this.statusCode = options?.statusCode;
    this.retryable = options?.retryable ?? Boolean(options?.statusCode === 429 || (options?.statusCode ?? 0) >= 500);
  }
}

export class FreshfulCatalogNormalizationError extends FreshfulCatalogError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("freshful.catalog_normalization_failed", message, options);
    this.name = "FreshfulCatalogNormalizationError";
  }
}