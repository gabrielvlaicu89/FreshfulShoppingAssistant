import { z } from "zod";

const trimmedStringSchema = z.string().trim().min(1);

export const googleAuthRequestSchema = z
  .object({
    idToken: trimmedStringSchema
  })
  .strict();

export type GoogleAuthRequest = z.infer<typeof googleAuthRequestSchema>;

export const authenticatedUserSchema = z
  .object({
    id: trimmedStringSchema,
    email: trimmedStringSchema,
    emailVerified: z.boolean(),
    displayName: trimmedStringSchema.nullable(),
    photoUrl: trimmedStringSchema.nullable(),
    lastLoginAt: z.string().datetime()
  })
  .strict();

export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;

export const appSessionSchema = z
  .object({
    accessToken: trimmedStringSchema,
    tokenType: z.literal("Bearer"),
    expiresAt: z.string().datetime(),
    expiresInSeconds: z.number().int().positive()
  })
  .strict();

export type AppSession = z.infer<typeof appSessionSchema>;

export const googleAuthResponseSchema = z
  .object({
    session: appSessionSchema,
    user: authenticatedUserSchema
  })
  .strict();

export type GoogleAuthResponse = z.infer<typeof googleAuthResponseSchema>;