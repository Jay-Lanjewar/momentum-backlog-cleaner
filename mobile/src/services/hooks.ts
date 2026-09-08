import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  DashboardData,
  AdaptivePlanResponse,
  SessionCompletionPayload,
} from "@/services/types";

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const result = await api.get<DashboardData>("/api/v1/dashboard");
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    staleTime: 1000 * 60,
    retry: 1,
  });
}

export function useCompleteSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SessionCompletionPayload) => {
      const result = await api.post<AdaptivePlanResponse>(
        "/api/v1/planning/complete-session",
        payload,
      );
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
