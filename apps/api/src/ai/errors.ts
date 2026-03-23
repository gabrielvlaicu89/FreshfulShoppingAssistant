export class ClaudeUsageLimitError extends Error {
  readonly code = "ai.usage_limit_exceeded";

  constructor(message: string) {
    super(message);
    this.name = "ClaudeUsageLimitError";
  }
}

export class ClaudeBudgetLimitError extends ClaudeUsageLimitError {
  readonly scope: "user" | "global";
  readonly spentUsd: number;
  readonly limitUsd: number;
  readonly windowMs: number;

  constructor(message: string, scope: "user" | "global", spentUsd: number, limitUsd: number, windowMs: number) {
    super(message);
    this.name = "ClaudeBudgetLimitError";
    this.scope = scope;
    this.spentUsd = spentUsd;
    this.limitUsd = limitUsd;
    this.windowMs = windowMs;
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