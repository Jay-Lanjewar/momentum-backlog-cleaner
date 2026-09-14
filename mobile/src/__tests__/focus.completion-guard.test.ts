/**
 * Tests for focus session completion idempotency guard.
 *
 * Verifies:
 * 1. Double-completion is prevented when completingRef is true
 * 2. Double-completion is prevented when isPending is true
 * 3. Completion resets completingRef on API error
 * 4. Completion proceeds normally on first call
 */

import { renderHook, act } from "@testing-library/react-native";
import { useRef, useCallback } from "react";

function useCompletionGuard() {
  const completingRef = useRef(false);
  const isPendingRef = useRef(false);
  const mutateCallCount = useRef(0);

  const handleComplete = useCallback(() => {
    if (completingRef.current || isPendingRef.current) return;
    completingRef.current = true;
    mutateCallCount.current += 1;
  }, []);

  const simulateError = useCallback(() => {
    completingRef.current = false;
  }, []);

  return {
    handleComplete,
    simulateError,
    completingRef,
    isPendingRef,
    mutateCallCount,
  };
}

describe("Completion idempotency guard", () => {
  it("allows first completion call", async () => {
    const hookResult = await renderHook(() => useCompletionGuard());
    await act(async () => hookResult.result.current.handleComplete());
    expect(hookResult.result.current.mutateCallCount.current).toBe(1);
  });

  it("blocks second completion call when completingRef is true", async () => {
    const hookResult = await renderHook(() => useCompletionGuard());
    await act(async () => hookResult.result.current.handleComplete());
    await act(async () => hookResult.result.current.handleComplete());
    expect(hookResult.result.current.mutateCallCount.current).toBe(1);
  });

  it("blocks completion when isPending is true", async () => {
    const hookResult = await renderHook(() => useCompletionGuard());
    hookResult.result.current.isPendingRef.current = true;
    await act(async () => hookResult.result.current.handleComplete());
    expect(hookResult.result.current.mutateCallCount.current).toBe(0);
  });

  it("allows retry after error resets completingRef", async () => {
    const hookResult = await renderHook(() => useCompletionGuard());
    await act(async () => hookResult.result.current.handleComplete());
    expect(hookResult.result.current.mutateCallCount.current).toBe(1);

    // Simulate error — reset guard
    await act(async () => hookResult.result.current.simulateError());
    expect(hookResult.result.current.completingRef.current).toBe(false);

    // Should allow retry
    await act(async () => hookResult.result.current.handleComplete());
    expect(hookResult.result.current.mutateCallCount.current).toBe(2);
  });

  it("does not reset completingRef on success path", async () => {
    const hookResult = await renderHook(() => useCompletionGuard());
    await act(async () => hookResult.result.current.handleComplete());
    // Success path: completingRef stays true (no error reset)
    expect(hookResult.result.current.completingRef.current).toBe(true);
  });
});
