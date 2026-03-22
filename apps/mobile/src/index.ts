import { workspaceCatalog } from "@freshful/contracts";

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