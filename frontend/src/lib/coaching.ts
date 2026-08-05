import type { PlanSession } from "@/services/types"

/* ─── Time ─── */

export function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  return eh * 60 + em - (sh * 60 + sm)
}

export function formatTimeDisplay(t: string): string {
  const [h, m] = t.split(":").map(Number)
  const period = h >= 12 ? "PM" : "AM"
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`
}

export function formatMinutes(mins: number): string {
  if (mins < 60) return `${Math.round(mins)} min`
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function formatShortDate(dateStr: string | null): string | null {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/* ─── Greeting ─── */

export function getGreeting(hour?: number): string {
  const h = hour ?? new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

/* ─── Difficulty ─── */

export type Difficulty = "easy" | "medium" | "hard"

export const DIFFICULTIES: { value: Difficulty; label: string; hint: string }[] = [
  { value: "easy", label: "Easy", hint: "Quick, light work" },
  { value: "medium", label: "Medium", hint: "Regular revision" },
  { value: "hard", label: "Hard", hint: "Needs deep focus" },
]

export function difficultyFromPriority(priority: number | null | undefined): Difficulty {
  if (priority == null) return "medium"
  if (priority <= 2) return "hard"
  if (priority === 4) return "easy"
  return "medium"
}

export function priorityFromDifficulty(difficulty: Difficulty): number {
  switch (difficulty) {
    case "hard":
      return 1
    case "easy":
      return 4
    default:
      return 3
  }
}

export function difficultyLabel(difficulty: Difficulty): string {
  return DIFFICULTIES.find((d) => d.value === difficulty)?.label ?? "Medium"
}

/* ─── Due chips ─── */

export type DueChip = "today" | "tomorrow" | "week" | "custom"

export const DUE_CHIPS: { value: DueChip; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "week", label: "This Week" },
  { value: "custom", label: "Custom" },
]

export function endOfWeek(now: Date): Date {
  const daysUntilSunday = (7 - now.getDay()) % 7
  const end = new Date(now)
  end.setDate(now.getDate() + daysUntilSunday)
  end.setHours(0, 0, 0, 0)
  return end
}

export function dueDateForChip(
  chip: Exclude<DueChip, "custom">,
  now: Date = new Date()
): string {
  const d = new Date(now)
  switch (chip) {
    case "today":
      return toDateKey(d)
    case "tomorrow":
      d.setDate(d.getDate() + 1)
      return toDateKey(d)
    case "week":
      return toDateKey(endOfWeek(now))
  }
}

function dateKeyFromString(dateStr: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  if (match) return `${match[1]}-${match[2]}-${match[3]}`
  return toDateKey(new Date(dateStr))
}

export function chipForDate(
  dateStr: string | null | undefined,
  now: Date = new Date()
): DueChip | null {
  if (!dateStr) return null
  const key = dateKeyFromString(dateStr)
  if (key === toDateKey(now)) return "today"
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (key === toDateKey(tomorrow)) return "tomorrow"
  const weekEnd = endOfWeek(now)
  if (key >= toDateKey(now) && key <= toDateKey(weekEnd)) return "week"
  return "custom"
}

/* ─── AI recommendation reason ─── */

export interface RecommendationContext {
  subject: string
  topic: string
  overdue: boolean
  dueDate: string | null
  isCurrent: boolean
  healthScore?: string | null
  daysUntilDue?: number | null
}

export function daysUntilDue(dateStr: string | null): number | null {
  if (!dateStr) return null
  const due = new Date(dateStr)
  const now = new Date()
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

export function buildRecommendationReason(ctx: RecommendationContext): string {
  const { subject, overdue, dueDate, isCurrent, healthScore } = ctx
  const until = ctx.daysUntilDue ?? daysUntilDue(dueDate)

  if (overdue) {
    return "This task is overdue. Finishing it now puts you back on schedule."
  }
  if (until != null && until <= 3) {
    return `Your ${subject} deadline is close. Doing this now keeps you on schedule.`
  }
  if (until != null && until <= 7) {
    return `${subject} is due this week. Finishing it now keeps you ahead.`
  }
  if (isCurrent) {
    return "This is up next in today's plan. Starting now keeps your momentum."
  }
  if (healthScore === "fair" || healthScore === "critical") {
    return "Starting now puts you back on schedule."
  }
  return "This is today's highest-impact task. Start it and the rest gets easier."
}

/* ─── Actionable coaching line ─── */

export interface CoachingContext {
  healthScore?: string | null
  overdueMinutes: number
  estimatedCompletionDate?: string | null
  pendingItems?: number
}

export function buildCoachingLine(ctx: CoachingContext): string {
  const { healthScore, overdueMinutes, estimatedCompletionDate } = ctx
  if (!healthScore || healthScore === "good") {
    if (estimatedCompletionDate) {
      return `You'll finish everything by ${formatShortDate(estimatedCompletionDate)}. Keep the momentum.`
    }
    return "You're on schedule. Keep the momentum going."
  }
  if (overdueMinutes > 0) {
    const hours = Math.max(1, Math.ceil(overdueMinutes / 60))
    const label = `${hours} hour${hours > 1 ? "s" : ""}`
    return `Starting now puts you back on schedule — ${label} of work is overdue.`
  }
  if (healthScore === "fair") {
    return "A little behind today. Starting now gets you back on track."
  }
  return "You're behind schedule. Starting now is the fastest way back on track."
}

/* ─── Focus-mode coaching ─── */

export function focusCoachMessage(progressPercent: number): string {
  if (progressPercent >= 100) return "Done. Great focus."
  if (progressPercent >= 75) return "Final stretch — finish strong."
  if (progressPercent >= 50) return "More than halfway. Stay with it."
  if (progressPercent >= 25) return "You're building momentum. Keep going."
  return "Settle in. The first few minutes are the hardest."
}

/* ─── Schedule confidence ─── */

export function scheduleConfidence(
  healthScore: string | null | undefined
): { label: string; detail: string } | null {
  if (!healthScore) return null
  switch (healthScore) {
    case "good":
      return { label: "High", detail: "Your plan is comfortably on track." }
    case "fair":
      return { label: "Medium", detail: "A little tight, but very doable." }
    case "critical":
      return { label: "Low", detail: "Behind schedule — starting now helps most." }
    default:
      return null
  }
}

/* ─── Time saved heuristic ─── */

export function estimateTimeSaved(
  estimatedMinutes: number | null | undefined,
  sessionMinutes: number
): number | null {
  if (!estimatedMinutes || estimatedMinutes <= sessionMinutes) return null
  return estimatedMinutes - sessionMinutes
}

/* ─── Next session ─── */

export function nextSessionAfter(
  sessions: PlanSession[],
  currentId: string,
  currentStart: string
): PlanSession | null {
  const upcoming = sessions
    .filter(
      (s) => s.backlog_item_id !== currentId && s.start_time > currentStart
    )
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
  return upcoming[0] ?? null
}
