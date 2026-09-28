/**
 * The scheduler never requests notification permission by itself.
 * Permission is requested only from the Today priming CTA / Settings row;
 * this hook's sole job is scheduling and rescheduling notifications.
 */

import { renderHook } from "@testing-library/react-native";

const mockRequestPermission = jest.fn().mockResolvedValue(true);
const mockReschedule = jest.fn();

let mockDashboard: any = null;

jest.mock("@/services/hooks", () => ({
  useDashboard: () => ({ data: mockDashboard }),
}));

jest.mock("@/services/notifications", () => ({
  requestNotificationPermission: (...args: unknown[]) =>
    mockRequestPermission(...args),
  rescheduleTodayNotifications: (...args: unknown[]) =>
    mockReschedule(...args),
  sessionScheduleKey: (sessionId: string, startTime: string) =>
    `${sessionId}:${startTime}`,
}));

import { useNotificationScheduler } from "@/hooks/useNotificationScheduler";

function makeDashboard() {
  return {
    plan: {
      plan: {
        sessions: [
          {
            session_id: "s1",
            backlog_item_id: "b1",
            start_time: "16:00",
            end_time: "17:00",
            reason: "Work on Motion",
            remaining_minutes: 60,
          },
        ],
        daily_message: "",
        overflow: [],
      },
      snapshot_id: "snap-1",
    },
    planning: {
      prioritized_backlog: [],
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestPermission.mockResolvedValue(true);
  mockDashboard = null;
});

describe("useNotificationScheduler permission entry", () => {
  it("does not request notification permission automatically on mount", async () => {
    mockDashboard = makeDashboard();

    await renderHook(() => useNotificationScheduler());

    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it("does not request permission while dashboard data has not loaded", async () => {
    mockDashboard = null;

    await renderHook(() => useNotificationScheduler());

    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockReschedule).not.toHaveBeenCalled();
  });

  it("does not invoke the permission request on dashboard refetch", async () => {
    mockDashboard = makeDashboard();

    const { rerender } = await renderHook(() => useNotificationScheduler());

    expect(mockRequestPermission).not.toHaveBeenCalled();

    // Simulate a query refresh producing a new dashboard object
    mockDashboard = makeDashboard();
    await rerender(undefined);

    expect(mockRequestPermission).not.toHaveBeenCalled();
    // Identity unchanged → scheduling is not repeated either
    expect(mockReschedule).toHaveBeenCalledTimes(1);
  });

  it("still schedules notifications on first dashboard entry without requesting permission", async () => {
    mockDashboard = makeDashboard();

    await renderHook(() => useNotificationScheduler());

    expect(mockReschedule).toHaveBeenCalledTimes(1);
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it("reschedules notifications only when session identity changes", async () => {
    mockDashboard = makeDashboard();

    const { rerender } = await renderHook(() => useNotificationScheduler());
    expect(mockReschedule).toHaveBeenCalledTimes(1);

    // Same session_id + same start_time → no second reschedule
    await rerender(undefined);
    expect(mockReschedule).toHaveBeenCalledTimes(1);

    // New session id → reschedule again
    mockDashboard = makeDashboard();
    mockDashboard.plan.plan.sessions[0].session_id = "s2";
    await rerender(undefined);
    expect(mockReschedule).toHaveBeenCalledTimes(2);
  });

  it("reschedules when the same session_id has a changed start_time", async () => {
    mockDashboard = makeDashboard();

    const { rerender } = await renderHook(() => useNotificationScheduler());
    expect(mockReschedule).toHaveBeenCalledTimes(1);

    // Replan: same session_id, start moves 17:30 → 18:15
    mockDashboard = makeDashboard();
    mockDashboard.plan.plan.sessions[0].start_time = "18:15";
    await rerender(undefined);

    expect(mockReschedule).toHaveBeenCalledTimes(2);
  });

  it("reschedules when the same session has a changed end_time", async () => {
    mockDashboard = makeDashboard();

    const { rerender } = await renderHook(() => useNotificationScheduler());
    expect(mockReschedule).toHaveBeenCalledTimes(1);

    // End moves → the missed-session trigger (end + grace) must be rebuilt.
    mockDashboard = makeDashboard();
    mockDashboard.plan.plan.sessions[0].end_time = "18:30";
    await rerender(undefined);

    expect(mockReschedule).toHaveBeenCalledTimes(2);
  });

  it("reschedules when the session's completion state changes", async () => {
    mockDashboard = makeDashboard();

    const { rerender } = await renderHook(() => useNotificationScheduler());
    expect(mockReschedule).toHaveBeenCalledTimes(1);

    // Same ids and times, but the backlog item is now completed.
    mockDashboard = makeDashboard();
    mockDashboard.planning.prioritized_backlog = [
      { id: "b1", status: "completed", course_name: "Physics" },
    ];
    await rerender(undefined);

    expect(mockReschedule).toHaveBeenCalledTimes(2);
  });

  it("threads sessions, completed ids, and the course map into reschedule", async () => {
    mockDashboard = makeDashboard();
    mockDashboard.planning.prioritized_backlog = [
      { id: "b1", status: "completed", course_name: "Physics" },
    ];

    await renderHook(() => useNotificationScheduler());

    expect(mockReschedule).toHaveBeenCalledTimes(1);
    const [sessions, completedIds, courses] = mockReschedule.mock.calls[0];
    expect(sessions).toHaveLength(1);
    expect(sessions[0].session_id).toBe("s1");
    expect(completedIds).toEqual(new Set(["s1"]));
    expect(courses.get("b1")).toBe("Physics");
  });

  it("does not reschedule when only unrelated dashboard fields change", async () => {
    mockDashboard = makeDashboard();

    const { rerender } = await renderHook(() => useNotificationScheduler());
    expect(mockReschedule).toHaveBeenCalledTimes(1);

    mockDashboard = makeDashboard();
    mockDashboard.plan.snapshot_id = "snap-2";
    await rerender(undefined);

    expect(mockReschedule).toHaveBeenCalledTimes(1);
  });
});
