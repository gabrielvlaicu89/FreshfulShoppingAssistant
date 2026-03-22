import { workspaceCatalog } from "@freshful/contracts";
import { pathToFileURL } from "node:url";

export { closeApiDatabase, createApiDatabase } from "./db/client.js";
export { getApiConfig, resolveApiWorkspacePath } from "./config.js";
export { getDatabaseConfig } from "./db/config.js";
export { databaseTables, sensitiveTableColumns } from "./db/schema.js";

const defaultApiWorkspace = {
  name: "@freshful/api",
  path: "apps/api"
} as const;

export const apiWorkspace = {
  ...(workspaceCatalog.find((workspace) => workspace.name === defaultApiWorkspace.name) ?? defaultApiWorkspace)
} as const;

export const sharedWorkspaceNames = workspaceCatalog.map((workspace) => workspace.name);

export function describeApiWorkspace(): string {
  return `${apiWorkspace.name}:${apiWorkspace.path}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(`API workspace placeholder ready at ${describeApiWorkspace()}.`);
  console.log("Database schema, validated runtime config loading, and migrations are ready through P2-S3; Fastify server wiring belongs to P3-S1 and later backend steps.");
}