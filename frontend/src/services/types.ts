export interface TimeBlock {
  start: string
  end: string
  total_minutes: number
  energy_rating: string
}

export interface PrioritizedBacklogItem {
  id: string
  title: string
  course_id: string
  course_name: string
  course_color: string
  priority: number
  score: number
  estimated_minutes: number | null
  due_date: string | null
  overdue: boolean
  status: string
}

export interface BacklogHealth {
  total_items: number
  completed_items: number
  overdue_items: number
  pending_items: number
  clear_rate_7d: number
  health_score: string
  estimated_completion_date: string | null
}

export interface PlanningPreview {
  available_windows: TimeBlock[]
  prioritized_backlog: PrioritizedBacklogItem[]
  total_available_minutes: number
  total_required_minutes: number
  estimated_days_to_clear: number | null
  backlog_health: BacklogHealth
}

export interface PlanSession {
  backlog_item_id: string
  start_time: string
  end_time: string
  reason: string
}

export interface GeneratedPlan {
  sessions: PlanSession[]
  daily_message: string
  overflow: string[]
}

export interface PlanGenerateResponse {
  plan: GeneratedPlan
  source: "ai" | "deterministic"
}

export interface StudentProfileData {
  id: string
  user_id: string
  name: string | null
  class_name: string | null
  board: string | null
  school_timings: Record<string, unknown> | null
  coaching_timings: Record<string, unknown> | null
  sleep_schedule: SleepTime | null
  energy_peak: string | null
  preferred_study_window: StudyWindow | null
  daily_target_minutes: number | null
  created_at: string
  updated_at: string
}

export interface SleepTime {
  start: string
  end: string
}

export interface StudyWindow {
  earliest_start: string
  latest_end: string
}

export interface WeeklyBlock {
  type: "school" | "coaching" | "study" | "break" | "commute"
  start: string
  end: string
}

export type DayName = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"

export interface WeeklyScheduleData {
  id: string
  user_id: string
  schedule: Partial<Record<DayName, WeeklyBlock[]>>
  created_at: string
  updated_at: string
}

export interface UserData {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
}

export interface ProfileUpdatePayload {
  name?: string | null
  class_name?: string | null
  board?: string | null
  sleep_schedule?: SleepTime | null
  energy_peak?: string | null
  preferred_study_window?: StudyWindow | null
  daily_target_minutes?: number | null
}

export interface WeeklyScheduleUpdatePayload {
  schedule: Partial<Record<DayName, WeeklyBlock[]>>
}

export interface CourseData {
  id: string
  user_id: string
  name: string
  color: string
  created_at: string
  updated_at: string
}

export interface BacklogItemData {
  id: string
  user_id: string
  course_id: string
  title: string
  description: string | null
  priority: number
  estimated_minutes: number | null
  due_date: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface BacklogItemCreatePayload {
  title: string
  course_id: string
  description?: string | null
  priority?: number
  estimated_minutes?: number | null
  due_date?: string | null
}

export interface BacklogItemUpdatePayload {
  title?: string
  course_id?: string
  description?: string | null
  priority?: number
  estimated_minutes?: number | null
  due_date?: string | null
  status?: string
}

export interface CourseCreatePayload {
  name: string
  color?: string
}

export interface CourseUpdatePayload {
  name?: string
  color?: string
}

export interface StudyStreakData {
  current_streak: number
  longest_streak: number
  total_study_days: number
  last_completed_date: string | null
}

export interface SubjectStreakData {
  id: string
  course_id: string
  course_name: string
  course_color: string
  current_streak: number
  longest_streak: number
  last_completion_date: string | null
}

export interface StreakAllData {
  momentum: StudyStreakData
  subjects: SubjectStreakData[]
}

export interface BalanceScoreData {
  score: number
  message: string | null
  neglected_subjects: string[]
}

export interface StreakUpdatePayload {
  completed_subject_ids: string[]
}

export interface GoalData {
  id: string
  user_id: string
  title: string
  description: string | null
  target_date: string | null
  category: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface GoalCreatePayload {
  title: string
  description?: string | null
  target_date?: string | null
  category?: string | null
}

export interface GoalUpdatePayload {
  title?: string
  description?: string | null
  target_date?: string | null
  category?: string | null
  status?: string
}
