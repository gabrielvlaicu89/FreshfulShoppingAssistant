import { OAuth2Client } from "google-auth-library";
import { z } from "zod";

import { isApiHttpError } from "../errors.js";
import { createExpiredGoogleTokenError, createInvalidGoogleTokenError } from "./errors.js";

const googleTokenPayloadSchema = z
  .object({
    sub: z.string().trim().min(1),
    email: z.string().trim().email(),
    email_verified: z.boolean().optional(),
    name: z.string().trim().min(1).optional(),
    picture: z.string().trim().url().optional()
  })
  .passthrough();

export interface GoogleIdentity {
  subject: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
  photoUrl?: string;
}

export interface GoogleTokenVerifier {
  verifyIdToken(idToken: string): Promise<GoogleIdentity>;
}

export interface CreateGoogleTokenVerifierOptions {
  webClientId: string;
  client?: OAuth2Client;
}

function isExpiredGoogleTokenError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /expired|used too late|token.+late|exp claim/i.test(error.message);
}

export function createGoogleTokenVerifier(options: CreateGoogleTokenVerifierOptions): GoogleTokenVerifier {
  const client = options.client ?? new OAuth2Client();

  return {
    async verifyIdToken(idToken: string): Promise<GoogleIdentity> {
      try {
        const ticket = await client.verifyIdToken({
          idToken,
          audience: options.webClientId
        });
        const payload = googleTokenPayloadSchema.safeParse(ticket.getPayload());

        if (!payload.success) {
          throw createInvalidGoogleTokenError(payload.error);
        }

        return {
          subject: payload.data.sub,
          email: payload.data.email,
          emailVerified: payload.data.email_verified ?? false,
          displayName: payload.data.name,
          photoUrl: payload.data.picture
        };
      } catch (error) {
        if (isApiHttpError(error)) {
          throw error;
        }

        if (isExpiredGoogleTokenError(error)) {
          throw createExpiredGoogleTokenError(error);
        }

        throw createInvalidGoogleTokenError(error);
      }
    }
  };
}