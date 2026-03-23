import { workspaceCatalog } from "@freshful/contracts";
import { pathToFileURL } from "node:url";

export { createApiApp, startApiServer, type ApiAppContext, type CreateApiAppOptions, type StartApiServerOptions } from "./app.js";
export { createAnthropicClient, type ClaudeClient, type ClaudeClientRequest, type ClaudeClientResponse } from "./ai/client.js";
export { createAiUsageMeter, type AiBudgetConfig, type AiBudgetSnapshot, type AiUsageMeter, type AiUsageRecord } from "./ai/budget.js";
export { ClaudeBudgetLimitError, ClaudeUpstreamError, ClaudeUsageLimitError } from "./ai/errors.js";
export { parseStructuredResponse, type StructuredParseResult } from "./ai/parser.js";
export {
  assembleMealPlanPrompt,
  assembleMealPlanRefinementPrompt,
  assembleOnboardingReplyPrompt,
  assembleProfileExtractionPrompt,
  assembleShoppingProductSelectionPrompt,
  type ClaudePromptLimits,
  type MealPlanPromptInput,
  type MealPlanRefinementPromptInput,
  type OnboardingReplyPromptInput,
  type ProfileExtractionPromptInput,
  type ShoppingProductSelectionPromptInput,
  type PromptEnvelope
} from "./ai/prompts.js";
export {
  claudeModelTierValues,
  claudeTaskValues,
  selectClaudeModel,
  type ClaudeModelTier,
  type ClaudeRouteDecision,
  type ClaudeRouteInput,
  type ClaudeRoutingConfig,
  type ClaudeTask
} from "./ai/routing.js";
export {
  createClaudeService,
  type ClaudeService,
  type ClaudeServiceUsage,
  type CreateClaudeServiceOptions,
  type MealPlanGenerationRequest,
  type MealPlanGenerationResponse,
  type MealPlanRefinementRequest,
  type MealPlanRefinementResponse,
  type OnboardingReplyRequest,
  type OnboardingReplyResponse,
  type ProfileExtractionRequest,
  type ProfileExtractionResponse,
  type ShoppingProductSelectionRequest,
  type ShoppingProductSelectionResponse
} from "./ai/service.js";
export {
  googleAuthRequestSchema,
  googleAuthResponseSchema,
  type AppSession,
  type AuthenticatedUser,
  type GoogleAuthRequest,
  type GoogleAuthResponse
} from "./auth/contracts.js";
export {
  createAuthServiceUnavailableError,
  createExpiredAppSessionError,
  createExpiredGoogleTokenError,
  createInvalidAppSessionError,
  createMissingAppSessionError,
  createInvalidGoogleTokenError
} from "./auth/errors.js";
export { createGoogleTokenVerifier, type GoogleIdentity, type GoogleTokenVerifier } from "./auth/google.js";
export { createAuthUserRepository, type AuthDatabase, type AuthUserRepository } from "./auth/repository.js";
export {
  createAppSessionIssuer,
  createAppSessionVerifier,
  type AppSessionIssuer,
  type AppSessionVerifier,
  type VerifiedAppSession
} from "./auth/session.js";
export { createAuthService, type AuthService } from "./auth/service.js";
export { closeApiDatabase, createApiDatabase } from "./db/client.js";
export { ApiHttpError } from "./errors.js";
export { getApiConfig, resolveApiWorkspacePath } from "./config.js";
export type { ApiConfig } from "./config.js";
export {
  getRequestContext,
  getRequestLogger,
  runWithRequestContext,
  setRequestContextUserId,
  type RequestContextLogger,
  type RequestContextValue,
  type RunWithRequestContextOptions
} from "./request-context.js";
export {
  createFreshfulCatalogClient,
  type CreateFreshfulCatalogClientOptions,
  type FreshfulCatalogClient
} from "./freshful/client.js";
export {
  freshfulCatalogCacheMetadataSchema,
  freshfulCatalogProductDetailResultSchema,
  freshfulCatalogSearchInputSchema,
  freshfulCatalogSearchResultSchema,
  freshfulProductReferenceSchema,
  freshfulRecordedPageObservationSchema,
  freshfulRecordedRequestSchema,
  freshfulSearchProductCandidateSchema,
  type FreshfulCatalogAdapter,
  type FreshfulCatalogCacheMetadata,
  type FreshfulCatalogProductDetailResult,
  type FreshfulCatalogSearchInput,
  type FreshfulCatalogSearchResult,
  type FreshfulProductReference,
  type FreshfulRecordedPageObservation,
  type FreshfulRecordedRequest,
  type FreshfulSearchProductCandidate
} from "./freshful/contracts.js";
export {
  FreshfulCatalogError,
  FreshfulCatalogNormalizationError,
  FreshfulCatalogUnavailableError
} from "./freshful/errors.js";
export {
  createFreshfulCatalogRepository,
  type CreateFreshfulCatalogRepositoryOptions,
  type FreshfulCatalogRepository,
  type FreshfulDatabase,
  type PersistedProductEntry
} from "./freshful/repository.js";
export {
  DETAIL_CACHE_TTL_MS,
  SEARCH_CACHE_TTL_MS,
  STALE_FALLBACK_TTL_MS,
  evaluateFreshfulCatalogRecency,
  freshfulCatalogRecencySchema,
  freshfulCatalogRecencyPolicySchema,
  freshfulCatalogRecencyStatusSchema,
  type FreshfulCatalogRecency,
  type FreshfulCatalogRecencyPolicy,
  type FreshfulCatalogRecencyStatus
} from "./freshful/policy.js";
export {
  createFreshfulCatalogRefreshRunner,
  freshfulCatalogRefreshModeSchema,
  freshfulCatalogRefreshResultSchema,
  type CreateFreshfulCatalogRefreshRunnerOptions,
  type FreshfulCatalogRefreshFailure,
  type FreshfulCatalogRefreshMode,
  type FreshfulCatalogRefreshResult,
  type FreshfulCatalogRefreshRunOptions,
  type FreshfulCatalogRefreshRunner
} from "./freshful/refresh.js";
export {
  buildFreshfulSearchCacheKey,
  createFreshfulCatalogService,
  type CreateFreshfulCatalogServiceOptions,
  type FreshfulCatalogService
} from "./freshful/service.js";
export { getDatabaseConfig } from "./db/config.js";
export { databaseTables, sensitiveTableColumns } from "./db/schema.js";
export {
  onboardingChatRequestSchema,
  onboardingChatResponseSchema,
  onboardingStructuredProfileSchema,
  type OnboardingChatRequest,
  type OnboardingChatResponse,
  type OnboardingStructuredProfile
} from "./onboarding/contracts.js";
export {
  createOnboardingServiceUnavailableError,
  createOnboardingUpstreamError,
  createOnboardingUsageLimitError
} from "./onboarding/errors.js";
export {
  createOnboardingTranscriptRepository,
  type CreateOnboardingTranscriptRepositoryOptions,
  type OnboardingDatabase,
  type OnboardingTranscriptRepository
} from "./onboarding/repository.js";
export { createOnboardingService, type CreateOnboardingServiceOptions, type OnboardingService } from "./onboarding/service.js";
export {
  createPlanRequestSchema,
  createPlanResponseSchema,
  generatedMealPlanSchema,
  planDetailResponseSchema,
  planParamsSchema,
  planRevisionSchema,
  refinePlanRequestSchema,
  type CreatePlanRequest,
  type CreatePlanResponse,
  type GeneratedMealPlan,
  type PlanDetailResponse,
  type PlanParams,
  type PlanRevision,
  type RefinePlanRequest
} from "./planner/contracts.js";
export {
  createInvalidGeneratedPlanError,
  createInvalidRefinedPlanError,
  createPlannerPlanNotFoundError,
  createPlannerProfileRequiredError,
  createPlannerServiceUnavailableError,
  createPlannerUpstreamError,
  createPlannerUsageLimitError
} from "./planner/errors.js";
export {
  createPlannerRepository,
  type CreatePlannerRepositoryOptions,
  type PersistedPlanDetail,
  type PersistedPlanResult,
  type PlannerDatabase,
  type PlannerRepository
} from "./planner/repository.js";
export { createPlannerService, type CreatePlannerServiceOptions, type PlannerService } from "./planner/service.js";
export {
  partialProfileWriteSchema,
  profileResponseSchema,
  profileUpsertResponseSchema,
  profileWriteSchema,
  type PartialProfileWriteInput,
  type ProfileResponse,
  type ProfileUpsertResponse,
  type ProfileWriteInput
} from "./profile/contracts.js";
export {
  createHouseholdProfileRepository,
  type CreateHouseholdProfileRepositoryOptions,
  type HouseholdProfileRepository,
  type ProfileDatabase,
  type ProfileUpsertOptions
} from "./profile/repository.js";
export { createProfileService, type CreateProfileServiceOptions, type ProfileService } from "./profile/service.js";
export { aggregateIngredientsFromPlan, type AggregatedShoppingIngredient } from "./shopping/aggregation.js";
export { resolveShoppingListItems, type ResolveShoppingListItemsOptions, type ResolvedShoppingListItemInput } from "./shopping/matching.js";
export {
  shoppingListParamsSchema,
  shoppingListResponseSchema,
  type ShoppingListParams
} from "./shopping/contracts.js";
export {
  createShoppingListNotFoundError,
  createShoppingListPlanInstanceRequiredError
} from "./shopping/errors.js";
export {
  createShoppingListRepository,
  type CreateShoppingListRepositoryOptions,
  type ShoppingDatabase,
  type ShoppingListRepository
} from "./shopping/repository.js";
export {
  createShoppingListService,
  type CreateShoppingListServiceOptions,
  type ShoppingListService
} from "./shopping/service.js";
export { createApiServices, summarizeServiceStates, type ApiServiceModule, type ApiServices, type ApiServiceStatus } from "./services.js";

const defaultApiWorkspace = {
  name: "@freshful/api",
  path: "apps/api"
} as const;

export const apiWorkspace = {
  ...(workspaceCatalog.find((workspace) => workspace.name === defaultApiWorkspace.name) ?? defaultApiWorkspace)
} as const;

export const sharedWorkspaceNames = workspaceCatalog.map((workspace) => workspace.name);

export function describeApiWorkspace(): string {
  return `${apiWorkspace.name}:${apiWorkspace.path}`;
}

async function runApiWorkspace(): Promise<void> {
  const { startApiServer } = await import("./app.js");
  const app = await startApiServer();
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Received shutdown signal.");
    await app.close();
    process.exit(0);
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown(signal);
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runApiWorkspace();
}