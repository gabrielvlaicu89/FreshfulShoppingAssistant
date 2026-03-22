export class ClaudeUsageLimitError extends Error {
  readonly code = "ai.usage_limit_exceeded";

  constructor(message: string) {
    super(message);
    this.name = "ClaudeUsageLimitError";
  }
}

export class ClaudeUpstreamError extends Error {
  readonly code = "ai.upstream_error";
  readonly statusCode: number;
  readonly retryable: boolean;

  constructor(message: string, statusCode: number, retryable = statusCode >= 500 || statusCode === 429) {
    super(message);
    this.name = "ClaudeUpstreamError";
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}