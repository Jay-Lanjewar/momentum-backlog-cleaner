import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import {
  createNotificationChannels,
  getPermissionState,
  requestNotificationPermission,
  scheduleSessionReminder,
  scheduleSessionStart,
  showPlanChangedNotification,
  cancelMomentumNotifications,
  cancelSessionNotifications,
  rescheduleTodayNotifications,
  getScheduledMomentumNotifications,
  CHANNELS,
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

function futureTime(minutesFromNow: number): string {
  const d = new Date(Date.now() + minutesFromNow * 60 * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function futureDateTime(minutesFromNow: number): string {
  const d = new Date(Date.now() + minutesFromNow * 60 * 1000);
  const date = d.toISOString().slice(0, 10);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${date}T${time}`;
}

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = "android";
  (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(
    [],
  );
});

describe("createNotificationChannels", () => {
  it("creates all three Android channels", async () => {
    await createNotificationChannels();
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledTimes(3);
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
  it("returns true when permission is already granted", async () => {
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

  it("returns false when permission is denied", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: "denied",
    });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      status: "denied",
    });
    const result = await requestNotificationPermission();
    expect(result).toBe(false);
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
      start_time: "08:00",
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
      start_time: "08:00",
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

  it("includes correct deep link URL", async () => {
    const startTime = futureDateTime(20);
    const session = makeSession({
      session_id: "sess-url",
      start_time: startTime,
    });

    await scheduleSessionStart(session);

    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock
      .calls[0][0];
    expect(call.content.data.url).toBe("/(today)/focus");
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

describe("rescheduleTodayNotifications", () => {
  it("cancels old notifications and schedules new ones", async () => {
    const session = makeSession({
      session_id: "sess-3",
      start_time: futureDateTime(30),
    });

    await rescheduleTodayNotifications([session]);

    expect(
      Notifications.getAllScheduledNotificationsAsync,
    ).toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
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
