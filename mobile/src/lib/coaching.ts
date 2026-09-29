import type { PlanSession, PrioritizedBacklogItem, BacklogItem, Course } from "@/services/types";

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Minutes since midnight for a Date. */
export function nowMinutes(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}

export function formatTimeRange(start: string, end: string): string {
  return `${formatHourMinute(start)} – ${formatHourMinute(end)}`;
}

export function formatHourMinute(time: string): string {
  if (!time || !time.includes(":")) return "--:--";
  const [h, m] = time.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return "--:--";
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

/**
 * Planned duration of a session, derived from the session's own start/end.
 *
 * `PlanSession.remaining_minutes` is the backlog-estimate remainder after
 * this session, NOT a duration: the last session of a task always carries
 * `remaining_minutes: 0`, which used to render as "~0m". Never use it for
 * duration display.
 */
export function sessionDurationMinutes(
  session: Pick<PlanSession, "start_time" | "end_time">,
): number {
  const start = parseTimeToMinutes(session.start_time);
  const end = parseTimeToMinutes(session.end_time);
  if (isNaN(start) || isNaN(end)) return 0;
  return Math.max(0, end - start);
}

/**
 * Minutes left in a session that is running right now. Separate concept from
 * the planned duration and from the wait until a session starts.
 */
export function sessionRemainingMinutes(
  session: Pick<PlanSession, "end_time">,
  nowMin: number,
): number {
  const end = parseTimeToMinutes(session.end_time);
  if (isNaN(end)) return 0;
  return Math.max(0, end - nowMin);
}

/** "~40m" for a planned session; "" when the session has no usable times. */
export function formatPlannedDuration(
  session: Pick<PlanSession, "start_time" | "end_time">,
): string {
  const minutes = sessionDurationMinutes(session);
  return minutes > 0 ? `~${formatMinutes(minutes)}` : "";
}

/** "25m left" for a running session; "" when nothing is left. */
export function formatRemainingLabel(
  session: Pick<PlanSession, "end_time">,
  nowMin: number,
): string {
  const minutes = sessionRemainingMinutes(session, nowMin);
  return minutes > 0 ? `${formatMinutes(minutes)} left` : "";
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

/**
 * First token of a display name. Greetings only — the full legal/display
 * name shown in Me/Profile must never be derived from this.
 */
export function firstName(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  const first = trimmed.split(/\s+/)[0];
  return first ? first : null;
}

export function getGreeting(name: string | null): string {
  const hour = new Date().getHours();
  const timeGreeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const display = firstName(name);
  return display ? `${timeGreeting}, ${display}` : timeGreeting;
}

export type SessionLength = "short" | "medium" | "long";

export function sessionLengthCategory(totalMs: number): SessionLength {
  const totalMin = totalMs / 60_000;
  if (totalMin < 30) return "short";
  if (totalMin <= 60) return "medium";
  return "long";
}

const COACH_MESSAGES: Record<SessionLength, string[]> = {
  short: [
    "Great start. Settle in and find your rhythm.",
    "You're building momentum. Keep going.",
    "Over halfway there. You're doing well.",
    "Almost there. Finish strong.",
  ],
  medium: [
    "Great start. Settle in and find your rhythm.",
    "You're in the zone. Keep this pace.",
    "Over halfway there. You're doing well.",
    "Almost there. Finish strong.",
  ],
  long: [
    "Great start. Settle in and find your rhythm.",
    "You're building momentum. Steady pace wins.",
    "Deep work now. You're doing well.",
    "Almost there. Finish strong.",
  ],
};

const FINAL_PUSH_MESSAGES: Record<SessionLength, string> = {
  short: "Final stretch — you're nearly done.",
  medium: "Last push — you're almost across the finish line.",
  long: "Final minutes — you've earned this finish.",
};

export function focusCoachMessage(
  elapsedMs: number,
  totalMs: number,
  variant: number = 0,
): string {
  if (totalMs <= 0) return "You're done!";
  const pct = elapsedMs / totalMs;
  const category = sessionLengthCategory(totalMs);
  const msgs = COACH_MESSAGES[category];

  if (pct >= 0.9) return FINAL_PUSH_MESSAGES[category];

  const idx =
    pct < 0.25 ? 0 : pct < 0.5 ? 1 : pct < 0.75 ? 2 : 3;
  const v = variant % msgs.length;
  return msgs[(idx + v) % msgs.length];
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

/**
 * Matches the planner-generated tally ("Planned 2 of 4 items. ...").
 * That string is implementation language; Today replaces it with student
 * wording built from real dashboard counts instead.
 */
const GENERATED_PLAN_STATUS = /^\s*Planned\s+\d+\s+of\s+\d+\s+items/i;

export function isGeneratedPlanStatus(message: string): boolean {
  return GENERATED_PLAN_STATUS.test(message);
}

/**
 * Student-facing plan status derived from dashboard data, never from the
 * planner's own wording.
 *
 * - all pending tasks have a session today → "All 4 tasks are scheduled."
 * - one pending task → "1 task planned for today."
 * - overflow / tasks without a session → "2 of 4 tasks planned today. ..."
 * - nothing scheduled → null (the empty states carry the message)
 */
export function buildPlanStatusText(input: {
  scheduledTasks: number;
  pendingTasks: number;
}): string | null {
  const pending = Math.max(0, input.pendingTasks);
  const scheduled = Math.min(Math.max(0, input.scheduledTasks), pending);
  if (pending === 0 || scheduled === 0) return null;
  if (scheduled < pending) {
    return `${scheduled} of ${pending} tasks planned today. The rest will continue later.`;
  }
  if (pending === 1) return "1 task planned for today.";
  return `All ${pending} tasks are scheduled.`;
}

export function buildRecommendationReason(
  item: { overdue: boolean; due_date: string | null; priority: number },
  healthScore: string,
  options?: { isTopPriority?: boolean },
): string {
  if (item.overdue)
    return "You're behind on this one. It's now the most important next step.";
  if (healthScore === "critical")
    return "Your backlog needs attention — this is a good place to start.";
  if (item.priority === 1)
    return "High priority — best to tackle this one first.";
  if (options?.isTopPriority)
    return "Highest priority from your current work.";
  if (item.due_date)
    return `Due ${formatDueDate(item.due_date)} — worth finishing before then.`;
  return "Best next fit for the time you have.";
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
