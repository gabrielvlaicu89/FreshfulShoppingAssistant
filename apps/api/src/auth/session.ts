import { randomUUID } from "node:crypto";

import { SignJWT } from "jose";

import { appSessionSchema, type AppSession, type AuthenticatedUser } from "./contracts.js";

export interface AppSessionIssuer {
  issue(user: AuthenticatedUser): Promise<AppSession>;
}

export interface CreateAppSessionIssuerOptions {
  issuer: string;
  secret: string;
  ttlSeconds: number;
  now?: () => Date;
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