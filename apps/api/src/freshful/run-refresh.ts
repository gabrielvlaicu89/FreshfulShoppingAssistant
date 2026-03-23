import { closeApiDatabase, createApiDatabase } from "../db/client.js";
import { getApiConfig } from "../config.js";
import { createFreshfulCatalogClient } from "./client.js";
import { createFreshfulCatalogRefreshRunner, freshfulCatalogRefreshModeSchema } from "./refresh.js";
import { createFreshfulCatalogRepository } from "./repository.js";
import { createFreshfulCatalogService } from "./service.js";

function readOption(name: string): string[] {
  return process.argv
    .slice(2)
    .filter((argument) => argument.startsWith(`--${name}=`))
    .map((argument) => argument.slice(name.length + 3))
    .filter((value) => value.trim().length > 0);
}

function readNumericOption(name: string): number | undefined {
  const [value] = readOption(name);

  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer.`);
  }

  return parsed;
}

function parseProductReference(rawValue: string, baseUrl: string) {
  const separatorIndex = rawValue.indexOf(":");

  if (separatorIndex <= 0 || separatorIndex === rawValue.length - 1) {
    throw new Error("--product must use the format freshfulId:slug.");
  }

  const freshfulId = rawValue.slice(0, separatorIndex).trim();
  const slug = rawValue.slice(separatorIndex + 1).trim();

  return {
    freshfulId,
    slug,
    detailPath: `/p/${slug}`,
    detailUrl: new URL(`/p/${slug}`, baseUrl).toString()
  };
}

async function main(): Promise<void> {
  const config = getApiConfig();
  const database = createApiDatabase({
    databaseUrl: config.databaseUrl,
    maxConnections: config.appEnv === "production" ? 5 : 1
  });
  const repository = createFreshfulCatalogRepository(database.db);
  const service = createFreshfulCatalogService({
    repository,
    client: createFreshfulCatalogClient({ config: config.freshful })
  });
  const runner = createFreshfulCatalogRefreshRunner({ repository, service });
  const [modeValue] = readOption("mode");
  const mode = freshfulCatalogRefreshModeSchema.parse(modeValue ?? "stale-only");
  const queryValues = readOption("query");
  const productValues = readOption("product");

  try {
    const result = await runner.run({
      mode,
      searchInputs: queryValues.length > 0 ? queryValues.map((query) => ({ query })) : undefined,
      productReferences:
        productValues.length > 0 ? productValues.map((value) => parseProductReference(value, config.freshful.baseUrl)) : undefined,
      searchLimit: readNumericOption("search-limit"),
      productLimit: readNumericOption("product-limit")
    });

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

    if (result.failures.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await closeApiDatabase(database);
  }
}

await main();