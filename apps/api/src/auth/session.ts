import { randomUUID } from "node:crypto";

import { errors as joseErrors, jwtVerify, SignJWT } from "jose";

import { createExpiredAppSessionError, createInvalidAppSessionError } from "./errors.js";
import { appSessionSchema, type AppSession, type AuthenticatedUser } from "./contracts.js";

export interface AppSessionIssuer {
  issue(user: AuthenticatedUser): Promise<AppSession>;
}

export interface VerifiedAppSession {
  userId: string;
}

export interface AppSessionVerifier {
  verify(accessToken: string): Promise<VerifiedAppSession>;
}

export interface CreateAppSessionIssuerOptions {
  issuer: string;
  secret: string;
  ttlSeconds: number;
  now?: () => Date;
}

export interface CreateAppSessionVerifierOptions {
  issuer: string;
  secret: string;
  audience?: string;
  currentDate?: Date;
}

export function createAppSessionIssuer(options: CreateAppSessionIssuerOptions): AppSessionIssuer {
  const now = options.now ?? (() => new Date());
  const signingSecret = new TextEncoder().encode(options.secret);

  return {
    async issue(user: AuthenticatedUser): Promise<AppSession> {
      const issuedAt = now();
      const expiresAt = new Date(issuedAt.getTime() + options.ttlSeconds * 1000);
      const accessToken = await new SignJWT({
        sessionKind: "app"
      })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setIssuer(options.issuer)
        .setAudience("freshful-mobile")
        .setSubject(user.id)
        .setJti(randomUUID())
        .setIssuedAt(Math.floor(issuedAt.getTime() / 1000))
        .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
        .sign(signingSecret);

      return appSessionSchema.parse({
        accessToken,
        tokenType: "Bearer",
        expiresAt: expiresAt.toISOString(),
        expiresInSeconds: options.ttlSeconds
      });
    }
  };
}

export function createAppSessionVerifier(options: CreateAppSessionVerifierOptions): AppSessionVerifier {
  const verificationSecret = new TextEncoder().encode(options.secret);

  return {
    async verify(accessToken: string): Promise<VerifiedAppSession> {
      try {
        const verificationResult = await jwtVerify(accessToken, verificationSecret, {
          issuer: options.issuer,
          audience: options.audience ?? "freshful-mobile",
          currentDate: options.currentDate
        });

        if (verificationResult.payload.sessionKind !== "app" || typeof verificationResult.payload.sub !== "string") {
          throw createInvalidAppSessionError();
        }

        return {
          userId: verificationResult.payload.sub
        };
      } catch (error) {
        if (error instanceof joseErrors.JWTExpired) {
          throw createExpiredAppSessionError(error);
        }

        if (error instanceof joseErrors.JOSEError) {
          throw createInvalidAppSessionError(error);
        }

        throw error;
      }
    }
  };
}