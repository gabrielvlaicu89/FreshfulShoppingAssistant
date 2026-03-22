import fs from "node:fs";

import dotenv from "dotenv";
import { z } from "zod";

import { resolveApiWorkspacePath } from "../config.js";

const defaultEnvPath = resolveApiWorkspacePath(".env");
const databaseEnvironmentSchema = z
  .object({
    DATABASE_URL: z.string().trim().refine(
      (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
      "DATABASE_URL must use postgres:// or postgresql://."
    )
  })
  .strict();

export interface DatabaseConfig {
  DATABASE_URL: string;
}

export { resolveApiWorkspacePath };

function readDatabaseEnvironmentFile(envFilePath: string): Record<string, string> {
  if (!fs.existsSync(envFilePath)) {
    return {};
  }

  return dotenv.parse(fs.readFileSync(envFilePath, "utf8"));
}

export function getDatabaseConfig(environment: NodeJS.ProcessEnv = process.env, envFilePath = defaultEnvPath): DatabaseConfig {
  const mergedEnvironment: Record<string, string | undefined> = {
    ...readDatabaseEnvironmentFile(envFilePath),
    ...environment
  };
  const parsedEnvironment = databaseEnvironmentSchema.parse({
    DATABASE_URL: mergedEnvironment.DATABASE_URL
  });

  return {
    DATABASE_URL: parsedEnvironment.DATABASE_URL
  };
}