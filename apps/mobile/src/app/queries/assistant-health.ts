import { useQuery } from "@tanstack/react-query";

import { useAppRuntime } from "../runtime/context";

export function useAssistantHealthQuery() {
  const { apiClient, config } = useAppRuntime();

  return useQuery({
    queryKey: ["assistant-health", config.apiBaseUrl],
    queryFn: () => apiClient.getAssistantHealth()
  });
}