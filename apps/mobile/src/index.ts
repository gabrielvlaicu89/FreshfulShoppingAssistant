import { workspaceCatalog } from "@freshful/contracts";
import { pathToFileURL } from "node:url";

export { getMobileConfig } from "./config.js";

const defaultMobileWorkspace = {
  name: "@freshful/mobile",
  path: "apps/mobile"
} as const;

export const mobileWorkspace = {
  ...(workspaceCatalog.find((workspace) => workspace.name === defaultMobileWorkspace.name) ?? defaultMobileWorkspace)
} as const;

export const sharedWorkspacePaths = workspaceCatalog.map((workspace) => workspace.path);

export function describeMobileWorkspace(): string {
  return `${mobileWorkspace.name}:${mobileWorkspace.path}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(`Mobile workspace placeholder ready at ${describeMobileWorkspace()}.`);
  console.log("Validated mobile runtime config parsing is ready for P2-S3; the React Native Android shell is scheduled for P4-S1 and later mobile steps.");
}