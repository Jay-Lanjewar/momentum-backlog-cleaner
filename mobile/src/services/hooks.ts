import { AppState, type AppStateStatus } from "react-native";
import { useEffect, useMemo, useState } from "react";
import {
  QueryClient,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { api } from "@/lib/api";
import { performanceMark, performanceMeasure } from "@/lib/performance";
import { useAuthStore } from "@/store/useAuthStore";
import { removeDashboardPreview } from "@/services/dashboardPreview";
import type {
  DashboardData,
  AdaptivePlanResponse,
  SessionCompletionPayload,
  FocusSessionLifecyclePayload,
  FocusSessionLifecycleResponse,
  BacklogItem,
  BacklogItemCreatePayload,
  BacklogItemUpdatePayload,
  Course,
  CourseCreatePayload,
  CourseUpdatePayload,
  Goal,
  GoalCreatePayload,
  GoalUpdatePayload,
  WeeklyScheduleData,
  WeeklyScheduleUpdatePayload,
  AnalyticsProgressResponse,
  StudentProfileData,
  ProfileUpdatePayload,
  StreakAllData,
  BalanceScoreData,
  StudyBuddyChatPayload,
  StudyBuddyChatResponse,
} from "@/services/types";

export const dashboardQueryKey = ["dashboard"] as const;
let dashboardQueryClient: QueryClient | null = null;

export function registerDashboardQueryClient(queryClient: QueryClient): void {
  dashboardQueryClient = queryClient;
}

export function clearDashboardQueryCache(): void {
  dashboardQueryClient?.removeQueries({ queryKey: dashboardQueryKey });
}

export function clearDashboardSessionData(userId?: string): void {
  if (userId) removeDashboardPreview(userId);
  clearDashboardQueryCache();
}

export interface DashboardScope {
  userId: string;
  localDate: string;
  timezone: string;
}

export function getDashboardScope(
  userId: string,
  now = new Date(),
): DashboardScope {
  const localDate = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return { userId, localDate, timezone };
}

export function getDashboardQueryKey(scope: DashboardScope) {
  return [
    ...dashboardQueryKey,
    scope.userId,
    scope.localDate,
    scope.timezone,
  ] as const;
}

function useDashboardScope(): DashboardScope {
  const userId = useAuthStore((state) => state.user?.id ?? "");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const refreshScope = () => setNow(new Date());
    const interval = setInterval(refreshScope, 30_000);
    const subscription = AppState.addEventListener(
      "change",
      (state: AppStateStatus) => {
        if (state === "active") refreshScope();
      },
    );

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, []);

  return useMemo(() => getDashboardScope(userId, now), [userId, now]);
}

export async function fetchDashboard(): Promise<DashboardData> {
  performanceMark("today.dashboard.request.begin");
  const result = await api.get<DashboardData>("/api/v1/dashboard");
  performanceMeasure(
    "today.dashboard.request.finish",
    "today.dashboard.request.begin",
  );
  if (result.error) throw new Error(result.error);
  return result.data;
}

export function useDashboard(options?: {
  refetchOnMount?: boolean | "always";
  staleTime?: number;
  enabled?: boolean;
}) {
  const scope = useDashboardScope();
  const query = useQuery({
    queryKey: getDashboardQueryKey(scope),
    queryFn: fetchDashboard,
    enabled: !!scope.userId && options?.enabled !== false,
    staleTime: options?.staleTime ?? 1000 * 60,
    retry: 1,
    refetchOnMount: options?.refetchOnMount,
  });
  return { ...query, dashboardScope: scope };
}

export function useAnalyticsProgress() {
  return useQuery({
    queryKey: ["analytics", "progress"],
    queryFn: async () => {
      const result = await api.get<AnalyticsProgressResponse>(
        "/api/v1/analytics/progress",
      );
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    staleTime: 1000 * 60,
    retry: 1,
  });
}

// ─── Profile ───

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const result = await api.get<StudentProfileData>("/api/v1/profile");
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    staleTime: 1000 * 60,
    retry: 1,
  });
}

export function useSaveProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ProfileUpdatePayload) => {
      const result = await api.put<StudentProfileData>(
        "/api/v1/profile",
        payload,
      );
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useStreaks() {
  return useQuery({
    queryKey: ["streaks"],
    queryFn: async () => {
      const result = await api.get<StreakAllData>("/api/v1/streaks");
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    staleTime: 1000 * 60,
    retry: 1,
  });
}

export function useBalanceScore() {
  return useQuery({
    queryKey: ["balance"],
    queryFn: async () => {
      const result = await api.get<BalanceScoreData>("/api/v1/streaks/balance");
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
      queryClient.invalidateQueries({ queryKey: ["analytics", "progress"] });
    },
  });
}

export function useFocusSessionLifecycle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: FocusSessionLifecyclePayload) => {
      const result = await api.post<FocusSessionLifecycleResponse>(
        "/api/v1/planning/focus-session",
        payload,
      );
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_data, payload) => {
      if (payload.action === "cancel") {
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      }
    },
  });
}

function studyBuddyErrorMessage(error: string, errorCode: string | null): string {
  if (
    errorCode === "insufficient_aal" ||
    /invalid or expired|unauthori[sz]ed|forbidden|authentication required|not authenticated/i.test(error)
  ) {
    return "Please sign in again to use Study Buddy.";
  }
  if (/active focus session/i.test(error)) {
    return "This Focus session is no longer active. Return to Today to choose an active session.";
  }
  if (/request limit|rate limit|temporarily busy/i.test(error)) {
    return "Study Buddy is taking a short break. Please try again later.";
  }
  if (/network error|failed to fetch/i.test(error)) {
    return "Couldn't reach Study Buddy. Check your connection, then retry.";
  }
  return "Study Buddy couldn't answer just now. Please try again.";
}

export function useStudyBuddyChat() {
  return useMutation({
    mutationFn: async (payload: StudyBuddyChatPayload) => {
      const result = await api.post<StudyBuddyChatResponse>(
        "/api/v1/study-buddy/chat",
        payload,
      );
      if (result.error) {
        throw new Error(studyBuddyErrorMessage(result.error, result.errorCode));
      }
      return result.data;
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

export function useUpdateCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: CourseUpdatePayload;
    }) => {
      const result = await api.put<Course>(
        `/api/v1/courses/${id}`,
        payload,
      );
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
    },
  });
}

export function useDeleteCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await api.delete<null>(`/api/v1/courses/${id}`);
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// ─── Goals ───

export function useGoals(status?: string) {
  return useQuery({
    queryKey: ["goals", status ?? "all"],
    queryFn: async () => {
      const params = status ? `?status=${status}` : "";
      const result = await api.get<Goal[]>(`/api/v1/goals${params}`);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    staleTime: 1000 * 30,
    retry: 1,
  });
}

export function useCreateGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: GoalCreatePayload) => {
      const result = await api.post<Goal>("/api/v1/goals", payload);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}

export function useUpdateGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: GoalUpdatePayload;
    }) => {
      const result = await api.put<Goal>(
        `/api/v1/goals/${id}`,
        payload,
      );
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}

export function useDeleteGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await api.delete<null>(`/api/v1/goals/${id}`);
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}

// ─── Weekly Schedule ───

export function useWeeklySchedule() {
  return useQuery({
    queryKey: ["schedule"],
    queryFn: async () => {
      const result = await api.get<WeeklyScheduleData>(
        "/api/v1/profile/schedule",
      );
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
}

export function useSaveWeeklySchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: WeeklyScheduleUpdatePayload) => {
      const result = await api.put<WeeklyScheduleData>(
        "/api/v1/profile/schedule",
        payload,
      );
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["schedule"], data);
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
