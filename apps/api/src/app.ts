import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { z } from "zod";

import { googleAuthRequestSchema, googleAuthResponseSchema } from "./auth/contracts.js";
import { createAuthServiceUnavailableError } from "./auth/errors.js";
import { createGoogleTokenVerifier, type GoogleTokenVerifier } from "./auth/google.js";
import { createAuthUserRepository, type AuthUserRepository } from "./auth/repository.js";
import { createAppSessionIssuer, type AppSessionIssuer } from "./auth/session.js";
import { createAuthService, type AuthService } from "./auth/service.js";
import { type ApiConfig, getApiConfig } from "./config.js";
import { closeApiDatabase, createApiDatabase } from "./db/client.js";
import {
  createNotFoundPayload,
  createRequestValidationError,
  createUnexpectedErrorPayload,
  isApiHttpError
} from "./errors.js";
import {
  apiServiceStatusValues,
  createApiServices,
  summarizeServiceStates,
  type ApiServices
} from "./services.js";

const apiServiceStateSchema = z
  .object({
    status: z.enum(apiServiceStatusValues),
    name: z.string().trim().min(1)
  })
  .strict();

const healthQuerySchema = z
  .object({
    details: z.enum(["summary", "full"]).optional()
  })
  .strict();

const healthResponseSchema = z
  .object({
    status: z.literal("ok"),
    service: z.literal("@freshful/api"),
    environment: z.enum(["development", "test", "production"]),
    detailLevel: z.enum(["summary", "full"]),
    timestamp: z.string().datetime(),
    uptimeSeconds: z.number().nonnegative(),
    services: z
      .object({
        auth: apiServiceStateSchema,
        ai: apiServiceStateSchema,
        planner: apiServiceStateSchema,
        freshful: apiServiceStateSchema
      })
      .strict()
  })
  .strict();

export interface ApiAppContext {
  config: ApiConfig;
  services: ApiServices;
  startedAt: string;
  startedAtEpochMs: number;
}

export interface CreateApiAppOptions {
  config?: ApiConfig;
  services?: Partial<ApiServices>;
  logger?: FastifyServerOptions["logger"];
  auth?: {
    verifier?: GoogleTokenVerifier;
    userRepository?: AuthUserRepository;
    sessionIssuer?: AppSessionIssuer;
  };
}

declare module "fastify" {
  interface FastifyInstance {
    appContext: ApiAppContext;
  }

  interface FastifyRequest {
    requestStartedAt?: bigint;
  }
}

function parseRequestPart<TOutput>(schema: z.ZodType<TOutput>, value: unknown, requestPart: string): TOutput {
  const result = schema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  throw createRequestValidationError(result.error, requestPart);
}

function createHealthResponse(context: ApiAppContext, detailLevel: "summary" | "full") {
  return healthResponseSchema.parse({
    status: "ok",
    service: "@freshful/api",
    environment: context.config.appEnv,
    detailLevel,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Number(((Date.now() - context.startedAtEpochMs) / 1000).toFixed(3)),
    services: {
      auth: {
        name: context.services.auth.name,
        status: context.services.auth.status
      },
      ai: {
        name: context.services.ai.name,
        status: context.services.ai.status
      },
      planner: {
        name: context.services.planner.name,
        status: context.services.planner.status
      },
      freshful: {
        name: context.services.freshful.name,
        status: context.services.freshful.status
      }
    }
  });
}

function isAuthService(value: unknown): value is AuthService {
  return typeof value === "object" && value !== null && "signInWithGoogle" in value;
}

export function createApiApp(options: CreateApiAppOptions = {}): FastifyInstance {
  const config = options.config ?? getApiConfig();
  const app = Fastify({
    logger:
      options.logger ??
      (config.appEnv === "test"
        ? false
        : {
            level: config.appEnv === "development" ? "info" : "warn"
          })
  });
  let ownedDatabase: ReturnType<typeof createApiDatabase> | undefined;
  const authImplementation = isAuthService(options.services?.auth?.implementation)
    ? options.services.auth.implementation
    : createAuthService({
        verifier: options.auth?.verifier ?? createGoogleTokenVerifier({ webClientId: config.google.webClientId }),
        userRepository:
          options.auth?.userRepository ??
          createAuthUserRepository(
            (ownedDatabase ??=
              createApiDatabase({
                databaseUrl: config.databaseUrl,
                maxConnections: config.appEnv === "production" ? 5 : 1
              })).db
          ),
        sessionIssuer:
          options.auth?.sessionIssuer ??
          createAppSessionIssuer({
            issuer: config.session.issuer,
            secret: config.session.secret,
            ttlSeconds: config.session.ttlSeconds
          })
      });
  const appContext: ApiAppContext = {
    config,
    services: createApiServices({
      ...options.services,
      auth: options.services?.auth ?? {
        name: "auth",
        status: "ready",
        implementation: authImplementation
      }
    }),
    startedAt: new Date().toISOString(),
    startedAtEpochMs: Date.now()
  };

  app.decorate("appContext", appContext);

  app.addHook("onRequest", async (request) => {
    request.requestStartedAt = process.hrtime.bigint();
    request.log.info(
      {
        requestId: request.id,
        method: request.method,
        url: request.url
      },
      "Incoming request."
    );
  });

  app.addHook("onResponse", async (request, reply) => {
    const durationMs = request.requestStartedAt
      ? Number(process.hrtime.bigint() - request.requestStartedAt) / 1_000_000
      : undefined;

    request.log.info(
      {
        requestId: request.id,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        durationMs: durationMs ? Number(durationMs.toFixed(3)) : undefined
      },
      "Request completed."
    );
  });

  app.addHook("onReady", async () => {
    app.log.info(
      {
        appEnv: appContext.config.appEnv,
        port: appContext.config.port,
        services: summarizeServiceStates(appContext.services)
      },
      "API HTTP foundation is ready."
    );
  });

  app.addHook("onClose", async () => {
    if (ownedDatabase) {
      await closeApiDatabase(ownedDatabase);
    }

    app.log.info("API HTTP foundation closed.");
  });

  app.post("/auth/google", async (request) => {
    const body = parseRequestPart(googleAuthRequestSchema, request.body, "body");
    const authService = appContext.services.auth.implementation;

    if (!isAuthService(authService)) {
      throw createAuthServiceUnavailableError();
    }

    return googleAuthResponseSchema.parse(await authService.signInWithGoogle(body));
  });

  app.get("/health", async (request) => {
    const query = parseRequestPart(healthQuerySchema, request.query, "query");
    const detailLevel: "summary" | "full" = query.details ?? "summary";

    return createHealthResponse(appContext, detailLevel);
  });

  app.setNotFoundHandler((request, reply) => {
    const payload = createNotFoundPayload(request.url, request.id);

    request.log.warn(
      {
        requestId: request.id,
        url: request.url
      },
      "Request matched no route."
    );

    void reply.code(payload.statusCode).send(payload);
  });

  app.setErrorHandler((error, request, reply) => {
    const payload = isApiHttpError(error) ? error.toPayload(request.id) : createUnexpectedErrorPayload(request.id);

    request.log.error(
      {
        err: error,
        requestId: request.id,
        code: payload.code,
        statusCode: payload.statusCode
      },
      "Request failed."
    );

    void reply.code(payload.statusCode).send(payload);
  });

  return app;
}

export interface StartApiServerOptions extends CreateApiAppOptions {
  host?: string;
}

export async function startApiServer(options: StartApiServerOptions = {}): Promise<FastifyInstance> {
  const app = createApiApp(options);

  try {
    await app.listen({
      host: options.host ?? "0.0.0.0",
      port: app.appContext.config.port
    });

    app.log.info(
      {
        host: options.host ?? "0.0.0.0",
        port: app.appContext.config.port
      },
      "API server listening."
    );

    return app;
  } catch (error) {
    await app.close().catch(() => undefined);
    throw error;
  }
}
