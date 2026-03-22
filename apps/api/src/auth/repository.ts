import { randomUUID } from "node:crypto";

import { createApiDatabase } from "../db/client.js";
import { databaseTables } from "../db/schema.js";
import { authenticatedUserSchema, type AuthenticatedUser } from "./contracts.js";
import type { GoogleIdentity } from "./google.js";

export type AuthDatabase = ReturnType<typeof createApiDatabase>["db"];

export interface AuthUserRepository {
  upsertGoogleUser(identity: GoogleIdentity): Promise<AuthenticatedUser>;
}

export interface CreateAuthUserRepositoryOptions {
  now?: () => Date;
}

export function createAuthUserRepository(
  database: AuthDatabase,
  options: CreateAuthUserRepositoryOptions = {}
): AuthUserRepository {
  const now = options.now ?? (() => new Date());

  return {
    async upsertGoogleUser(identity: GoogleIdentity): Promise<AuthenticatedUser> {
      const loginTimestamp = now().toISOString();
      const [user] = await database
        .insert(databaseTables.users)
        .values({
          id: randomUUID(),
          googleSubject: identity.subject,
          email: identity.email,
          emailVerified: identity.emailVerified,
          displayName: identity.displayName ?? null,
          photoUrl: identity.photoUrl ?? null,
          lastLoginAt: loginTimestamp
        })
        .onConflictDoUpdate({
          target: databaseTables.users.googleSubject,
          set: {
            email: identity.email,
            emailVerified: identity.emailVerified,
            displayName: identity.displayName ?? null,
            photoUrl: identity.photoUrl ?? null,
            lastLoginAt: loginTimestamp,
            updatedAt: loginTimestamp
          }
        })
        .returning({
          id: databaseTables.users.id,
          email: databaseTables.users.email,
          emailVerified: databaseTables.users.emailVerified,
          displayName: databaseTables.users.displayName,
          photoUrl: databaseTables.users.photoUrl,
          lastLoginAt: databaseTables.users.lastLoginAt
        });

      return authenticatedUserSchema.parse({
        ...user,
        lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : loginTimestamp
      });
    }
  };
}