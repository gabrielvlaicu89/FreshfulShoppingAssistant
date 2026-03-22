export const apiServiceStatusValues = ["pending", "ready"] as const;

export type ApiServiceStatus = (typeof apiServiceStatusValues)[number];

export interface ApiServiceModule<TImplementation = unknown> {
  name: string;
  status: ApiServiceStatus;
  implementation: TImplementation | null;
}

export interface ApiServices {
  auth: ApiServiceModule;
  ai: ApiServiceModule;
  planner: ApiServiceModule;
  freshful: ApiServiceModule;
}

function createServiceModule(name: string, implementation?: unknown): ApiServiceModule {
  return {
    name,
    status: implementation ? "ready" : "pending",
    implementation: implementation ?? null
  };
}

export function createApiServices(overrides: Partial<ApiServices> = {}): ApiServices {
  return {
    auth: overrides.auth ?? createServiceModule("auth"),
    ai: overrides.ai ?? createServiceModule("ai"),
    planner: overrides.planner ?? createServiceModule("planner"),
    freshful: overrides.freshful ?? createServiceModule("freshful")
  };
}

export function summarizeServiceStates(services: ApiServices): Record<keyof ApiServices, ApiServiceStatus> {
  return {
    auth: services.auth.status,
    ai: services.ai.status,
    planner: services.planner.status,
    freshful: services.freshful.status
  };
}
