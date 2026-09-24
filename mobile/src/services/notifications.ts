import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import type { PlanSession, PlanChange } from "@/services/types";

// ─── Constants ───

const SOURCE = "momentum";

export const CHANNELS = {
  sessionReminders: "session-reminders",
  sessionStart: "session-start",
  planChanges: "plan-changes",
} as const;

export type NotificationType =
  | "session_reminder"
  | "session_start"
  | "plan_changed";

export interface MomentumNotificationData {
  source: string;
  type: NotificationType;
  sessionId?: string;
  /** Session start_time at schedule time (identity includes this). */
  startTime?: string;
  url: string;
}

// ─── Foreground Handler ───

export function setNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// ─── Channels ───

export async function createNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync(CHANNELS.sessionReminders, {
    name: "Session Reminders",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#2563EB",
    description: "Reminders 10 minutes before your study sessions",
  });

  await Notifications.setNotificationChannelAsync(CHANNELS.sessionStart, {
    name: "Session Start",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 250, 500],
    lightColor: "#2563EB",
    description: "Alerts when a study session begins",
  });

  await Notifications.setNotificationChannelAsync(CHANNELS.planChanges, {
    name: "Plan Changes",
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: "#2563EB",
    description: "Notifies when your study plan is updated",
  });
}

// ─── Permissions ───

/**
 * True after we have attempted the system permission prompt once this
 * app session. Prevents re-prompting on every dashboard render/refetch.
 */
let permissionRequestedThisSession = false;

export async function getPermissionState(): Promise<Notifications.NotificationPermissionsStatus> {
  return Notifications.getPermissionsAsync();
}

/**
 * Request notification permission at most once per app session.
 *
 * - Already granted → returns true without calling the system prompt.
 * - Already denied → returns false without re-prompting (no nagging).
 * - Undetermined → prompts once, then never again this session.
 * - Any failure → returns false (never throws; callers stay non-blocking).
 *
 * Android API differences are handled by Expo's Notifications API.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === "granted") return true;
    if (existing === "denied") return false;
    if (permissionRequestedThisSession) return false;

    permissionRequestedThisSession = true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

/** Test helper: allow a fresh permission prompt attempt in the next test. */
export function resetNotificationPermissionSession(): void {
  permissionRequestedThisSession = false;
}

// ─── Identification ───

/**
 * Stable notification identity: type + session + start time.
 * Same session_id with a different start_time gets a different id so a
 * replan can cancel the old id and schedule the new one.
 *
 * Example: momentum-session_reminder-s1-1730
 *          momentum-session_reminder-s1-20260925T1815
 */
function momentumNotificationId(
  type: NotificationType,
  sessionId: string,
  startTime: string,
): string {
  const timeKey = startTime.replace(/[^0-9]/g, "");
  return `momentum-${type}-${sessionId}-${timeKey}`;
}

/** Reschedule identity: session_id + start_time (not session_id alone). */
export function sessionScheduleKey(
  sessionId: string,
  startTime: string,
): string {
  return `${sessionId}:${startTime}`;
}

function isMomentumNotification(data: any): data is MomentumNotificationData {
  return (
    typeof data === "object" &&
    data !== null &&
    data.source === SOURCE &&
    typeof data.type === "string" &&
    typeof data.url === "string"
  );
}

// ─── Cancel ───

export async function cancelMomentumNotifications(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (isMomentumNotification(n.content.data as Record<string, unknown>)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

/** Cancel every Momentum notification for this session (any start_time). */
export async function cancelSessionNotifications(
  sessionId: string,
): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    const data = n.content.data as Record<string, unknown>;
    if (
      isMomentumNotification(data) &&
      data.sessionId === sessionId
    ) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

// ─── Local date / time helpers ───

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Device-local calendar date YYYY-MM-DD.
 * Never use toISOString() here — that is UTC and drifts from the local
 * day near midnight / in non-UTC timezones.
 */
export function localDateString(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Split session.start_time into a calendar date + HH:MM clock time.
 * - Bare "HH:MM" → device-local today (backend plan sessions are day-less).
 * - "YYYY-MM-DDTHH:MM" → use the date part as written (already a calendar date).
 * Never parse bare "HH:MM" through Date string parsing (timezone-dependent).
 */
function parseSessionStart(start_time: string): {
  date: string;
  time: string;
} {
  if (start_time.length > 5) {
    return {
      date: start_time.slice(0, 10),
      time: start_time.slice(11, 16),
    };
  }
  return { date: localDateString(), time: start_time };
}

/** Absolute Date in the device's local timezone from Y-M-D + HH:MM. */
function localDateAt(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0);
}

function extractTopic(reason: string): string {
  if (reason.startsWith("Work on ")) return reason.slice(8);
  return reason;
}

function isSessionEligible(
  session: PlanSession,
  completedIds: Set<string>,
): boolean {
  if (completedIds.has(session.session_id)) return false;

  const now = new Date();
  const today = localDateString(now);
  const { date: sessionDate, time: timeStr } = parseSessionStart(
    session.start_time,
  );

  // Past local calendar day → never schedule.
  if (sessionDate < today) return false;

  // Future local calendar day → eligible on its own date.
  // Do not evaluate tomorrow's clock time against today's local time.
  if (sessionDate > today) return true;

  // Same local day: start must be strictly after the local clock (minutes).
  const sessionStartMin = timeToMinutes(timeStr);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return sessionStartMin > nowMin;
}

// ─── Schedule Session Reminder ───

export async function scheduleSessionReminder(
  session: PlanSession,
  completedIds: Set<string> = new Set(),
): Promise<string | null> {
  if (!isSessionEligible(session, completedIds)) return null;

  const { date, time } = parseSessionStart(session.start_time);
  const now = new Date();

  // Absolute local trigger: session start − 10 minutes.
  const triggerDate = localDateAt(date, time);
  triggerDate.setMinutes(triggerDate.getMinutes() - 10);

  // Too soon (or already past) → skip reminder; start may still schedule.
  if (triggerDate <= now) return null;

  const topic = extractTopic(session.reason);
  const id = momentumNotificationId(
    "session_reminder",
    session.session_id,
    session.start_time,
  );

  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: "Session starting soon",
      body: `Work on ${topic} in 10 minutes`,
      data: {
        source: SOURCE,
        type: "session_reminder",
        sessionId: session.session_id,
        startTime: session.start_time,
        url: `/(today)/focus?sessionId=${session.session_id}&backlogItemId=${session.backlog_item_id}`,
      } satisfies MomentumNotificationData,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      channelId: CHANNELS.sessionReminders,
    },
  });

  return id;
}

// ─── Schedule Session Start ───

export async function scheduleSessionStart(
  session: PlanSession,
  completedIds: Set<string> = new Set(),
): Promise<string | null> {
  if (!isSessionEligible(session, completedIds)) return null;

  const { date, time } = parseSessionStart(session.start_time);
  const now = new Date();

  // Absolute local trigger at the session's intended start time.
  const triggerDate = localDateAt(date, time);
  if (triggerDate <= now) return null;

  const topic = extractTopic(session.reason);
  const id = momentumNotificationId(
    "session_start",
    session.session_id,
    session.start_time,
  );

  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: "Time to study!",
      body: `Your ${topic} session is starting now`,
      data: {
        source: SOURCE,
        type: "session_start",
        sessionId: session.session_id,
        startTime: session.start_time,
        url: `/(today)/focus?sessionId=${session.session_id}&backlogItemId=${session.backlog_item_id}`,
      } satisfies MomentumNotificationData,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      channelId: CHANNELS.sessionStart,
    },
  });

  return id;
}

// ─── Show Plan Changed ───

export async function showPlanChangedNotification(
  changes: PlanChange[],
): Promise<void> {
  if (changes.length === 0) return;

  const first = changes[0];
  const summary =
    changes.length === 1
      ? first.reason || `${first.title} was ${first.change_type}`
      : `${changes.length} sessions were updated`;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Your plan was updated",
      body: summary,
      data: {
        source: SOURCE,
        type: "plan_changed",
        url: "/(today)",
      } satisfies MomentumNotificationData,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(),
      channelId: CHANNELS.planChanges,
    },
  });
}

// ─── Reschedule Today ───

export async function rescheduleTodayNotifications(
  sessions: PlanSession[],
  completedIds: Set<string> = new Set(),
): Promise<void> {
  await cancelMomentumNotifications();

  for (const session of sessions) {
    await scheduleSessionReminder(session, completedIds);
    await scheduleSessionStart(session, completedIds);
  }
}

// ─── Get Scheduled Momentum Notifications ───

export async function getScheduledMomentumNotifications(): Promise<
  Notifications.NotificationRequest[]
> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all.filter((n) =>
    isMomentumNotification(n.content.data as Record<string, unknown>),
  );
}
