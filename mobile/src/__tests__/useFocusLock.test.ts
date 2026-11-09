import { renderHook, act } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
import { useFocusLock } from "../hooks/useFocusLock";

// Mock Date.now for deterministic tests
let mockNow = 1000000000000;
const originalDateNow = Date.now;

beforeAll(() => {
  Date.now = () => mockNow;
  jest.spyOn(performance, "now").mockImplementation(() => mockNow);
});

afterAll(() => {
  Date.now = originalDateNow;
  jest.restoreAllMocks();
});

beforeEach(() => {
  mockNow = 1000000000000;
});

describe("useFocusLock", () => {
  const totalMs = 25 * 60 * 1000; // 25 minutes

  it("starts in entering phase and transitions to focusing", async () => {
    const hookResult = await renderHook(() => useFocusLock(totalMs));
    await act(async () => {});
    expect(hookResult.result.current.phase).toBe("focusing");
  });

  it("waits for session identity before starting the focus timer", async () => {
    let enabled = false;
    const hookResult = await renderHook(() =>
      useFocusLock(10 * 60 * 1000, enabled),
    );
    expect(hookResult.result.current.phase).toBe("entering");
    expect(hookResult.result.current.focusedElapsedMs).toBe(0);

    await act(async () => {
      hookResult.rerender(undefined);
    });
    expect(hookResult.result.current.phase).toBe("entering");

    await act(async () => {
      enabled = true;
      hookResult.rerender(undefined);
    });
    expect(hookResult.result.current.phase).toBe("focusing");
  });

  it("tracks elapsed time based on timestamps", async () => {
    const hookResult = await renderHook(() => useFocusLock(totalMs));
    await act(async () => {});
    expect(hookResult.result.current.phase).toBe("focusing");

    // Advance time by 5 minutes
    mockNow += 5 * 60 * 1000;
    await act(async () => hookResult.result.current.pause());
    expect(hookResult.result.current.focusedElapsedMs).toBe(5 * 60 * 1000);

    await act(async () => hookResult.result.current.resume());
    mockNow += 3 * 60 * 1000;
    await act(async () => hookResult.result.current.pause());
    expect(hookResult.result.current.focusedElapsedMs).toBe(8 * 60 * 1000);
  });

  it("calculates remaining time correctly", async () => {
    const hookResult = await renderHook(() => useFocusLock(totalMs));
    await act(async () => {});
    mockNow += 10 * 60 * 1000;
    await act(async () => hookResult.result.current.pause());
    expect(hookResult.result.current.remainingMs).toBe(15 * 60 * 1000);
  });

  it("pauses and resumes correctly", async () => {
    const hookResult = await renderHook(() => useFocusLock(totalMs));
    await act(async () => {});

    await act(async () => hookResult.result.current.pause());
    expect(hookResult.result.current.phase).toBe("paused_by_user");

    // Time should not advance while paused
    mockNow += 5 * 60 * 1000;
    expect(hookResult.result.current.focusedElapsedMs).toBe(0);

    await act(async () => hookResult.result.current.resume());
    expect(hookResult.result.current.phase).toBe("focusing");
  });

  it("does not count time spent in a paused challenge interval", async () => {
    const hookResult = await renderHook(() => useFocusLock(totalMs));
    await act(async () => {});
    mockNow += 2 * 60 * 1000;
    await act(async () => hookResult.result.current.pause());
    mockNow += 45_000;
    expect(hookResult.result.current.focusedElapsedMs).toBe(2 * 60 * 1000);
    await act(async () => hookResult.result.current.resume());
    mockNow += 30_000;
    await act(async () => hookResult.result.current.pause());
    expect(hookResult.result.current.focusedElapsedMs).toBe(2 * 60 * 1000 + 30_000);
  });

  it("excludes background time from elapsed calculation", async () => {
    const hookResult = await renderHook(() => useFocusLock(totalMs));
    await act(async () => {});

    // Simulate 3 minutes of focused work
    mockNow += 3 * 60 * 1000;

    // Simulate background pause
    await act(async () => hookResult.result.current.pause());
    expect(hookResult.result.current.focusedElapsedMs).toBe(3 * 60 * 1000);

    // Time passes while in background — should NOT count
    mockNow += 10 * 60 * 1000;

    // Still paused — elapsed unchanged
    expect(hookResult.result.current.focusedElapsedMs).toBe(3 * 60 * 1000);

    // Resume
    await act(async () => hookResult.result.current.resume());
    expect(hookResult.result.current.phase).toBe("focusing");

    // More focused time
    mockNow += 2 * 60 * 1000;
    await act(async () => hookResult.result.current.pause());
    expect(hookResult.result.current.focusedElapsedMs).toBe(5 * 60 * 1000);
  });

  it("complete freezes elapsed time", async () => {
    const hookResult = await renderHook(() => useFocusLock(totalMs));
    await act(async () => {});
    mockNow += 12 * 60 * 1000;
    await act(async () => hookResult.result.current.complete());
    expect(hookResult.result.current.phase).toBe("complete");
    expect(hookResult.result.current.focusedElapsedMs).toBe(12 * 60 * 1000);

    // Time advancing after complete should not affect elapsed
    mockNow += 5 * 60 * 1000;
    expect(hookResult.result.current.focusedElapsedMs).toBe(12 * 60 * 1000);
  });

  it("reset clears all state", async () => {
    const hookResult = await renderHook(() => useFocusLock(totalMs));
    await act(async () => {});
    mockNow += 5 * 60 * 1000;
    await act(async () => hookResult.result.current.pause());
    await act(async () => hookResult.result.current.reset());
    // reset() sets "entering", then the effect auto-transitions to "focusing"
    expect(hookResult.result.current.phase).toBe("focusing");
    expect(hookResult.result.current.focusedElapsedMs).toBe(0);
    expect(hookResult.result.current.remainingMs).toBe(totalMs);
  });

  it("recovers running and challenge sessions paused without counting process downtime", async () => {
    const identity = { userId: "student-a", sessionId: "session-a", snapshotId: "snapshot-a", generation: "generation-00000001" };
    const record = {
      version: 1 as const, ...identity, totalDurationMs: totalMs,
      accumulatedMs: 120_000, state: "challenge_active" as const,
      updatedAt: new Date().toISOString(),
    };
    const hook = await renderHook(() => useFocusLock(totalMs, true, { identity, record }));
    await act(async () => {});
    expect(hook.result.current.phase).toBe("recovery_pending");
    expect(hook.result.current.focusedElapsedMs).toBe(120_000);
    mockNow += 60 * 60 * 1000;
    expect(hook.result.current.focusedElapsedMs).toBe(120_000);
    await act(async () => hook.result.current.resume());
    mockNow += 30_000;
    await act(async () => hook.result.current.pause());
    expect(hook.result.current.focusedElapsedMs).toBe(150_000);
  });

  it("persists completion intent and restores the same completion minutes", async () => {
    const identity = { userId: "student-a", sessionId: "session-b", snapshotId: "snapshot-a", generation: "generation-00000002" };
    const hook = await renderHook(() => useFocusLock(totalMs, true, { identity, record: null }));
    await act(async () => {});
    mockNow += 121_000;
    await act(async () => hook.result.current.markCompletionPending(3));
    expect(hook.result.current.phase).toBe("completion_pending");
    expect(hook.result.current.completionMinutes).toBe(3);
  });

  it("uses monotonic time even when wall clock changes", async () => {
    const hook = await renderHook(() => useFocusLock(totalMs));
    await act(async () => {});
    mockNow += 75_000;
    Date.now = () => mockNow - 24 * 60 * 60 * 1000;
    await act(async () => hook.result.current.pause());
    expect(hook.result.current.focusedElapsedMs).toBe(75_000);
  });

  it("checkpoints on background and requires explicit foreground resume", async () => {
    let listener: ((state: AppStateStatus) => void) | undefined;
    const spy = jest.spyOn(AppState, "addEventListener").mockImplementation(((_event, callback) => {
      listener = callback;
      return { remove: jest.fn() };
    }) as typeof AppState.addEventListener);
    const hook = await renderHook(() => useFocusLock(totalMs));
    await act(async () => {});
    mockNow += 45_000;
    await act(async () => listener?.("background"));
    expect(hook.result.current.phase).toBe("paused_lost_focus");
    expect(hook.result.current.focusedElapsedMs).toBe(45_000);
    mockNow += 90_000;
    await act(async () => listener?.("active"));
    expect(hook.result.current.phase).toBe("focus_returned");
    expect(hook.result.current.focusedElapsedMs).toBe(45_000);
    spy.mockRestore();
  });
});
