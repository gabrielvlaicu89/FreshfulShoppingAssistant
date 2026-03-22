import { ApiHttpError } from "../errors.js";

export function createInvalidGoogleTokenError(cause?: unknown): ApiHttpError {
  return new ApiHttpError({
    code: "auth.invalid_google_token",
    message: "The Google identity token is invalid.",
    statusCode: 401,
    cause
  });
}

export function createExpiredGoogleTokenError(cause?: unknown): ApiHttpError {
  return new ApiHttpError({
    code: "auth.expired_google_token",
    message: "The Google identity token has expired.",
    statusCode: 401,
    cause
  });
}

export function createAuthServiceUnavailableError(): ApiHttpError {
  return new ApiHttpError({
    code: "auth.service_unavailable",
    message: "The authentication service is not available.",
    statusCode: 503
  });
}