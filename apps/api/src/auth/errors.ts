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

export function createMissingAppSessionError(): ApiHttpError {
  return new ApiHttpError({
    code: "auth.missing_app_session",
    message: "A valid app session bearer token is required.",
    statusCode: 401
  });
}

export function createInvalidAppSessionError(cause?: unknown): ApiHttpError {
  return new ApiHttpError({
    code: "auth.invalid_app_session",
    message: "The app session bearer token is invalid.",
    statusCode: 401,
    cause
  });
}

export function createExpiredAppSessionError(cause?: unknown): ApiHttpError {
  return new ApiHttpError({
    code: "auth.expired_app_session",
    message: "The app session bearer token has expired.",
    statusCode: 401,
    cause
  });
}