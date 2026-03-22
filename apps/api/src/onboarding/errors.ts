import { ApiHttpError } from "../errors.js";

export function createOnboardingServiceUnavailableError(): ApiHttpError {
  return new ApiHttpError({
    code: "ai.service_unavailable",
    message: "The onboarding AI service is not available.",
    statusCode: 503
  });
}

export function createOnboardingUsageLimitError(message: string, cause?: unknown): ApiHttpError {
  return new ApiHttpError({
    code: "ai.usage_limit_exceeded",
    message,
    statusCode: 429,
    cause
  });
}

export function createOnboardingUpstreamError(
  statusCode: number,
  retryable: boolean,
  cause?: unknown
): ApiHttpError {
  return new ApiHttpError({
    code: "ai.upstream_error",
    message: "The onboarding AI service could not complete the request.",
    statusCode: 502,
    details: {
      upstreamStatusCode: statusCode,
      retryable
    },
    cause
  });
}