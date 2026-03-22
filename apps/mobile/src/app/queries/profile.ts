import React from "react";
import { useQuery } from "@tanstack/react-query";
import type { HouseholdProfile } from "@freshful/contracts";

import { useAuth } from "../auth/context";
import {
  toDashboardProfileSummary,
  type CachedProfileRecord,
  type DashboardProfileSummary
} from "../profile/cache-storage";
import { useAppRuntime } from "../runtime/context";

export type ProfileDataSource = "live" | "cache" | "empty";

export interface ProfileSummaryResult {
  profile: DashboardProfileSummary | null;
  dataSource: ProfileDataSource;
  cachedAt: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isError: boolean;
}

export interface ProfileDetailsResult {
  profile: HouseholdProfile | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isError: boolean;
}

function useProfileQueryState() {
  const auth = useAuth();
  const { apiClient, profileCacheStorage } = useAppRuntime();
  const userId = auth.user?.id ?? null;
  const accessToken = auth.session?.accessToken ?? null;
  const hasAuthenticatedSession = auth.status === "signed-in" && Boolean(userId) && Boolean(accessToken);

  const cacheQuery = useQuery<CachedProfileRecord | null>({
    queryKey: ["profile-cache", userId],
    queryFn: () => profileCacheStorage.read(userId ?? ""),
    enabled: Boolean(userId),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false
  });

  const profileQuery = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => apiClient.getProfile(accessToken ?? ""),
    enabled: hasAuthenticatedSession && cacheQuery.status !== "pending",
    retry: 1
  });

  React.useEffect(() => {
    if (!hasAuthenticatedSession || !userId || profileQuery.status !== "success") {
      return;
    }

    if (profileQuery.data) {
      void profileCacheStorage.write(toDashboardProfileSummary(profileQuery.data));
      return;
    }

    void profileCacheStorage.clear(userId);
  }, [hasAuthenticatedSession, profileCacheStorage, profileQuery.data, profileQuery.status, userId]);

  return {
    cacheQuery,
    cachedProfile: cacheQuery.data?.summary ?? null,
    profileQuery
  };
}

export function useProfileSummary(): ProfileSummaryResult {
  const { cacheQuery, cachedProfile, profileQuery } = useProfileQueryState();

  const liveProfile = React.useMemo<DashboardProfileSummary | null>(() => {
    if (!profileQuery.data) {
      return null;
    }

    return toDashboardProfileSummary(profileQuery.data);
  }, [profileQuery.data]);

  const profile = profileQuery.status === "success" ? liveProfile : cachedProfile;
  const dataSource: ProfileDataSource = profileQuery.status === "success"
    ? liveProfile
      ? "live"
      : "empty"
    : cachedProfile
      ? "cache"
      : "empty";

  return {
    profile,
    dataSource,
    cachedAt: cacheQuery.data?.cachedAt ?? null,
    isLoading: cacheQuery.status === "pending" || (profileQuery.status === "pending" && !cachedProfile),
    isRefreshing: profileQuery.fetchStatus === "fetching" && Boolean(cachedProfile),
    isError: profileQuery.isError && !cachedProfile
  };
}

export function useProfileDetails(): ProfileDetailsResult {
  const { profileQuery } = useProfileQueryState();

  return {
    profile: profileQuery.data ?? null,
    isLoading: profileQuery.status === "pending",
    isRefreshing: profileQuery.fetchStatus === "fetching" && profileQuery.status === "success",
    isError: profileQuery.isError
  };
}