// Milestone 1 types — subset of frontend/src/services/types.ts

// ─── Auth ───

export interface UserData {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthLoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: UserData;
}

export interface AuthMeResponse extends UserData {
  profile: StudentProfileData | null;
  streak: StudyStreakData | null;
}

// ─── Profile ───

export interface StudentProfileData {
  id: string;
  user_id: string;
  name: string | null;
  class_name: string | null;
  board: string | null;
  school_timings: Record<string, unknown> | null;
  coaching_timings: Record<string, unknown> | null;
  sleep_schedule: SleepTime | null;
  energy_peak: string | null;
  preferred_study_window: StudyWindow | null;
  daily_target_minutes: number | null;
  created_at: string;
  updated_at: string;
}

export interface SleepTime {
  start: string;
  end: string;
}

export interface StudyWindow {
  earliest_start: string;
  latest_end: string;
}

// ─── Backlog ───

export interface BacklogItem {
  id: string;
  user_id: string;
  course_id: string;
  title: string;
  description: string | null;
  priority: number;
  estimated_minutes: number | null;
  due_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface BacklogItemCreatePayload {
  title: string;
  course_id: string;
  description?: string | null;
  priority?: number;
  estimated_minutes?: number | null;
  due_date?: string | null;
}

export interface BacklogItemUpdatePayload {
  title?: string;
  course_id?: string;
  description?: string | null;
  priority?: number;
  estimated_minutes?: number | null;
  due_date?: string | null;
  status?: string;
}

export interface Course {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface CourseCreatePayload {
  name: string;
  color?: string;
}

// ─── Planning ───

export interface TimeBlock {
  start: string;
  end: string;
  total_minutes: number;
  energy_rating: string;
}

export interface PrioritizedBacklogItem {
  id: string;
  title: string;
  course_id: string;
  course_name: string;
  course_color: string;
  priority: number;
  score: number;
  estimated_minutes: number | null;
  due_date: string | null;
  overdue: boolean;
  status: string;
}

export interface BacklogHealth {
  total_items: number;
  completed_items: number;
  overdue_items: number;
  pending_items: number;
  clear_rate_7d: number;
  health_score: string;
  estimated_completion_date: string | null;
}

export interface PlanningPreview {
  available_windows: TimeBlock[];
  prioritized_backlog: PrioritizedBacklogItem[];
  total_available_minutes: number;
  total_required_minutes: number;
  estimated_days_to_clear: number | null;
  backlog_health: BacklogHealth;
}

export interface PlanSession {
  backlog_item_id: string;
  session_id: string;
  start_time: string;
  end_time: string;
  reason: string;
  remaining_minutes: number;
}

export interface GeneratedPlan {
  sessions: PlanSession[];
  daily_message: string;
  overflow: string[];
}

export interface PlanGenerateResponse {
  plan: GeneratedPlan;
  source: "ai" | "deterministic";
  snapshot_id?: string;
}

export interface PlanChange {
  session_id: string;
  backlog_item_id: string;
  title: string;
  change_type: "rescheduled" | "moved_to_overflow" | "removed" | "shortened";
  previous_start: string | null;
  previous_end: string | null;
  new_start: string | null;
  new_end: string | null;
  reason: string;
}

export interface AdaptivePlanResponse {
  plan: GeneratedPlan;
  changes: PlanChange[];
  snapshot_id: string;
  previous_sessions: PlanSession[];
}

export interface SessionCompletionPayload {
  session_id: string;
  actual_minutes: number;
}

// ─── Streaks ───

export interface StudyStreakData {
  current_streak: number;
  longest_streak: number;
  total_study_days: number;
  last_completed_date: string | null;
  recovery_tokens_current: number;
  recovery_tokens_earned: number;
  recovery_tokens_used: number;
  streak_protected_today: boolean;
}

export interface SubjectStreakData {
  id: string;
  course_id: string;
  course_name: string;
  course_color: string;
  current_streak: number;
  longest_streak: number;
  last_completion_date: string | null;
}

export interface StreakAllData {
  momentum: StudyStreakData;
  subjects: SubjectStreakData[];
}

export interface BalanceScoreData {
  score: number;
  message: string | null;
  neglected_subjects: string[];
}

export interface InsightData {
  title: string;
  message: string;
  priority: number;
}

// ─── Dashboard ───

export interface DashboardData {
  profile: StudentProfileData | null;
  streaks: StreakAllData;
  balance: BalanceScoreData;
  insight: InsightData;
  planning: PlanningPreview;
  plan: PlanGenerateResponse;
}
