/**
 * Notification permission is requested on first authenticated Today entry
 * (via useNotificationScheduler), not on auth screens, and not repeatedly.
 */

import { renderHook, act } from "@testing-library/react-native";

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
  it("requests notification permission on first authenticated dashboard entry", async () => {
    mockDashboard = makeDashboard();

    await renderHook(() => useNotificationScheduler());

    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  });

  it("still requests permission when dashboard data has not loaded yet", async () => {
    mockDashboard = null;

    await renderHook(() => useNotificationScheduler());

    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  });

  it("does not re-request on dashboard refetch/query updates", async () => {
    mockDashboard = makeDashboard();

    const { rerender } = await renderHook(() => useNotificationScheduler());

    expect(mockRequestPermission).toHaveBeenCalledTimes(1);

    // Simulate a query refresh producing a new dashboard object
    mockDashboard = makeDashboard();
    await rerender(undefined);

    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  });

  it("does not block the dashboard when permission fails", async () => {
    mockDashboard = makeDashboard();
    mockRequestPermission.mockRejectedValue(new Error("permission failed"));

    await act(async () => {
      expect(() => renderHook(() => useNotificationScheduler())).not.toThrow();
    });

    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    // Scheduling still attempted after permission failure
    expect(mockReschedule).toHaveBeenCalled();
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
