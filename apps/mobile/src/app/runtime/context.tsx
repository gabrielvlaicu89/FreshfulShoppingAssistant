import React from "react";

import type { MobileConfig } from "../../config";
import type { ApiClient } from "../api/client";
import type { PlannerCacheStorage } from "../planner/cache-storage";
import type { ProfileCacheStorage } from "../profile/cache-storage";

export interface AppRuntimeValue {
  config: MobileConfig;
  apiClient: ApiClient;
  plannerCacheStorage: PlannerCacheStorage;
  profileCacheStorage: ProfileCacheStorage;
}

export const AppRuntimeContext = React.createContext<AppRuntimeValue | null>(null);

export function useAppRuntime(): AppRuntimeValue {
  const value = React.useContext(AppRuntimeContext);

  if (!value) {
    throw new Error("App runtime context is not available.");
  }

  return value;
}