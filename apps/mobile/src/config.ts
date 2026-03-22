import { z } from "zod";

const mobileEnvironmentSchema = z
  .object({
    APP_ENV: z.enum(["development", "test", "production"]),
    API_BASE_URL: z.string().trim().url(),
    GOOGLE_ANDROID_CLIENT_ID: z.string().trim().min(1),
    API_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000)
  })
  .strict();

export type MobileEnvironment = z.infer<typeof mobileEnvironmentSchema>;

export interface MobileRuntimeEnvironment {
  APP_ENV?: string;
  API_BASE_URL?: string;
  GOOGLE_ANDROID_CLIENT_ID?: string;
  API_REQUEST_TIMEOUT_MS?: string | number;
}

export interface MobileConfig {
  appEnv: MobileEnvironment["APP_ENV"];
  apiBaseUrl: string;
  google: {
    androidClientId: string;
  };
  network: {
    requestTimeoutMs: number;
  };
}

export function getMobileConfig(environment: MobileRuntimeEnvironment = {}): MobileConfig {
  const mergedEnvironment = {
    APP_ENV: "development",
    API_REQUEST_TIMEOUT_MS: "10000",
    ...environment
  };
  const parsedEnvironment = mobileEnvironmentSchema.parse({
    APP_ENV: mergedEnvironment.APP_ENV,
    API_BASE_URL: mergedEnvironment.API_BASE_URL,
    GOOGLE_ANDROID_CLIENT_ID: mergedEnvironment.GOOGLE_ANDROID_CLIENT_ID,
    API_REQUEST_TIMEOUT_MS: mergedEnvironment.API_REQUEST_TIMEOUT_MS
  });

  return {
    appEnv: parsedEnvironment.APP_ENV,
    apiBaseUrl: parsedEnvironment.API_BASE_URL,
    google: {
      androidClientId: parsedEnvironment.GOOGLE_ANDROID_CLIENT_ID
    },
    network: {
      requestTimeoutMs: parsedEnvironment.API_REQUEST_TIMEOUT_MS
    }
  };
}