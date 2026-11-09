import { useState, useEffect, useRef, useCallback } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  clearFocusSession,
  FOCUS_CHECKPOINT_INTERVAL_MS,
  saveFocusSession,
  type DurableFocusSession,
  type DurableFocusState,
  type FocusSessionIdentity,
} from "@/focus/focusSessionPersistence";

export type FocusLockPhase =
  | "entering"
  | "focusing"
  | "paused_by_user"
  | "paused_lost_focus"
  | "focus_returned"
  | "recovery_pending"
  | "completion_pending"
  | "complete";

export interface UseFocusLockReturn {
  phase: FocusLockPhase;
  focusedElapsedMs: number;
  remainingMs: number;
  pause: () => void;
  pauseForChallenge: () => void;
  resume: () => void;
  markCompletionPending: (minutes: number) => void;
  complete: () => void;
  reset: () => void;
  recovered: boolean;
  persistenceError: boolean;
  completionMinutes?: number;
}

function now(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function useFocusLock(
  totalDurationMs: number,
  enabled = true,
  recovery?: { identity: FocusSessionIdentity; record: DurableFocusSession | null },
): UseFocusLockReturn {
  const identity = recovery?.identity;
  const recoveryRecord = recovery?.record;
  const [phase, setPhase] = useState<FocusLockPhase>(
    enabled
      ? recoveryRecord?.state === "completion_pending"
        ? "completion_pending"
        : recoveryRecord
          ? "recovery_pending"
          : "focusing"
      : "entering",
  );
  const [focusedElapsedState, setFocusedElapsedMs] = useState(recoveryRecord?.accumulatedMs ?? 0);
  const focusedElapsedMs = Math.max(focusedElapsedState, recoveryRecord?.accumulatedMs ?? 0);
  const accumulatedMsRef = useRef(0);
  const focusStartedAtRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const phaseRef = useRef<FocusLockPhase>("entering");
  const initializedRef = useRef(false);
  const lastPersistedAtRef = useRef(0);
  const [persistenceError, setPersistenceError] = useState(false);
  const [completionMinutesState, setCompletionMinutes] = useState<number | undefined>(recoveryRecord?.completionMinutes);
  const completionMinutes = completionMinutesState ?? recoveryRecord?.completionMinutes;
  const recovered = Boolean(recoveryRecord);
  const visiblePhase: FocusLockPhase = enabled && phase === "entering"
    ? recoveryRecord?.state === "completion_pending" ? "completion_pending" : recoveryRecord ? "recovery_pending" : "focusing"
    : phase;

  const remainingMs = Math.max(0, totalDurationMs - focusedElapsedMs);

  const persist = useCallback((state: DurableFocusState, accumulatedMs: number, pendingMinutes?: number) => {
    if (!identity) return false;
    const record: DurableFocusSession = {
      version: 1,
      ...identity,
      totalDurationMs,
      accumulatedMs: Math.min(totalDurationMs, Math.max(0, Math.floor(accumulatedMs))),
      state,
      ...(state === "completion_pending" ? { completionMinutes: pendingMinutes } : {}),
      updatedAt: new Date().toISOString(),
    };
    lastPersistedAtRef.current = now();
    return saveFocusSession(record);
  }, [identity, totalDurationMs]);

  useEffect(() => {
    if (!enabled || initializedRef.current) return;
    initializedRef.current = true;
    if (recoveryRecord) {
      accumulatedMsRef.current = recoveryRecord.accumulatedMs;
      // Running and challenge-active records always recover paused. Time
      // while the JS process was absent is never inferred or counted.
      if (recoveryRecord.state !== "completion_pending") persist("recovery_pending", recoveryRecord.accumulatedMs);
    } else {
      persist("running", accumulatedMsRef.current);
    }
  }, [enabled, persist, recoveryRecord]);

  const pause = useCallback((nextPhase: "paused_by_user" | "paused_lost_focus", storedState: DurableFocusState = "paused") => {
    if (phaseRef.current === "completion_pending" || phaseRef.current === "complete") return;
    if (!activeRef.current) return;
    const startedAt = focusStartedAtRef.current;
    if (startedAt === null) return;
    accumulatedMsRef.current += now() - startedAt;
    focusStartedAtRef.current = null;
    activeRef.current = false;
    phaseRef.current = nextPhase;
    setFocusedElapsedMs(accumulatedMsRef.current);
    setPhase(nextPhase);
    setPersistenceError(!persist(storedState, accumulatedMsRef.current));
  }, [persist]);

  const pauseByUser = useCallback(() => pause("paused_by_user"), [pause]);
  const pauseForChallenge = useCallback(() => pause("paused_by_user", "challenge_active"), [pause]);
  const pauseLostFocus = useCallback(
    () => pause("paused_lost_focus"),
    [pause],
  );

  const resume = useCallback(() => {
    if (phaseRef.current === "completion_pending" || phaseRef.current === "complete") return;
    focusStartedAtRef.current = now();
    activeRef.current = true;
    phaseRef.current = "focusing";
    setPhase("focusing");
    setPersistenceError(!persist("running", accumulatedMsRef.current));
  }, [persist]);

  const markCompletionPending = useCallback((minutes: number) => {
    if (!Number.isInteger(minutes) || minutes < 1) return;
    if (activeRef.current && focusStartedAtRef.current !== null) {
      accumulatedMsRef.current = Math.min(totalDurationMs, accumulatedMsRef.current + Math.max(0, now() - focusStartedAtRef.current));
    }
    focusStartedAtRef.current = null;
    activeRef.current = false;
    phaseRef.current = "completion_pending";
    setFocusedElapsedMs(accumulatedMsRef.current);
    setCompletionMinutes(minutes);
    setPhase("completion_pending");
    setPersistenceError(!persist("completion_pending", accumulatedMsRef.current, minutes));
  }, [persist, totalDurationMs]);

  const complete = useCallback(() => {
    if (activeRef.current && focusStartedAtRef.current !== null) {
      accumulatedMsRef.current += now() - focusStartedAtRef.current;
      focusStartedAtRef.current = null;
    }
    activeRef.current = false;
    phaseRef.current = "complete";
    setFocusedElapsedMs(accumulatedMsRef.current);
    setPhase("complete");
    if (identity) clearFocusSession(identity.userId, identity.sessionId);
  }, [identity]);

  const reset = useCallback(() => {
    accumulatedMsRef.current = 0;
    focusStartedAtRef.current = null;
    activeRef.current = false;
    phaseRef.current = "entering";
    setFocusedElapsedMs(0);
    setPhase("entering");
    setCompletionMinutes(undefined);
    if (identity) clearFocusSession(identity.userId, identity.sessionId);
  }, [identity]);

  // Start timing only after the session identity has been resolved.
  useEffect(() => {
    if (!enabled || visiblePhase !== "focusing" || !initializedRef.current) return;
    if (!activeRef.current) {
      focusStartedAtRef.current = now();
      activeRef.current = true;
    }
    const id = setInterval(() => {
      const startedAt = focusStartedAtRef.current;
      if (activeRef.current && startedAt !== null) {
        const elapsed = Math.min(totalDurationMs, accumulatedMsRef.current + Math.max(0, now() - startedAt));
        setFocusedElapsedMs(elapsed);
        if (now() - lastPersistedAtRef.current >= FOCUS_CHECKPOINT_INTERVAL_MS) {
          setPersistenceError(!persist("running", elapsed));
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [enabled, persist, totalDurationMs, visiblePhase]);

  // AppState listener — pauses on background, shows focus_returned on foreground
  useEffect(() => {
    function onAppStateChange(state: AppStateStatus) {
      if (
        phaseRef.current === "complete" || phaseRef.current === "completion_pending" || phaseRef.current === "entering"
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
    pauseForChallenge,
    resume,
    markCompletionPending,
    complete,
    reset,
    recovered,
    persistenceError,
    completionMinutes,
  };
}
