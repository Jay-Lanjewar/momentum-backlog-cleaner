import type { PlanSession, PrioritizedBacklogItem, BacklogItem, Course } from "@/services/types";

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatTimeRange(start: string, end: string): string {
  return `${formatHourMinute(start)} – ${formatHourMinute(end)}`;
}

export function formatHourMinute(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

export function topicFromSession(session: { reason: string }): string {
  return session.reason.replace(/^Work on\s+/, "");
}

export function nextSessionAfter(
  sessions: PlanSession[],
  completedSessionId: string,
  currentStart: string,
): PlanSession | null {
  const upcoming = sessions
    .filter(
      (s) =>
        s.session_id !== completedSessionId && s.start_time > currentStart,
    )
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  return upcoming[0] ?? null;
}

// ─── Session classification helpers ───

export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export type BacklogItemMap = Map<string, PrioritizedBacklogItem>;

export function isSessionCompleted(
  session: PlanSession,
  backlogItemMap: BacklogItemMap,
): boolean {
  return !backlogItemMap.has(String(session.backlog_item_id));
}

export function getActiveSessions(
  sessions: PlanSession[],
  backlogItemMap: BacklogItemMap,
): PlanSession[] {
  return sessions.filter((s) => !isSessionCompleted(s, backlogItemMap));
}

export function getCurrentSession(
  sessions: PlanSession[],
  nowMin: number,
): PlanSession | null {
  return (
    sessions.find((s) => {
      const start = parseTimeToMinutes(s.start_time);
      const end = parseTimeToMinutes(s.end_time);
      return nowMin >= start && nowMin < end;
    }) ?? null
  );
}

export function getNextSession(
  sessions: PlanSession[],
  nowMin: number,
): PlanSession | null {
  const upcoming = sessions
    .filter((s) => parseTimeToMinutes(s.start_time) > nowMin)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  return upcoming[0] ?? null;
}

export function getUpcomingSessions(
  sessions: PlanSession[],
  nowMin: number,
): PlanSession[] {
  return sessions
    .filter((s) => parseTimeToMinutes(s.start_time) > nowMin)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
}

export function computeDailyProgress(
  sessions: PlanSession[],
  backlogItemMap: BacklogItemMap,
): number {
  if (sessions.length === 0) return 0;
  const completedCount = sessions.filter((s) =>
    isSessionCompleted(s, backlogItemMap),
  ).length;
  return Math.round((completedCount / sessions.length) * 100);
}

export function getGreeting(name: string | null): string {
  const hour = new Date().getHours();
  const timeGreeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return name ? `${timeGreeting}, ${name}` : timeGreeting;
}

export function focusCoachMessage(elapsedMs: number, totalMs: number): string {
  if (totalMs <= 0) return "You're done!";
  const pct = elapsedMs / totalMs;
  if (pct < 0.25) return "Great start. Settle in and find your rhythm.";
  if (pct < 0.5) return "You're building momentum. Keep going.";
  if (pct < 0.75) return "Over halfway there. You're doing well.";
  return "Almost there. Finish strong.";
}

export function healthTone(
  score: string,
): "success" | "warning" | "destructive" {
  switch (score) {
    case "good":
      return "success";
    case "fair":
      return "warning";
    case "critical":
      return "destructive";
    default:
      return "warning";
  }
}

export function buildRecommendationReason(
  item: { overdue: boolean; due_date: string | null; priority: number },
  healthScore: string,
): string {
  if (item.overdue) return "This task is overdue — highest priority.";
  if (healthScore === "critical")
    return "Your backlog needs attention. Let's clear some items.";
  if (item.priority === 1) return "High-priority task — important to tackle first.";
  return "This is the best next task for your study session.";
}

// ─── Difficulty (backlog priority abstraction) ───

export type Difficulty = "easy" | "medium" | "hard";

export const DIFFICULTIES: { value: Difficulty; label: string; hint: string }[] = [
  { value: "easy", label: "Easy", hint: "Quick, light work" },
  { value: "medium", label: "Medium", hint: "Regular revision" },
  { value: "hard", label: "Hard", hint: "Needs deep focus" },
];

export function difficultyFromPriority(
  priority: number | null | undefined,
): Difficulty {
  if (priority == null) return "medium";
  if (priority <= 2) return "hard";
  if (priority === 4) return "easy";
  return "medium";
}

export function priorityFromDifficulty(difficulty: Difficulty): number {
  switch (difficulty) {
    case "hard":
      return 1;
    case "easy":
      return 4;
    default:
      return 3;
  }
}

// ─── Due date chips ───

export type DueChip = "today" | "tomorrow" | "week" | "custom";

export const DUE_CHIPS: { value: DueChip; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "week", label: "This Week" },
  { value: "custom", label: "Custom" },
];

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function endOfWeek(now: Date): Date {
  const daysUntilSunday = (7 - now.getDay()) % 7;
  const end = new Date(now);
  end.setDate(now.getDate() + daysUntilSunday);
  end.setHours(0, 0, 0, 0);
  return end;
}

export function dueDateForChip(
  chip: "today" | "tomorrow" | "week",
  now: Date = new Date(),
): string {
  const d = new Date(now);
  switch (chip) {
    case "today":
      return toDateKey(d);
    case "tomorrow":
      d.setDate(d.getDate() + 1);
      return toDateKey(d);
    case "week":
      return toDateKey(endOfWeek(now));
  }
}

function dateKeyFromString(dateStr: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  return toDateKey(new Date(dateStr));
}

export function chipForDate(
  dateStr: string | null | undefined,
  now: Date = new Date(),
): DueChip | null {
  if (!dateStr) return null;
  const key = dateKeyFromString(dateStr);
  if (key === toDateKey(now)) return "today";
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (key === toDateKey(tomorrow)) return "tomorrow";
  const weekEnd = endOfWeek(now);
  if (key >= toDateKey(now) && key <= toDateKey(weekEnd)) return "week";
  return "custom";
}

export function formatDueDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const chip = chipForDate(dateStr);
  if (chip === "today") return "Today";
  if (chip === "tomorrow") return "Tomorrow";
  if (chip === "week") return "This Week";
  const d = new Date(dateStr);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

export function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const due = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return due.getTime() < now.getTime();
}

// ─── Course helpers ───

export function courseMapFromList(courses: Course[]): Map<string, Course> {
  const map = new Map<string, Course>();
  for (const c of courses) map.set(c.id, c);
  return map;
}

export function courseNameForItem(
  courseId: string,
  courseMap: Map<string, Course>,
): string {
  return courseMap.get(courseId)?.name ?? "Unknown";
}

export function courseColorForItem(
  courseId: string,
  courseMap: Map<string, Course>,
): string {
  return courseMap.get(courseId)?.color ?? "#6b7280";
}
