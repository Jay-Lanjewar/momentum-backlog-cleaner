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

export async function getPermissionState(): Promise<Notifications.NotificationPermissionsStatus> {
  return Notifications.getPermissionsAsync();
}

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

// ─── Identification ───

function momentumNotificationId(
  type: NotificationType,
  sessionId: string,
): string {
  return `momentum-${type}-${sessionId}`;
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

// ─── Scheduling Helpers ───

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
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
  const today = now.toISOString().slice(0, 10);
  const sessionDate = session.start_time.length > 5
    ? session.start_time.slice(0, 10)
    : today;

  if (sessionDate < today) return false;
  if (sessionDate > today) return true;

  const sessionStartMin = timeToMinutes(
    session.start_time.length > 5 ? session.start_time.slice(11) : session.start_time,
  );
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return sessionStartMin > nowMin;
}

// ─── Schedule Session Reminder ───

export async function scheduleSessionReminder(
  session: PlanSession,
  completedIds: Set<string> = new Set(),
): Promise<string | null> {
  if (!isSessionEligible(session, completedIds)) return null;

  const timeStr = session.start_time.length > 5
    ? session.start_time.slice(11)
    : session.start_time;
  const sessionStartMin = timeToMinutes(timeStr);
  const reminderMin = sessionStartMin - 10;

  if (reminderMin < 0) return null;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const [h, m] = timeStr.split(":").map(Number);

  const triggerDate = new Date(`${today}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
  triggerDate.setMinutes(triggerDate.getMinutes() - 10);

  if (triggerDate <= now) return null;

  const topic = extractTopic(session.reason);
  const id = momentumNotificationId("session_reminder", session.session_id);

  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: "Session starting soon",
      body: `Work on ${topic} in 10 minutes`,
      data: {
        source: SOURCE,
        type: "session_reminder",
        sessionId: session.session_id,
        url: "/(today)/focus",
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

  const timeStr = session.start_time.length > 5
    ? session.start_time.slice(11)
    : session.start_time;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const [h, m] = timeStr.split(":").map(Number);

  const triggerDate = new Date(`${today}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
  if (triggerDate <= now) return null;

  const topic = extractTopic(session.reason);
  const id = momentumNotificationId("session_start", session.session_id);

  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: "Time to study!",
      body: `Your ${topic} session is starting now`,
      data: {
        source: SOURCE,
        type: "session_start",
        sessionId: session.session_id,
        url: "/(today)/focus",
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
