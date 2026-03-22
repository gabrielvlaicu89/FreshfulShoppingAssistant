import type { ApiClient } from "../api/client";

import { type AuthSessionRecord } from "./contracts";
import { GoogleSignInCancelledError, type GoogleSignInClient } from "./google-client";
import { type AuthSessionStorage } from "./session-storage";

export { GoogleSignInCancelledError } from "./google-client";

export interface AuthService {
  restoreSession(): Promise<AuthSessionRecord | null>;
  signInWithGoogle(): Promise<AuthSessionRecord>;
  signOut(): Promise<void>;
}

export interface CreateAuthServiceOptions {
  apiClient: ApiClient;
  googleClient: GoogleSignInClient;
  sessionStorage: AuthSessionStorage;
  now?: () => Date;
}

export function createAuthService(options: CreateAuthServiceOptions): AuthService {
  const now = options.now ?? (() => new Date());

  return {
    async restoreSession() {
      try {
        const record = await options.sessionStorage.read();

        if (!record) {
          return null;
        }

        if (Date.parse(record.session.expiresAt) <= now().getTime()) {
          await options.sessionStorage.clear();
          return null;
        }

        return record;
      } catch {
        await options.sessionStorage.clear();
        return null;
      }
    },
    async signInWithGoogle() {
      const { idToken } = await options.googleClient.signIn();

      try {
        const record = await options.apiClient.exchangeGoogleIdToken(idToken);
        await options.sessionStorage.write(record);
        return record;
      } catch (error) {
        await options.googleClient.signOut().catch(() => undefined);
        throw error;
      }
    },
    async signOut() {
      const storageResult = options.sessionStorage.clear();
      const googleResult = options.googleClient.signOut().catch((error: unknown) => {
        if (error instanceof GoogleSignInCancelledError) {
          return undefined;
        }

        throw error;
      });

      await Promise.all([storageResult, googleResult]);
    }
  };
}