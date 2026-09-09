import type { PlanSession, PrioritizedBacklogItem } from "@/services/types";

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
  return backlogItemMap.get(String(session.backlog_item_id))?.status === "completed";
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
