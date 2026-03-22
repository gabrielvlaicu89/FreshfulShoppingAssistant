import fs from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import { resolveApiWorkspacePath } from "./config.js";
import * as schema from "./schema.js";

async function listMigrationFiles(): Promise<string[]> {
  const migrationDirectory = resolveApiWorkspacePath("drizzle");
  const entries = await fs.readdir(migrationDirectory, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => resolveApiWorkspacePath("drizzle", entry.name))
    .sort((left, right) => left.localeCompare(right));
}

export async function createMigratedTestDatabase() {
  const client = new PGlite();
  const migrationFiles = await listMigrationFiles();

  for (const migrationFile of migrationFiles) {
    await client.exec(await fs.readFile(migrationFile, "utf8"));
  }

  return {
    client,
    db: drizzle(client, { schema }),
    migrationFiles,
    schema
  };
}