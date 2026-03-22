import { QueryClient } from "@tanstack/react-query";

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
        gcTime: Number.POSITIVE_INFINITY,
        refetchOnReconnect: true,
        refetchOnWindowFocus: false
      }
    }
  });
}