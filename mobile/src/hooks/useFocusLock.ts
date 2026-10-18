import { useState, useEffect, useRef, useCallback } from "react";
import { AppState, type AppStateStatus } from "react-native";

export type FocusLockPhase =
  | "entering"
  | "focusing"
  | "paused_by_user"
  | "paused_lost_focus"
  | "focus_returned"
  | "complete";

export interface UseFocusLockReturn {
  phase: FocusLockPhase;
  focusedElapsedMs: number;
  remainingMs: number;
  pause: () => void;
  resume: () => void;
  complete: () => void;
  reset: () => void;
}

function now(): number {
  return Date.now();
}

export function useFocusLock(
  totalDurationMs: number,
  enabled = true,
): UseFocusLockReturn {
  const [phase, setPhase] = useState<FocusLockPhase>(
    enabled ? "focusing" : "entering",
  );
  const [focusedElapsedMs, setFocusedElapsedMs] = useState(0);
  const accumulatedMsRef = useRef(0);
  const focusStartedAtRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const phaseRef = useRef<FocusLockPhase>("entering");
  const visiblePhase = enabled && phase === "entering" ? "focusing" : phase;

  const remainingMs = Math.max(0, totalDurationMs - focusedElapsedMs);

  const pause = useCallback((nextPhase: "paused_by_user" | "paused_lost_focus") => {
    if (!activeRef.current) return;
    const startedAt = focusStartedAtRef.current;
    if (startedAt === null) return;
    accumulatedMsRef.current += now() - startedAt;
    focusStartedAtRef.current = null;
    activeRef.current = false;
    setFocusedElapsedMs(accumulatedMsRef.current);
    setPhase(nextPhase);
  }, []);

  const pauseByUser = useCallback(() => pause("paused_by_user"), [pause]);
  const pauseLostFocus = useCallback(
    () => pause("paused_lost_focus"),
    [pause],
  );

  const resume = useCallback(() => {
    focusStartedAtRef.current = now();
    activeRef.current = true;
    setPhase("focusing");
  }, []);

  const complete = useCallback(() => {
    if (activeRef.current && focusStartedAtRef.current !== null) {
      accumulatedMsRef.current += now() - focusStartedAtRef.current;
      focusStartedAtRef.current = null;
    }
    activeRef.current = false;
    setFocusedElapsedMs(accumulatedMsRef.current);
    setPhase("complete");
  }, []);

  const reset = useCallback(() => {
    accumulatedMsRef.current = 0;
    focusStartedAtRef.current = null;
    activeRef.current = false;
    setFocusedElapsedMs(0);
    setPhase("entering");
  }, []);

  // Start timing only after the session identity has been resolved.
  useEffect(() => {
    if (!enabled || visiblePhase !== "focusing") return;
    if (!activeRef.current) {
      focusStartedAtRef.current = now();
      activeRef.current = true;
    }
    const id = setInterval(() => {
      const startedAt = focusStartedAtRef.current;
      if (activeRef.current && startedAt !== null) {
        setFocusedElapsedMs(
          accumulatedMsRef.current + now() - startedAt,
        );
      }
    }, 1000);
    return () => clearInterval(id);
  }, [enabled, visiblePhase]);

  // AppState listener — pauses on background, shows focus_returned on foreground
  useEffect(() => {
    function onAppStateChange(state: AppStateStatus) {
      if (
        phaseRef.current === "complete" || phaseRef.current === "entering"
      ) {
        return;
      }

      if (state === "active") {
        if (phaseRef.current === "paused_lost_focus") {
          setPhase("focus_returned");
        }
      } else {
        // background or inactive
        if (activeRef.current) {
          pauseLostFocus();
        }
      }
    }

    const sub = AppState.addEventListener("change", onAppStateChange);
    return () => sub.remove();
  }, [pauseLostFocus]);

  // Keep phaseRef in sync
  useEffect(() => {
    phaseRef.current = visiblePhase;
  }, [visiblePhase]);

  return {
    phase: visiblePhase,
    focusedElapsedMs,
    remainingMs,
    pause: pauseByUser,
    resume,
    complete,
    reset,
  };
}
