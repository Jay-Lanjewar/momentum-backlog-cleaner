import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  DashboardData,
  AdaptivePlanResponse,
  SessionCompletionPayload,
  BacklogItem,
  BacklogItemCreatePayload,
  BacklogItemUpdatePayload,
  Course,
  CourseCreatePayload,
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

// ─── Backlog ───

export function useBacklogItems() {
  return useQuery({
    queryKey: ["backlog"],
    queryFn: async () => {
      const result = await api.get<BacklogItem[]>("/api/v1/backlog");
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    staleTime: 1000 * 30,
    retry: 1,
  });
}

export function useBacklogItem(id: string | null) {
  return useQuery({
    queryKey: ["backlog", id],
    queryFn: async () => {
      const result = await api.get<BacklogItem>(`/api/v1/backlog/${id}`);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!id,
    staleTime: 1000 * 30,
    retry: 1,
  });
}

export function useCreateBacklogItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: BacklogItemCreatePayload) => {
      const result = await api.post<BacklogItem>("/api/v1/backlog", payload);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateBacklogItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: BacklogItemUpdatePayload;
    }) => {
      const result = await api.put<BacklogItem>(
        `/api/v1/backlog/${id}`,
        payload,
      );
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteBacklogItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await api.delete<null>(`/api/v1/backlog/${id}`);
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// ─── Courses ───

export function useCourses() {
  return useQuery({
    queryKey: ["courses"],
    queryFn: async () => {
      const result = await api.get<Course[]>("/api/v1/courses");
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
}

export function useCreateCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CourseCreatePayload) => {
      const result = await api.post<Course>("/api/v1/courses", payload);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
    },
  });
}
