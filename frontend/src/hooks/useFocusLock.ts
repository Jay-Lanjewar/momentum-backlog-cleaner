import { useState, useEffect, useRef, useCallback } from "react"

export type FocusLockPhase =
  | "entering"
  | "focusing"
  | "paused_by_user"
  | "paused_lost_focus"
  | "focus_returned"
  | "complete"

export interface UseFocusLockReturn {
  phase: FocusLockPhase
  focusedElapsedMs: number
  remainingMs: number
  isFullscreen: boolean
  pause: () => void
  resume: () => void
  complete: () => void
  reset: () => void
}

function now(): number {
  return Date.now()
}

export function useFocusLock(totalDurationMs: number): UseFocusLockReturn {
  const [phase, setPhase] = useState<FocusLockPhase>("entering")
  const [, setTick] = useState(0)

  const accumulatedMsRef = useRef(0)
  const focusStartedAtRef = useRef<number | null>(null)
  const activeRef = useRef(false)
  const phaseRef = useRef<FocusLockPhase>("entering")

  const focusedElapsedMs =
    accumulatedMsRef.current +
    (activeRef.current && focusStartedAtRef.current !== null
      ? now() - focusStartedAtRef.current
      : 0)

  const remainingMs = Math.max(0, totalDurationMs - focusedElapsedMs)

  const pause = useCallback(() => {
    if (!activeRef.current) return
    accumulatedMsRef.current += now() - focusStartedAtRef.current!
    focusStartedAtRef.current = null
    activeRef.current = false
    setPhase("paused_by_user")
  }, [])

  const pauseLostFocus = useCallback(() => {
    if (!activeRef.current) return
    accumulatedMsRef.current += now() - focusStartedAtRef.current!
    focusStartedAtRef.current = null
    activeRef.current = false
    setPhase("paused_lost_focus")
  }, [])

  const resume = useCallback(() => {
    focusStartedAtRef.current = now()
    activeRef.current = true
    setPhase("focusing")
  }, [])

  const complete = useCallback(() => {
    if (activeRef.current && focusStartedAtRef.current !== null) {
      accumulatedMsRef.current += now() - focusStartedAtRef.current
      focusStartedAtRef.current = null
    }
    activeRef.current = false
    setPhase("complete")
  }, [])

  const reset = useCallback(() => {
    accumulatedMsRef.current = 0
    focusStartedAtRef.current = null
    activeRef.current = false
    setPhase("entering")
  }, [])

  // Initial focus start + fullscreen request
  useEffect(() => {
    if (phase !== "entering") return

    focusStartedAtRef.current = now()
    activeRef.current = true

    const root = document.documentElement
    if (root.requestFullscreen) {
      root.requestFullscreen().catch(() => {})
    }

    setPhase("focusing")
  }, [phase])

  // Display tick: re-render once per second for countdown display
  useEffect(() => {
    if (!activeRef.current) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [phase])

  // Visibility change listener
  useEffect(() => {
    function onVisibilityChange() {
      if (phaseRef.current === "complete" || phaseRef.current === "entering") return

      if (document.visibilityState === "hidden") {
        if (activeRef.current) {
          pauseLostFocus()
        }
      } else {
        if (phaseRef.current === "paused_lost_focus") {
          setPhase("focus_returned")
        }
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => document.removeEventListener("visibilitychange", onVisibilityChange)
  }, [pauseLostFocus])

  // Window blur/focus listener
  useEffect(() => {
    function onBlur() {
      if (phaseRef.current === "complete" || phaseRef.current === "entering") return
      if (activeRef.current) {
        pauseLostFocus()
      }
    }
    function onFocus() {
      if (phaseRef.current === "paused_lost_focus") {
        setPhase("focus_returned")
      }
    }
    window.addEventListener("blur", onBlur)
    window.addEventListener("focus", onFocus)
    return () => {
      window.removeEventListener("blur", onBlur)
      window.removeEventListener("focus", onFocus)
    }
  }, [pauseLostFocus])

  // Fullscreen change listener
  useEffect(() => {
    function onFullscreenChange() {
      if (phaseRef.current === "complete" || phaseRef.current === "entering") return
      if (!document.fullscreenElement && activeRef.current) {
        pauseLostFocus()
      }
    }
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [pauseLostFocus])

  // Warn on page unload during active session
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (activeRef.current || phaseRef.current === "paused_by_user" || phaseRef.current === "paused_lost_focus" || phaseRef.current === "focus_returned") {
        e.preventDefault()
        e.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [])

  // Keep phaseRef in sync
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  return {
    phase,
    focusedElapsedMs,
    remainingMs,
    isFullscreen: !!document.fullscreenElement,
    pause,
    resume,
    complete,
    reset,
  }
}
