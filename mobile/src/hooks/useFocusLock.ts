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

export function useFocusLock(totalDurationMs: number): UseFocusLockReturn {
  const [phase, setPhase] = useState<FocusLockPhase>("entering");
  const [, setTick] = useState(0);

  const accumulatedMsRef = useRef(0);
  const focusStartedAtRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const phaseRef = useRef<FocusLockPhase>("entering");

  const focusedElapsedMs =
    accumulatedMsRef.current +
    (activeRef.current && focusStartedAtRef.current !== null
      ? now() - focusStartedAtRef.current
      : 0);

  const remainingMs = Math.max(0, totalDurationMs - focusedElapsedMs);

  const pause = useCallback(() => {
    if (!activeRef.current) return;
    accumulatedMsRef.current += now() - focusStartedAtRef.current!;
    focusStartedAtRef.current = null;
    activeRef.current = false;
    setPhase("paused_by_user");
  }, []);

  const pauseLostFocus = useCallback(() => {
    if (!activeRef.current) return;
    accumulatedMsRef.current += now() - focusStartedAtRef.current!;
    focusStartedAtRef.current = null;
    activeRef.current = false;
    setPhase("paused_lost_focus");
  }, []);

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
    setPhase("complete");
  }, []);

  const reset = useCallback(() => {
    accumulatedMsRef.current = 0;
    focusStartedAtRef.current = null;
    activeRef.current = false;
    setPhase("entering");
  }, []);

  // Initial focus start
  useEffect(() => {
    if (phase !== "entering") return;
    focusStartedAtRef.current = now();
    activeRef.current = true;
    setPhase("focusing");
  }, [phase]);

  // Display tick: re-render once per second for countdown display
  useEffect(() => {
    if (!activeRef.current) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // AppState listener — pauses on background, shows focus_returned on foreground
  useEffect(() => {
    function onAppStateChange(state: AppStateStatus) {
      if (
        phaseRef.current === "complete" ||
        phaseRef.current === "entering"
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
    phaseRef.current = phase;
  }, [phase]);

  return {
    phase,
    focusedElapsedMs,
    remainingMs,
    pause,
    resume,
    complete,
    reset,
  };
}
