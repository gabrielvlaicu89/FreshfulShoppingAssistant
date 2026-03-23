export class FreshfulCatalogError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "FreshfulCatalogError";
    this.code = code;
  }
}

export class FreshfulCatalogUnavailableError extends FreshfulCatalogError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("freshful.catalog_unavailable", message, options);
    this.name = "FreshfulCatalogUnavailableError";
  }
}

export class FreshfulCatalogNormalizationError extends FreshfulCatalogError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("freshful.catalog_normalization_failed", message, options);
    this.name = "FreshfulCatalogNormalizationError";
  }
}