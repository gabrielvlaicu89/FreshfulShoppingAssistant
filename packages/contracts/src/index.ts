export interface WorkspaceDescriptor {
  name: "@freshful/api" | "@freshful/mobile" | "@freshful/contracts";
  path: "apps/api" | "apps/mobile" | "packages/contracts";
}

export const workspaceCatalog: WorkspaceDescriptor[] = [
  {
    name: "@freshful/api",
    path: "apps/api"
  },
  {
    name: "@freshful/mobile",
    path: "apps/mobile"
  },
  {
    name: "@freshful/contracts",
    path: "packages/contracts"
  }
];