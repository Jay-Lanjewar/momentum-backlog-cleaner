import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/services/api"
import type {
  PlanningPreview,
  PlanGenerateResponse,
  StudentProfileData,
  WeeklyScheduleData,
  ProfileUpdatePayload,
  WeeklyScheduleUpdatePayload,
  BacklogItemData,
  BacklogItemCreatePayload,
  BacklogItemUpdatePayload,
  CourseData,
  CourseCreatePayload,
  CourseUpdatePayload,
  GoalData,
  GoalCreatePayload,
  GoalUpdatePayload,
  StreakAllData,
  StreakUpdatePayload,
  BalanceScoreData,
  InsightData,
  DashboardData,
  FriendRequest,
  FriendRequestPayload,
  FriendshipData,
  UserSearchResult,
  FriendRequestsResponse,
  ActivityFeedItem,
} from "@/services/types"

export function usePlanningPreview() {
  return useQuery({
    queryKey: ["planning", "preview"],
    queryFn: async () => {
      const result = await api.post<PlanningPreview>("/api/v1/planning/preview", {})
      if (result.error) throw new Error(result.error)
      return result.data
    },
    staleTime: 1000 * 60,
    retry: 1,
  })
}

export function useGeneratePlan() {
  return useQuery({
    queryKey: ["plans", "generate"],
    queryFn: async () => {
      const result = await api.post<PlanGenerateResponse>("/api/v1/plans/generate", {})
      if (result.error) throw new Error(result.error)
      return result.data
    },
    staleTime: 1000 * 60,
    retry: 1,
  })
}

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const result = await api.get<StudentProfileData>("/api/v1/profile")
      if (result.error) return null
      return result.data
    },
    staleTime: 1000 * 60 * 5,
    retry: false,
  })
}

export function useWeeklySchedule() {
  return useQuery({
    queryKey: ["schedule"],
    queryFn: async () => {
      const result = await api.get<WeeklyScheduleData>("/api/v1/profile/schedule")
      if (result.error) return null
      return result.data
    },
    staleTime: 1000 * 60 * 5,
    retry: false,
  })
}

export function useSaveProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: ProfileUpdatePayload) => {
      const result = await api.put<StudentProfileData>("/api/v1/profile", payload)
      if (result.error) throw new Error(result.error)
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backlog"] })
    },
  })
}

export function useCreateCourse() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CourseCreatePayload) => {
      const result = await api.post<CourseData>("/api/v1/courses", payload)
      if (result.error) throw new Error(result.error)
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] })
    },
  })
}

export function useUpdateCourse() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: CourseUpdatePayload }) => {
      const result = await api.put<CourseData>(`/api/v1/courses/${id}`, payload)
      if (result.error) throw new Error(result.error)
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] })
    },
  })
}

export function useDeleteCourse() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await api.delete<null>(`/api/v1/courses/${id}`)
      if (result.error) throw new Error(result.error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] })
    },
  })
}

export function useSaveWeeklySchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: WeeklyScheduleUpdatePayload) => {
      const result = await api.put<WeeklyScheduleData>("/api/v1/profile/schedule", payload)
      if (result.error) throw new Error(result.error)
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] })
      queryClient.invalidateQueries({ queryKey: ["backlog"] })
    },
  })
}

export function useGoals(status?: string) {
  const endpoint = status
    ? `/api/v1/goals?status=${status}`
    : "/api/v1/goals"
  return useQuery({
    queryKey: ["goals", status ?? "all"],
    queryFn: async () => {
      const result = await api.get<GoalData[]>(endpoint)
      if (result.error) throw new Error(result.error)
      return result.data
    },
    staleTime: 1000 * 60,
  })
}

export function useCreateGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: GoalCreatePayload) => {
      const result = await api.post<GoalData>("/api/v1/goals", payload)
      if (result.error) throw new Error(result.error)
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] })
    },
  })
}

export function useUpdateGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: GoalUpdatePayload }) => {
      const result = await api.put<GoalData>(`/api/v1/goals/${id}`, payload)
      if (result.error) throw new Error(result.error)
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] })
    },
  })
}

export function useDeleteGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await api.delete<null>(`/api/v1/goals/${id}`)
      if (result.error) throw new Error(result.error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] })
    },
  })
}

export function useStreaks() {
  return useQuery({
    queryKey: ["streaks"],
    queryFn: async () => {
      const result = await api.get<StreakAllData>("/api/v1/streaks")
      if (result.error) throw new Error(result.error)
      return result.data
    },
    staleTime: 1000 * 60,
  })
}

export function useUpdateStreaks() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: StreakUpdatePayload) => {
      const result = await api.post<StreakAllData>("/api/v1/streaks/update", payload)
      if (result.error) throw new Error(result.error)
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["streaks"] })
      queryClient.invalidateQueries({ queryKey: ["streaks", "balance"] })
    },
  })
}

export function useBalanceScore() {
  return useQuery({
    queryKey: ["streaks", "balance"],
    queryFn: async () => {
      const result = await api.get<BalanceScoreData>("/api/v1/streaks/balance")
      if (result.error) throw new Error(result.error)
      return result.data
    },
    staleTime: 1000 * 60,
  })
}

export function useInsight() {
  return useQuery({
    queryKey: ["motivation", "insight"],
    queryFn: async () => {
      const result = await api.get<InsightData>("/api/v1/motivation/insight")
      if (result.error) throw new Error(result.error)
      return result.data
    },
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  })
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const result = await api.get<DashboardData>("/api/v1/dashboard")
      if (result.error) throw new Error(result.error)
      return result.data
    },
    staleTime: 1000 * 60,
    retry: 1,
  })
}

export function useCourses() {
  return useQuery({
    queryKey: ["courses"],
    queryFn: async () => {
      const result = await api.get<CourseData[]>("/api/v1/courses")
      if (result.error) throw new Error(result.error)
      return result.data
    },
    staleTime: 1000 * 60 * 5,
  })
}

export function useBacklogItems(status?: string) {
  const endpoint = status && status !== "all"
    ? `/api/v1/backlog?status=${status}`
    : "/api/v1/backlog"
  return useQuery({
    queryKey: ["backlog", status ?? "all"],
    queryFn: async () => {
      const result = await api.get<BacklogItemData[]>(endpoint)
      if (result.error) throw new Error(result.error)
      return result.data
    },
    staleTime: 1000 * 30,
  })
}

export function useCreateBacklogItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: BacklogItemCreatePayload) => {
      const result = await api.post<BacklogItemData>("/api/v1/backlog", payload)
      if (result.error) throw new Error(result.error)
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backlog"] })
    },
  })
}

export function useUpdateBacklogItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: BacklogItemUpdatePayload }) => {
      const result = await api.put<BacklogItemData>(`/api/v1/backlog/${id}`, payload)
      if (result.error) throw new Error(result.error)
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backlog"] })
    },
  })
}

export function useDeleteBacklogItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await api.delete<null>(`/api/v1/backlog/${id}`)
      if (result.error) throw new Error(result.error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backlog"] })
    },
  })
}

// ─── Social Hooks ───

export function useSearchUsers(query: string) {
  return useQuery({
    queryKey: ["users", "search", query],
    queryFn: async () => {
      const result = await api.get<UserSearchResult[]>(`/api/v1/users/search?q=${encodeURIComponent(query)}`)
      if (result.error) throw new Error(result.error)
      return result.data
    },
    enabled: query.trim().length >= 2,
    staleTime: 1000 * 30,
  })
}

export function useFriends() {
  return useQuery({
    queryKey: ["friends"],
    queryFn: async () => {
      const result = await api.get<FriendshipData[]>("/api/v1/friends")
      if (result.error) throw new Error(result.error)
      return result.data
    },
    staleTime: 1000 * 60,
  })
}

export function useFriendRequests() {
  return useQuery({
    queryKey: ["friends", "requests"],
    queryFn: async () => {
      const result = await api.get<FriendRequestsResponse>("/api/v1/friends/requests")
      if (result.error) throw new Error(result.error)
      return result.data
    },
    staleTime: 1000 * 30,
  })
}

export function useSendFriendRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: FriendRequestPayload) => {
      const result = await api.post<FriendRequest>("/api/v1/friends/request", payload)
      if (result.error) throw new Error(result.error)
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friends", "requests"] })
      queryClient.invalidateQueries({ queryKey: ["users", "search"] })
    },
  })
}

export function useAcceptFriendRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (requestId: string) => {
      const result = await api.post<FriendshipData>(`/api/v1/friends/request/${requestId}/accept`, {})
      if (result.error) throw new Error(result.error)
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friends"] })
      queryClient.invalidateQueries({ queryKey: ["friends", "requests"] })
    },
  })
}

export function useRejectFriendRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (requestId: string) => {
      const result = await api.post<null>(`/api/v1/friends/request/${requestId}/reject`, {})
      if (result.error) throw new Error(result.error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friends", "requests"] })
    },
  })
}

export function useRemoveFriend() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (friendId: string) => {
      const result = await api.delete<null>(`/api/v1/friends/${friendId}`)
      if (result.error) throw new Error(result.error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friends"] })
    },
  })
}

// ─── Activity Feed Hook ───

export function useActivityFeed(limit: number = 20, offset: number = 0) {
  return useQuery({
    queryKey: ["activities", "feed", limit, offset],
    queryFn: async () => {
      const result = await api.get<ActivityFeedItem[]>(
        `/api/v1/activities/feed?limit=${limit}&offset=${offset}`
      )
      if (result.error) throw new Error(result.error)
      return result.data
    },
    staleTime: 1000 * 60,
  })
}
