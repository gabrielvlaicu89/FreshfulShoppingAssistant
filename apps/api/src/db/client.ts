import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

import { getDatabaseConfig } from "./config.js";
import * as schema from "./schema.js";

export interface CreateApiDatabaseOptions {
  client?: Sql;
  databaseUrl?: string;
  maxConnections?: number;
}

export function createApiDatabase(options: CreateApiDatabaseOptions = {}) {
  const client =
    options.client ??
    postgres(options.databaseUrl ?? getDatabaseConfig().DATABASE_URL, {
      max: options.maxConnections ?? 1,
      prepare: false
    });

  return {
    client,
    db: drizzle(client, { schema }),
    schema
  };
}

export async function closeApiDatabase(database: { client: Sql }): Promise<void> {
  await database.client.end({ timeout: 5 });
}