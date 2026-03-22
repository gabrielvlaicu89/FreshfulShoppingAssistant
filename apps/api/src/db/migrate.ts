import { migrate } from "drizzle-orm/postgres-js/migrator";

import { closeApiDatabase, createApiDatabase } from "./client.js";
import { resolveApiWorkspacePath } from "./config.js";

async function main(): Promise<void> {
  const database = createApiDatabase();

  try {
    await migrate(database.db, {
      migrationsFolder: resolveApiWorkspacePath("drizzle")
    });
  } finally {
    await closeApiDatabase(database);
  }
}

await main();