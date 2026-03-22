import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { z } from "zod";

const apiWorkspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultEnvPath = path.join(apiWorkspaceRoot, ".env");

const databaseConfigSchema = z
  .object({
    DATABASE_URL: z.string().trim().url().or(z.string().trim().startsWith("postgres://")).or(z.string().trim().startsWith("postgresql://"))
  })
  .strict();

export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;

export function resolveApiWorkspacePath(...pathSegments: string[]): string {
  return path.join(apiWorkspaceRoot, ...pathSegments);
}

export function getDatabaseConfig(environment: NodeJS.ProcessEnv = process.env, envFilePath = defaultEnvPath): DatabaseConfig {
  const mergedEnvironment = {
    ...(fs.existsSync(envFilePath) ? dotenv.parse(fs.readFileSync(envFilePath, "utf8")) : {}),
    ...environment
  };

  return databaseConfigSchema.parse({
    DATABASE_URL: mergedEnvironment.DATABASE_URL
  });
}