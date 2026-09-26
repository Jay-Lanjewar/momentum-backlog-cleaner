import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import {
  createNotificationChannels,
  getPermissionState,
  requestNotificationPermission,
  resetNotificationPermissionSession,
  scheduleSessionReminder,
  scheduleSessionStart,
  scheduleSessionMissed,
  showPlanChangedNotification,
  cancelMomentumNotifications,
  cancelSessionNotifications,
  cancelSessionsNotifications,
  rescheduleTodayNotifications,
  getScheduledMomentumNotifications,
  localDateString,
  sessionScheduleKey,
  CHANNELS,
  MISSED_GRACE_MINUTES,
} from "@/services/notifications";
import type { PlanSession, PlanChange } from "@/services/types";

function makeSession(
  overrides: Partial<PlanSession> & { session_id: string; start_time: string },
): PlanSession {
  return {
    backlog_item_id: "item-1",
    end_time: "10:00",
    reason: "Work on Physics",
    remaining_minutes: 60,
    ...overrides,
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function localTimeStr(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function futureTime(minutesFromNow: number): string {
  return localTimeStr(new Date(Date.now() + minutesFromNow * 60 * 1000));
}

/** Local calendar date + local clock time (never UTC date + local time). */
function futureDateTime(minutesFromNow: number): string {
  const d = new Date(Date.now() + minutesFromNow * 60 * 1000);
  return `${localDateStr(d)}T${localTimeStr(d)}`;
}

function pastDateTime(minutesAgo: number): string {
  const d = new Date(Date.now() - minutesAgo * 60 * 1000);
  return `${localDateStr(d)}T${localTimeStr(d)}`;
}

function shiftLocalDays(days: number, time = "16:00"): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${localDateStr(d)}T${time}`;
}

function scheduledCalls(): any[] {
  return (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.map(
    (c) => c[0],
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  resetNotificationPermissionSession();
  Platform.OS = "android";
  (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(
    [],
  );
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
    status: "undetermined",
  });
  (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
    status: "granted",
  });
});

describe("createNotificationChannels", () => {
  it("creates all four Android channels", async () => {
    await createNotificationChannels();
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledTimes(4);
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      CHANNELS.sessionReminders,
      expect.objectContaining({ name: "Session Reminders" }),
    );
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      CHANNELS.sessionStart,
      expect.objectContaining({ name: "Session Start" }),
    );
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      CHANNELS.planChanges,
      expect.objectContaining({ name: "Plan Changes" }),
    );
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      CHANNELS.missedSessions,
      expect.objectContaining({
        name: "Missed Sessions",
        importance: Notifications.AndroidImportance.HIGH,
      }),
    );
  });
});

describe("getPermissionState", () => {
  it("returns current permission status", async () => {
    const result = await getPermissionState();
    expect(Notifications.getPermissionsAsync).toHaveBeenCalled();
    expect(result).toEqual({ status: "undetermined" });
  });
});

describe("requestNotificationPermission", () => {
  it("returns true when permission is already granted without prompting", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: "granted",
    });
    const result = await requestNotificationPermission();
    expect(result).toBe(true);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("requests permission when undetermined", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: "undetermined",
    });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      status: "granted",
    });
    const result = await requestNotificationPermission();
    expect(result).toBe(true);
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
  });

  it("returns false and does not re-prompt when already denied", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: "denied",
    });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      status: "denied",
    });
    const result = await requestNotificationPermission();
    expect(result).toBe(false);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("does not request again on subsequent dashboard entries in the same session", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: "undetermined",
    });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      status: "denied",
    });

    await requestNotificationPermission();
    await requestNotificationPermission();
    await requestNotificationPermission();

    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it("is non-blocking when permission APIs fail", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockRejectedValue(
      new Error("permission API unavailable"),
    );

    await expect(requestNotificationPermission()).resolves.toBe(false);
  });

  it("does not throw when the system request fails", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: "undetermined",
    });
    (Notifications.requestPermissionsAsync as jest.Mock).mockRejectedValue(
      new Error("request failed"),
    );

    await expect(requestNotificationPermission()).resolves.toBe(false);
  });
});

describe("scheduleSessionReminder", () => {
  it("schedules a reminder 10 minutes before session", async () => {
    const startTime = futureDateTime(30);
    const session = makeSession({
      session_id: "sess-1",
      start_time: startTime,
    });

    const id = await scheduleSessionReminder(session);

    expect(id).toBeTruthy();
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: "Session starting soon",
          body: expect.stringContaining("Physics"),
        }),
        trigger: expect.objectContaining({
          channelId: CHANNELS.sessionReminders,
        }),
      }),
    );
  });

  it("returns null for past sessions", async () => {
    const session = makeSession({
      session_id: "sess-past",
      start_time: pastDateTime(120),
    });

    const id = await scheduleSessionReminder(session);
    expect(id).toBeNull();
  });

  it("returns null for completed sessions", async () => {
    const startTime = futureDateTime(30);
    const session = makeSession({
      session_id: "sess-done",
      start_time: startTime,
    });
    const completedIds = new Set(["sess-done"]);

    const id = await scheduleSessionReminder(session, completedIds);
    expect(id).toBeNull();
  });

  it("extracts topic from 'Work on X' reason", async () => {
    const startTime = futureDateTime(30);
    const session = makeSession({
      session_id: "sess-topic",
      start_time: startTime,
      reason: "Work on Calculus",
    });

    await scheduleSessionReminder(session);

    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock
      .calls[0][0];
    expect(call.content.body).toContain("Calculus");
  });

  it("uses original reason when not 'Work on X' format", async () => {
    const startTime = futureDateTime(30);
    const session = makeSession({
      session_id: "sess-plain",
      start_time: startTime,
      reason: "Read textbook chapter 5",
    });

    await scheduleSessionReminder(session);

    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock
      .calls[0][0];
    expect(call.content.body).toContain("Read textbook chapter 5");
  });
});

describe("scheduleSessionStart", () => {
  it("schedules a start notification at session time", async () => {
    const startTime = futureDateTime(20);
    const session = makeSession({
      session_id: "sess-2",
      start_time: startTime,
    });

    const id = await scheduleSessionStart(session);

    expect(id).toBeTruthy();
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: "Time to study!",
          body: expect.stringContaining("Physics"),
        }),
        trigger: expect.objectContaining({
          channelId: CHANNELS.sessionStart,
        }),
      }),
    );
  });

  it("returns null for past sessions", async () => {
    const session = makeSession({
      session_id: "sess-past",
      start_time: pastDateTime(120),
    });

    const id = await scheduleSessionStart(session);
    expect(id).toBeNull();
  });

  it("returns null for completed sessions", async () => {
    const startTime = futureDateTime(20);
    const session = makeSession({
      session_id: "sess-done",
      start_time: startTime,
    });
    const completedIds = new Set(["sess-done"]);

    const id = await scheduleSessionStart(session, completedIds);
    expect(id).toBeNull();
  });

  it("includes correct deep link URL with query params", async () => {
    const startTime = futureDateTime(20);
    const session = makeSession({
      session_id: "sess-url",
      backlog_item_id: "item-url",
      start_time: startTime,
    });

    await scheduleSessionStart(session);

    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock
      .calls[0][0];
    expect(call.content.data.url).toBe(
      "/(today)/focus?sessionId=sess-url&backlogItemId=item-url",
    );
  });
});

describe("showPlanChangedNotification", () => {
  it("shows notification when changes exist", async () => {
    const changes: PlanChange[] = [
      {
        session_id: "s1",
        backlog_item_id: "b1",
        title: "Physics",
        change_type: "rescheduled",
        previous_start: "10:00",
        previous_end: "11:00",
        new_start: "11:00",
        new_end: "12:00",
        reason: "Physics was rescheduled to a later time.",
      },
    ];

    await showPlanChangedNotification(changes);

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: "Your plan was updated",
          body: "Physics was rescheduled to a later time.",
        }),
      }),
    );
  });

  it("does not show notification when changes are empty", async () => {
    await showPlanChangedNotification([]);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("shows count for multiple changes", async () => {
    const changes: PlanChange[] = [
      {
        session_id: "s1",
        backlog_item_id: "b1",
        title: "Physics",
        change_type: "rescheduled",
        previous_start: "10:00",
        previous_end: "11:00",
        new_start: "11:00",
        new_end: "12:00",
        reason: "",
      },
      {
        session_id: "s2",
        backlog_item_id: "b2",
        title: "Math",
        change_type: "moved_to_overflow",
        previous_start: "12:00",
        previous_end: "13:00",
        new_start: null,
        new_end: null,
        reason: "",
      },
    ];

    await showPlanChangedNotification(changes);

    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock
      .calls[0][0];
    expect(call.content.body).toContain("2 sessions");
  });
});

describe("cancelMomentumNotifications", () => {
  it("cancels only momentum-owned notifications", async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(
      [
        {
          identifier: "momentum-session_reminder-sess-1",
          content: {
            data: {
              source: "momentum",
              type: "session_reminder",
              sessionId: "sess-1",
              url: "/(today)/focus",
            },
          },
        },
        {
          identifier: "other-notification",
          content: { data: { source: "other", type: "test" } },
        },
      ],
    );

    await cancelMomentumNotifications();

    expect(
      Notifications.cancelScheduledNotificationAsync,
    ).toHaveBeenCalledWith("momentum-session_reminder-sess-1");
    expect(
      Notifications.cancelScheduledNotificationAsync,
    ).not.toHaveBeenCalledWith("other-notification");
  });
});

describe("cancelSessionNotifications", () => {
  it("cancels notifications for a specific session", async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(
      [
        {
          identifier: "momentum-session_reminder-sess-1",
          content: {
            data: {
              source: "momentum",
              type: "session_reminder",
              sessionId: "sess-1",
              url: "/(today)/focus",
            },
          },
        },
        {
          identifier: "momentum-session_start-sess-1",
          content: {
            data: {
              source: "momentum",
              type: "session_start",
              sessionId: "sess-1",
              url: "/(today)/focus",
            },
          },
        },
        {
          identifier: "momentum-session_reminder-sess-2",
          content: {
            data: {
              source: "momentum",
              type: "session_reminder",
              sessionId: "sess-2",
              url: "/(today)/focus",
            },
          },
        },
      ],
    );

    await cancelSessionNotifications("sess-1");

    expect(
      Notifications.cancelScheduledNotificationAsync,
    ).toHaveBeenCalledWith("momentum-session_reminder-sess-1");
    expect(
      Notifications.cancelScheduledNotificationAsync,
    ).toHaveBeenCalledWith("momentum-session_start-sess-1");
    expect(
      Notifications.cancelScheduledNotificationAsync,
    ).not.toHaveBeenCalledWith("momentum-session_reminder-sess-2");
  });
});

describe("cancelSessionsNotifications", () => {
  it("cancels reminder, start, and missed for every listed session in one pass", async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(
      [
        {
          identifier: "momentum-session_reminder-s1",
          content: {
            data: {
              source: "momentum",
              type: "session_reminder",
              sessionId: "s1",
              url: "/(today)",
            },
          },
        },
        {
          identifier: "momentum-session_start-s1",
          content: {
            data: {
              source: "momentum",
              type: "session_start",
              sessionId: "s1",
              url: "/(today)",
            },
          },
        },
        {
          identifier: "momentum-session_missed-s1",
          content: {
            data: {
              source: "momentum",
              type: "session_missed",
              sessionId: "s1",
              url: "/(today)",
            },
          },
        },
        {
          identifier: "momentum-session_reminder-s2",
          content: {
            data: {
              source: "momentum",
              type: "session_reminder",
              sessionId: "s2",
              url: "/(today)",
            },
          },
        },
        {
          identifier: "momentum-session_reminder-s3",
          content: {
            data: {
              source: "momentum",
              type: "session_reminder",
              sessionId: "s3",
              url: "/(today)",
            },
          },
        },
        {
          identifier: "other-notification",
          content: { data: { source: "other" } },
        },
      ],
    );

    await cancelSessionsNotifications(["s1", "s2"]);

    // One read of the scheduled list covers all sessions and all three types.
    expect(
      Notifications.getAllScheduledNotificationsAsync,
    ).toHaveBeenCalledTimes(1);
    const cancelled = (
      Notifications.cancelScheduledNotificationAsync as jest.Mock
    ).mock.calls.map((c) => c[0]);
    expect(cancelled).toEqual([
      "momentum-session_reminder-s1",
      "momentum-session_start-s1",
      "momentum-session_missed-s1",
      "momentum-session_reminder-s2",
    ]);
  });

  it("does not touch the scheduled list for an empty session list", async () => {
    await cancelSessionsNotifications([]);
    expect(
      Notifications.getAllScheduledNotificationsAsync,
    ).not.toHaveBeenCalled();
    expect(
      Notifications.cancelScheduledNotificationAsync,
    ).not.toHaveBeenCalled();
  });
});

describe("scheduleSessionMissed", () => {
  it("fires 5 minutes after the session ends on the missed-sessions channel", async () => {
    const now = new Date();
    // Near midnight the clock-only end time can land before the dated start.
    if (now.getHours() * 60 + now.getMinutes() >= 1380) return;

    const start = futureDateTime(30);
    const end = futureDateTime(45);
    const session = makeSession({
      session_id: "miss-1",
      start_time: start,
      end_time: end,
    });

    const id = await scheduleSessionMissed(session);

    expect(id).toMatch(/^momentum-session_missed-miss-1-\d+$/);
    const call = scheduledCalls()[0];
    expect(call.identifier).toBe(id);
    expect(call.content.title).toBe("Missed session");
    expect(call.content.body).toBe(
      "Physics — You didn't get to this session. Momentum will adjust your plan.",
    );
    expect(call.content.data).toEqual({
      source: "momentum",
      type: "session_missed",
      sessionId: "miss-1",
      startTime: start,
      url: "/(today)",
    });
    expect(call.trigger.type).toBe(
      Notifications.SchedulableTriggerInputTypes.DATE,
    );
    expect(call.trigger.channelId).toBe(CHANNELS.missedSessions);
    expect(call.trigger.date.getTime()).toBe(
      new Date(new Date(end).getTime() + MISSED_GRACE_MINUTES * 60_000).getTime(),
    );
  });

  it("prefixes the course name when the backlog map provides one", async () => {
    const now = new Date();
    if (now.getHours() * 60 + now.getMinutes() >= 1380) return;

    const session = makeSession({
      session_id: "miss-course",
      start_time: futureDateTime(30),
      end_time: futureDateTime(45),
    });

    await scheduleSessionMissed(
      session,
      new Set(),
      new Map([["item-1", "Mathematics"]]),
    );

    const call = scheduledCalls()[0];
    expect(call.content.body).toContain("Mathematics · Physics");
  });

  it("does not schedule for completed sessions", async () => {
    const id = await scheduleSessionMissed(
      makeSession({
        session_id: "miss-done",
        start_time: futureDateTime(30),
        end_time: futureDateTime(45),
      }),
      new Set(["miss-done"]),
    );

    expect(id).toBeNull();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("does not schedule for a session on a past local day", async () => {
    const session = makeSession({
      session_id: "miss-yesterday",
      start_time: shiftLocalDays(-1, "16:00"),
      end_time: shiftLocalDays(-1, "17:00"),
    });

    expect(await scheduleSessionMissed(session)).toBeNull();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("does not schedule once the session has ended, even inside the grace window", async () => {
    const now = new Date();
    // Keep both timestamps on today's calendar date (end is 2 minutes ago).
    if (now.getHours() * 60 + now.getMinutes() < 30) return;

    const session = makeSession({
      session_id: "miss-ended",
      start_time: pastDateTime(30),
      end_time: pastDateTime(2),
    });

    // end + 5 min would still be in the future, but the session is already
    // over: the scheduler must never plant a stale catch-up notification.
    expect(await scheduleSessionMissed(session)).toBeNull();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("schedules for a session that is already in progress", async () => {
    const now = new Date();
    if (now.getHours() * 60 + now.getMinutes() >= 1438) return;

    const session = makeSession({
      session_id: "miss-live",
      start_time: `${localDateString()}T00:05`,
      end_time: `${localDateString()}T23:59`,
    });

    const id = await scheduleSessionMissed(session);

    expect(id).toBeTruthy();
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it("keeps one deterministic identifier across repeat scheduling", async () => {
    const now = new Date();
    if (now.getHours() * 60 + now.getMinutes() >= 1380) return;

    const session = makeSession({
      session_id: "miss-det",
      start_time: futureDateTime(30),
      end_time: futureDateTime(45),
    });

    const id1 = await scheduleSessionMissed(session);
    const id2 = await scheduleSessionMissed(session);

    expect(id1).toBeTruthy();
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^momentum-session_missed-miss-det-\d+$/);
  });
});

describe("rescheduleTodayNotifications", () => {
  it("cancels old notifications and schedules reminder + start + missed", async () => {
    const now = new Date();
    // Near midnight the clock-only end time can land before the dated start.
    if (now.getHours() * 60 + now.getMinutes() >= 1380) return;

    const session = makeSession({
      session_id: "sess-3",
      start_time: futureDateTime(30),
      end_time: futureDateTime(45),
    });

    await rescheduleTodayNotifications([session]);

    expect(
      Notifications.getAllScheduledNotificationsAsync,
    ).toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(3);
  });

  it("does not schedule for completed sessions", async () => {
    const session = makeSession({
      session_id: "sess-4",
      start_time: futureDateTime(30),
    });
    const completedIds = new Set(["sess-4"]);

    await rescheduleTodayNotifications([session], completedIds);

    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("threads the course map into the missed-session body", async () => {
    const now = new Date();
    if (now.getHours() * 60 + now.getMinutes() >= 1380) return;

    const session = makeSession({
      session_id: "sess-course",
      start_time: futureDateTime(30),
      end_time: futureDateTime(45),
    });

    await rescheduleTodayNotifications(
      [session],
      new Set(),
      new Map([["item-1", "Physics II"]]),
    );

    const missed = scheduledCalls().find(
      (c) => c.content.data.type === "session_missed",
    );
    expect(missed).toBeTruthy();
    expect(missed.content.body).toContain("Physics II · Physics");
  });
});

describe("getScheduledMomentumNotifications", () => {
  it("returns only momentum-owned notifications", async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(
      [
        {
          identifier: "momentum-1",
          content: {
            data: {
              source: "momentum",
              type: "session_reminder",
              url: "/(today)/focus",
            },
          },
        },
        {
          identifier: "other-1",
          content: { data: { source: "other" } },
        },
      ],
    );

    const result = await getScheduledMomentumNotifications();
    expect(result).toHaveLength(1);
    expect(result[0].identifier).toBe("momentum-1");
  });
});

// ─── C10: local date eligibility + session_id+start_time identity ───

describe("local date eligibility (C10)", () => {
  it("localDateString uses device-local Y-M-D, not UTC", () => {
    const d = new Date(2026, 0, 1, 0, 30, 0); // Jan 1 local, still Dec 31 UTC in many TZs
    expect(localDateString(d)).toBe("2026-01-01");
  });

  it("today's session schedules with a local-date trigger", async () => {
    const start = futureDateTime(45);
    const session = makeSession({
      session_id: "today-1",
      start_time: start,
    });

    const reminderId = await scheduleSessionReminder(session);
    const startId = await scheduleSessionStart(session);

    expect(reminderId).toBeTruthy();
    expect(startId).toBeTruthy();

    const calls = scheduledCalls();
    expect(calls).toHaveLength(2);

    for (const call of calls) {
      const triggerDate: Date = call.trigger.date;
      expect(localDateStr(triggerDate)).toBe(localDateString());
    }

    // Start trigger is local today at the session clock time
    const startCall = calls.find((c) => c.content.data.type === "session_start");
    const [h, m] = start.split("T")[1].split(":").map(Number);
    // same local day as now (futureDateTime(45) could roll past midnight —
    // only assert clock components when date matches today)
    if (localDateStr(startCall.trigger.date) === localDateString()) {
      expect(startCall.trigger.date.getHours()).toBe(h);
      expect(startCall.trigger.date.getMinutes()).toBe(m);
    }
  });

  it("yesterday's session does not schedule as today's notification", async () => {
    const session = makeSession({
      session_id: "yesterday-1",
      start_time: shiftLocalDays(-1, "16:00"),
    });

    expect(await scheduleSessionReminder(session)).toBeNull();
    expect(await scheduleSessionStart(session)).toBeNull();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("tomorrow's session does not schedule using today's local date", async () => {
    const tomorrowTime = "16:00";
    const session = makeSession({
      session_id: "tomorrow-1",
      start_time: shiftLocalDays(1, tomorrowTime),
    });

    const id = await scheduleSessionStart(session);
    expect(id).toBeTruthy();

    const call = scheduledCalls()[0];
    const trigger: Date = call.trigger.date;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    expect(localDateStr(trigger)).toBe(localDateStr(tomorrow));
    expect(trigger.getHours()).toBe(16);
    expect(trigger.getMinutes()).toBe(0);
    // Must not be stamped as "today"
    if (localDateString() !== localDateStr(tomorrow)) {
      expect(localDateStr(trigger)).not.toBe(localDateString());
    }
  });

  it("tomorrow's early-morning session is not evaluated as past by today's clock", async () => {
    // A 00:30 session tomorrow would look "past" if compared to today's HH:MM
    // minutes only — eligibility must use the calendar date first.
    const session = makeSession({
      session_id: "tomorrow-early",
      start_time: shiftLocalDays(1, "00:30"),
    });

    expect(await scheduleSessionStart(session)).toBeTruthy();
    const call = scheduledCalls()[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(localDateStr(call.trigger.date)).toBe(localDateStr(tomorrow));
    expect(call.trigger.date.getHours()).toBe(0);
    expect(call.trigger.date.getMinutes()).toBe(30);
  });

  it("session exactly at current local minute is not eligible", async () => {
    const now = new Date();
    const nowBare = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    const session = makeSession({
      session_id: "now-exact",
      start_time: nowBare,
    });

    expect(await scheduleSessionReminder(session)).toBeNull();
    expect(await scheduleSessionStart(session)).toBeNull();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("session 15 minutes in the future gets reminder + start", async () => {
    const session = makeSession({
      session_id: "plus15",
      start_time: futureDateTime(15),
    });

    expect(await scheduleSessionReminder(session)).toBeTruthy();
    expect(await scheduleSessionStart(session)).toBeTruthy();
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  });

  it("too-soon session (start in 5 min) skips reminder but may schedule start", async () => {
    const session = makeSession({
      session_id: "plus5",
      start_time: futureDateTime(5),
    });

    // Reminder would fire in the past (start − 10) → skipped
    expect(await scheduleSessionReminder(session)).toBeNull();

    // Start is still in the future → schedules
    expect(await scheduleSessionStart(session)).toBeTruthy();
  });

  it("completed session does not schedule", async () => {
    const session = makeSession({
      session_id: "done-1",
      start_time: futureDateTime(30),
    });

    expect(
      await scheduleSessionReminder(session, new Set(["done-1"])),
    ).toBeNull();
    expect(
      await scheduleSessionStart(session, new Set(["done-1"])),
    ).toBeNull();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("bare HH:MM today in the future schedules with local today date", async () => {
    const futureBare = futureTime(90);
    // Skip if the bare time already passed (shouldn't for +90min except rare TZ)
    const [h, m] = futureBare.split(":").map(Number);
    const now = new Date();
    if (h * 60 + m <= now.getHours() * 60 + now.getMinutes()) {
      return;
    }

    const session = makeSession({
      session_id: "bare-future",
      start_time: futureBare,
    });

    const id = await scheduleSessionStart(session);
    expect(id).toBeTruthy();
    const call = scheduledCalls()[0];
    expect(localDateStr(call.trigger.date)).toBe(localDateString());
    expect(call.trigger.date.getHours()).toBe(h);
    expect(call.trigger.date.getMinutes()).toBe(m);
  });
});

describe("notification identity includes session_id + start_time (C10)", () => {
  it("sessionScheduleKey distinguishes start_time changes", () => {
    expect(sessionScheduleKey("s1", "17:30")).toBe("s1:17:30");
    expect(sessionScheduleKey("s1", "18:15")).toBe("s1:18:15");
    expect(sessionScheduleKey("s1", "17:30")).not.toBe(
      sessionScheduleKey("s1", "18:15"),
    );
  });

  it("same session_id with changed start_time uses a different notification id", async () => {
    const a = makeSession({
      session_id: "s1",
      start_time: futureDateTime(60),
    });
    const idA = await scheduleSessionStart(a);

    jest.clearAllMocks();
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(
      [],
    );

    const b = makeSession({
      session_id: "s1",
      start_time: futureDateTime(90),
    });
    const idB = await scheduleSessionStart(b);

    expect(idA).toBeTruthy();
    expect(idB).toBeTruthy();
    expect(idA).not.toBe(idB);
    // Identity format: momentum-<type>-<sessionId>-<digits of start_time>
    expect(idB).toMatch(/^momentum-session_start-s1-\d+$/);
  });

  it("same session_id + unchanged start_time keeps a stable id", async () => {
    const start = futureDateTime(45);
    const id1 = await scheduleSessionStart(
      makeSession({ session_id: "s-stable", start_time: start }),
    );
    jest.clearAllMocks();
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(
      [],
    );
    const id2 = await scheduleSessionStart(
      makeSession({ session_id: "s-stable", start_time: start }),
    );
    expect(id1).toBe(id2);
  });

  it("replan with changed time cancels stale notification then schedules new", async () => {
    const oldStart = futureDateTime(45);
    const oldSession = makeSession({
      session_id: "s-replan",
      start_time: oldStart,
    });
    const oldId = await scheduleSessionStart(oldSession);
    expect(oldId).toBeTruthy();

    // Simulate the OS holding the old notification
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(
      [
        {
          identifier: oldId,
          content: {
            data: {
              source: "momentum",
              type: "session_start",
              sessionId: "s-replan",
              startTime: oldStart,
              url: "/(today)/focus",
            },
          },
        },
      ],
    );

    const newStart = futureDateTime(75);
    const newSession = makeSession({
      session_id: "s-replan",
      start_time: newStart,
    });

    jest.clearAllMocks();
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(
      [
        {
          identifier: oldId,
          content: {
            data: {
              source: "momentum",
              type: "session_start",
              sessionId: "s-replan",
              startTime: oldStart,
              url: "/(today)/focus",
            },
          },
        },
      ],
    );

    await rescheduleTodayNotifications([newSession]);

    // Old momentum notification cancelled (not cancelAll)
    expect(
      Notifications.cancelScheduledNotificationAsync,
    ).toHaveBeenCalledWith(oldId);
    expect(
      Notifications.cancelAllScheduledNotificationsAsync,
    ).not.toHaveBeenCalled();

    // New notification scheduled with new identity/time
    const newCalls = scheduledCalls();
    expect(newCalls.length).toBeGreaterThan(0);
    const newId = newCalls[0].identifier;
    expect(newId).not.toBe(oldId);
    expect(newCalls[0].content.data.startTime).toBe(newStart);
  });

  it("deep-link URL is unchanged for new identity format", async () => {
    const session = makeSession({
      session_id: "sess-link",
      backlog_item_id: "item-9",
      start_time: futureDateTime(30),
    });

    await scheduleSessionReminder(session);
    const call = scheduledCalls()[0];
    expect(call.content.data.url).toBe(
      "/(today)/focus?sessionId=sess-link&backlogItemId=item-9",
    );
    expect(call.content.data.sessionId).toBe("sess-link");
    expect(call.content.data.source).toBe("momentum");
  });
});
