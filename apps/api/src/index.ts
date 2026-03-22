import { workspaceCatalog } from "@freshful/contracts";
import { pathToFileURL } from "node:url";

export { createApiApp, startApiServer, type ApiAppContext, type CreateApiAppOptions, type StartApiServerOptions } from "./app.js";
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
export { getDatabaseConfig } from "./db/config.js";
export { databaseTables, sensitiveTableColumns } from "./db/schema.js";
export {
  profileResponseSchema,
  profileUpsertResponseSchema,
  profileWriteSchema,
  type ProfileResponse,
  type ProfileUpsertResponse,
  type ProfileWriteInput
} from "./profile/contracts.js";
export {
  createHouseholdProfileRepository,
  type CreateHouseholdProfileRepositoryOptions,
  type HouseholdProfileRepository,
  type ProfileDatabase
} from "./profile/repository.js";
export { createProfileService, type CreateProfileServiceOptions, type ProfileService } from "./profile/service.js";
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