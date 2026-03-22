import { errorPayloadSchema, type ErrorIssue, type ErrorPayload } from "@freshful/contracts";
import { z } from "zod";

export interface ApiHttpErrorOptions {
  code: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
  issues?: ErrorIssue[];
  cause?: unknown;
}

export class ApiHttpError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;
  readonly issues?: ErrorIssue[];

  constructor(options: ApiHttpErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "ApiHttpError";
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.details = options.details;
    this.issues = options.issues;
  }

  toPayload(requestId?: string): ErrorPayload {
    return errorPayloadSchema.parse({
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      requestId,
      details: this.details,
      issues: this.issues
    });
  }
}

export function isApiHttpError(error: unknown): error is ApiHttpError {
  return error instanceof ApiHttpError;
}

export function createRequestValidationError(error: z.ZodError, requestPart: string): ApiHttpError {
  return new ApiHttpError({
    code: "request.validation_failed",
    message: "Request validation failed.",
    statusCode: 400,
    details: {
      requestPart
    },
    issues: error.issues.map((issue) => ({
      path: [requestPart, ...issue.path.map((segment) => String(segment))],
      message: issue.message
    }))
  });
}

export function createNotFoundPayload(url: string, requestId?: string): ErrorPayload {
  return errorPayloadSchema.parse({
    code: "http.not_found",
    message: `Route '${url}' was not found.`,
    statusCode: 404,
    requestId,
    details: {
      url
    }
  });
}

export function createUnexpectedErrorPayload(requestId?: string): ErrorPayload {
  return errorPayloadSchema.parse({
    code: "http.internal_error",
    message: "An unexpected server error occurred.",
    statusCode: 500,
    requestId
  });
}
