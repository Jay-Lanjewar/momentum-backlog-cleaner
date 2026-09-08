import { renderHook, act } from "@testing-library/react-native";
import { useFocusLock } from "../hooks/useFocusLock";

// Mock Date.now for deterministic tests
let mockNow = 1000000000000;
const originalDateNow = Date.now;

beforeAll(() => {
  Date.now = () => mockNow;
});

afterAll(() => {
  Date.now = originalDateNow;
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
});
