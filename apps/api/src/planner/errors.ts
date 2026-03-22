import { ApiHttpError } from "../errors.js";

export function createPlannerServiceUnavailableError(): ApiHttpError {
  return new ApiHttpError({
    code: "planner.service_unavailable",
    message: "The meal planning service is not available.",
    statusCode: 503
  });
}

export function createPlannerProfileRequiredError(): ApiHttpError {
  return new ApiHttpError({
    code: "planner.profile_required",
    message: "A saved household profile is required before creating a meal plan.",
    statusCode: 409
  });
}

export function createPlannerPlanNotFoundError(): ApiHttpError {
  return new ApiHttpError({
    code: "planner.plan_not_found",
    message: "The requested meal plan was not found for the authenticated user.",
    statusCode: 404
  });
}

export function createPlannerUsageLimitError(message: string, cause?: unknown): ApiHttpError {
  return new ApiHttpError({
    code: "ai.usage_limit_exceeded",
    message,
    statusCode: 429,
    cause
  });
}

export function createPlannerUpstreamError(statusCode: number, retryable: boolean, cause?: unknown): ApiHttpError {
  return new ApiHttpError({
    code: "ai.upstream_error",
    message: "The meal planning AI service could not complete the request.",
    statusCode: 502,
    details: {
      upstreamStatusCode: statusCode,
      retryable
    },
    cause
  });
}

export function createInvalidGeneratedPlanError(
  reason: string,
  details: Record<string, unknown> = {},
  cause?: unknown
): ApiHttpError {
  return new ApiHttpError({
    code: "planner.invalid_generated_plan",
    message: "The generated meal plan response was invalid.",
    statusCode: 502,
    details: {
      reason,
      ...details
    },
    cause
  });
}

export function createInvalidRefinedPlanError(
  reason: string,
  details: Record<string, unknown> = {},
  cause?: unknown
): ApiHttpError {
  return new ApiHttpError({
    code: "planner.invalid_refined_plan",
    message: "The refined meal plan response was invalid.",
    statusCode: 502,
    details: {
      reason,
      ...details
    },
    cause
  });
}
