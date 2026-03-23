import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyServerOptions } from "fastify";
import { z } from "zod";

import { googleAuthRequestSchema, googleAuthResponseSchema } from "./auth/contracts.js";
import { createClaudeService, type ClaudeService } from "./ai/service.js";
import {
  createAuthServiceUnavailableError,
  createInvalidAppSessionError,
  createMissingAppSessionError
} from "./auth/errors.js";
import { createGoogleTokenVerifier, type GoogleTokenVerifier } from "./auth/google.js";
import { createAuthUserRepository, type AuthUserRepository } from "./auth/repository.js";
import {
  createAppSessionIssuer,
  createAppSessionVerifier,
  type AppSessionIssuer,
  type AppSessionVerifier,
  type VerifiedAppSession
} from "./auth/session.js";
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
import { createFreshfulCatalogClient, type FreshfulCatalogClient } from "./freshful/client.js";
import type { FreshfulCatalogAdapter } from "./freshful/contracts.js";
import { createFreshfulCatalogRepository, type FreshfulCatalogRepository } from "./freshful/repository.js";
import { createFreshfulCatalogService } from "./freshful/service.js";
import { onboardingChatRequestSchema, onboardingChatResponseSchema } from "./onboarding/contracts.js";
import { createOnboardingTranscriptRepository, type OnboardingTranscriptRepository } from "./onboarding/repository.js";
import { createOnboardingService, type OnboardingService } from "./onboarding/service.js";
import {
  createPlanRequestSchema,
  createPlanResponseSchema,
  planDetailResponseSchema,
  planParamsSchema,
  refinePlanRequestSchema
} from "./planner/contracts.js";
import { createPlannerRepository, type PlannerRepository } from "./planner/repository.js";
import { createPlannerService, type PlannerService } from "./planner/service.js";
import { profileResponseSchema, profileUpsertResponseSchema, profileWriteSchema } from "./profile/contracts.js";
import { createHouseholdProfileRepository, type HouseholdProfileRepository } from "./profile/repository.js";
import { createProfileService, type ProfileService } from "./profile/service.js";
import { shoppingListParamsSchema, shoppingListResponseSchema } from "./shopping/contracts.js";
import { createShoppingListRepository, type ShoppingListRepository } from "./shopping/repository.js";
import { createShoppingListService, type ShoppingListService } from "./shopping/service.js";

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
    sessionVerifier?: AppSessionVerifier;
    userRepository?: AuthUserRepository;
    sessionIssuer?: AppSessionIssuer;
  };
  profile?: {
    repository?: HouseholdProfileRepository;
    service?: ProfileService;
  };
  onboarding?: {
    repository?: OnboardingTranscriptRepository;
    service?: OnboardingService;
  };
  planner?: {
    repository?: PlannerRepository;
    service?: PlannerService;
  };
  freshful?: {
    client?: FreshfulCatalogClient;
    repository?: FreshfulCatalogRepository;
    service?: FreshfulCatalogAdapter;
  };
  shopping?: {
    repository?: ShoppingListRepository;
    service?: ShoppingListService;
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

function isProfileService(value: unknown): value is ProfileService {
  return typeof value === "object" && value !== null && "getProfile" in value && "upsertProfile" in value;
}

function isClaudeService(value: unknown): value is ClaudeService {
  return typeof value === "object" && value !== null && "createOnboardingReply" in value && "extractProfile" in value;
}

function isOnboardingService(value: unknown): value is OnboardingService {
  return typeof value === "object" && value !== null && "sendMessage" in value;
}

function isPlannerService(value: unknown): value is PlannerService {
  return (
    typeof value === "object" &&
    value !== null &&
    "createPlan" in value &&
    "getPlan" in value &&
    "refinePlan" in value
  );
}

function isFreshfulCatalogService(value: unknown): value is FreshfulCatalogAdapter {
  return typeof value === "object" && value !== null && "searchProducts" in value && "getProductDetails" in value;
}

function isShoppingListService(value: unknown): value is ShoppingListService {
  return typeof value === "object" && value !== null && "createDraftForPlan" in value && "getShoppingList" in value;
}

function extractBearerToken(authorizationHeader: string | string[] | undefined): string {
  const headerValue = Array.isArray(authorizationHeader) ? authorizationHeader[0] : authorizationHeader;

  if (!headerValue) {
    throw createMissingAppSessionError();
  }

  const [scheme, token, ...rest] = headerValue.trim().split(/\s+/u);

  if (scheme?.toLowerCase() !== "bearer" || !token || rest.length > 0) {
    throw createInvalidAppSessionError();
  }

  return token;
}

async function authenticateRequest(request: FastifyRequest, sessionVerifier: AppSessionVerifier): Promise<VerifiedAppSession> {
  return sessionVerifier.verify(extractBearerToken(request.headers.authorization));
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
  const aiImplementation = isClaudeService(options.services?.ai?.implementation)
    ? options.services.ai.implementation
    : config.anthropic
      ? createClaudeService({
          config: config.anthropic
        })
      : null;
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
  const appSessionVerifier =
    options.auth?.sessionVerifier ??
    createAppSessionVerifier({
      issuer: config.session.issuer,
      secret: config.session.secret
    });
  const profileService = isProfileService(options.profile?.service)
    ? options.profile.service
    : createProfileService({
        repository:
          options.profile?.repository ??
          createHouseholdProfileRepository(
            (ownedDatabase ??=
              createApiDatabase({
                databaseUrl: config.databaseUrl,
                maxConnections: config.appEnv === "production" ? 5 : 1
              })).db
          )
      });
  const onboardingService = isOnboardingService(options.onboarding?.service)
    ? options.onboarding.service
    : createOnboardingService({
        repository:
          options.onboarding?.repository ??
          createOnboardingTranscriptRepository(
            (ownedDatabase ??=
              createApiDatabase({
                databaseUrl: config.databaseUrl,
                maxConnections: config.appEnv === "production" ? 5 : 1
              })).db
          ),
        profileService,
        aiService: aiImplementation
      });
  const plannerService = isPlannerService(options.planner?.service)
    ? options.planner.service
    : isPlannerService(options.services?.planner?.implementation)
      ? options.services.planner.implementation
      : createPlannerService({
          repository:
            options.planner?.repository ??
            createPlannerRepository(
              (ownedDatabase ??=
                createApiDatabase({
                  databaseUrl: config.databaseUrl,
                  maxConnections: config.appEnv === "production" ? 5 : 1
                })).db
            ),
          profileService,
          aiService: aiImplementation
        });
  const freshfulRepository = options.freshful?.repository ??
    createFreshfulCatalogRepository(
      (ownedDatabase ??=
        createApiDatabase({
          databaseUrl: config.databaseUrl,
          maxConnections: config.appEnv === "production" ? 5 : 1
        })).db
    );
  const freshfulService = isFreshfulCatalogService(options.freshful?.service)
    ? options.freshful.service
    : isFreshfulCatalogService(options.services?.freshful?.implementation)
      ? options.services.freshful.implementation
      : createFreshfulCatalogService({
          repository: freshfulRepository,
          client: options.freshful?.client ?? createFreshfulCatalogClient({ config: config.freshful })
        });
  const shoppingService = isShoppingListService(options.shopping?.service)
    ? options.shopping.service
    : createShoppingListService({
        repository:
          options.shopping?.repository ??
          createShoppingListRepository(
            (ownedDatabase ??=
              createApiDatabase({
                databaseUrl: config.databaseUrl,
                maxConnections: config.appEnv === "production" ? 5 : 1
              })).db
          ),
        plannerService
      });
  const appContext: ApiAppContext = {
    config,
    services: createApiServices({
      ...options.services,
      ai: options.services?.ai ?? {
        name: "ai",
        status: aiImplementation ? "ready" : "pending",
        implementation: aiImplementation
      },
      auth: options.services?.auth ?? {
        name: "auth",
        status: "ready",
        implementation: authImplementation
      },
      planner: options.services?.planner ?? {
        name: "planner",
        status: aiImplementation ? "ready" : "pending",
        implementation: plannerService
      },
      freshful: options.services?.freshful ?? {
        name: "freshful",
        status: "ready",
        implementation: freshfulService
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

  app.get("/profile", async (request) => {
    const session = await authenticateRequest(request, appSessionVerifier);
    const profile = await profileService.getProfile(session.userId);

    return profileResponseSchema.parse({
      profile
    });
  });

  app.put("/profile", async (request) => {
    const session = await authenticateRequest(request, appSessionVerifier);
    const body = parseRequestPart(profileWriteSchema, request.body, "body");
    const profile = await profileService.upsertProfile(session.userId, body);

    return profileUpsertResponseSchema.parse({
      profile
    });
  });

  app.post("/ai/onboarding-chat", async (request) => {
    const session = await authenticateRequest(request, appSessionVerifier);
    const body = parseRequestPart(onboardingChatRequestSchema, request.body, "body");

    return onboardingChatResponseSchema.parse(await onboardingService.sendMessage(session.userId, body));
  });

  app.post("/plans", async (request) => {
    const session = await authenticateRequest(request, appSessionVerifier);
    const body = parseRequestPart(createPlanRequestSchema, request.body, "body");

    return createPlanResponseSchema.parse(await plannerService.createPlan(session.userId, body));
  });

  app.get("/plans/:id", async (request) => {
    const session = await authenticateRequest(request, appSessionVerifier);
    const params = parseRequestPart(planParamsSchema, request.params, "params");

    return planDetailResponseSchema.parse(await plannerService.getPlan(session.userId, params.id));
  });

  app.post("/plans/:id/refine", async (request) => {
    const session = await authenticateRequest(request, appSessionVerifier);
    const params = parseRequestPart(planParamsSchema, request.params, "params");
    const body = parseRequestPart(refinePlanRequestSchema, request.body, "body");

    return planDetailResponseSchema.parse(await plannerService.refinePlan(session.userId, params.id, body));
  });

  app.post("/plans/:id/shopping-list", async (request) => {
    const session = await authenticateRequest(request, appSessionVerifier);
    const params = parseRequestPart(planParamsSchema, request.params, "params");

    return shoppingListResponseSchema.parse(await shoppingService.createDraftForPlan(session.userId, params.id));
  });

  app.get("/shopping-lists/:id", async (request) => {
    const session = await authenticateRequest(request, appSessionVerifier);
    const params = parseRequestPart(shoppingListParamsSchema, request.params, "params");

    return shoppingListResponseSchema.parse(await shoppingService.getShoppingList(session.userId, params.id));
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
