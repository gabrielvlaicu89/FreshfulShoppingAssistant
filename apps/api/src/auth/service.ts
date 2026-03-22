import { googleAuthResponseSchema, type GoogleAuthRequest, type GoogleAuthResponse } from "./contracts.js";
import type { GoogleTokenVerifier } from "./google.js";
import type { AuthUserRepository } from "./repository.js";
import type { AppSessionIssuer } from "./session.js";

export interface AuthService {
  signInWithGoogle(input: GoogleAuthRequest): Promise<GoogleAuthResponse>;
}

export interface CreateAuthServiceOptions {
  verifier: GoogleTokenVerifier;
  userRepository: AuthUserRepository;
  sessionIssuer: AppSessionIssuer;
}

export function createAuthService(options: CreateAuthServiceOptions): AuthService {
  return {
    async signInWithGoogle(input: GoogleAuthRequest): Promise<GoogleAuthResponse> {
      const identity = await options.verifier.verifyIdToken(input.idToken);
      const user = await options.userRepository.upsertGoogleUser(identity);
      const session = await options.sessionIssuer.issue(user);

      return googleAuthResponseSchema.parse({
        session,
        user
      });
    }
  };
}