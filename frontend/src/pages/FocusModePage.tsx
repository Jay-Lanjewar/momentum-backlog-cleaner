import { useState, useEffect, useRef, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useNavigate, useLocation } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import {
  Play,
  Pause,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  RotateCcw,
  Zap,
} from "lucide-react"

import { useProfile, useCompleteSession } from "@/services/hooks"
import { Button } from "@/components/ui/button"
import { CoachMessage } from "@/components/coach/coach-message"
import { RecommendedNextCard } from "@/components/coach/recommended-next"
import { cn } from "@/lib/cn"
import {
  focusCoachMessage,
  formatMinutes,
  formatTimeDisplay,
  minutesBetween,
  nextSessionAfter,
} from "@/lib/coaching"
import type { PlanSession, GeneratedPlan } from "@/services/types"

/* ─── Helpers ─── */

function parseMinutes(t: string) {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

function formatDuration(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

function topicFromSession(session: PlanSession): string {
  return session.reason.replace(/^Work on\s+/, "")
}

const FOCUS_COACH_TONE = "default"

/* ─── Main ─── */

type Phase = "focus" | "paused" | "complete"

export function FocusModePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { data: profile } = useProfile()
  const completeSession = useCompleteSession()
  const state = location.state as {
    session: PlanSession
    sessions: PlanSession[]
    plan: GeneratedPlan
    plan_snapshot_id?: string
  } | null

  const session = state?.session ?? null

  const [phase, setPhase] = useState<Phase>("focus")
  const [elapsed, setElapsed] = useState(0)
  const [adaptiveResponse, setAdaptiveResponse] = useState<import("@/services/types").AdaptivePlanResponse | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  const totalSeconds = useMemo(() => {
    if (!session) return 0
    return (parseMinutes(session.end_time) - parseMinutes(session.start_time)) * 60
  }, [session])

  const remaining = Math.max(0, totalSeconds - elapsed)

  useEffect(() => {
    if (!session) return
    if (phase !== "focus") return
    intervalRef.current = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1
        if (next >= totalSeconds) {
          clearInterval(intervalRef.current)
          handleCompleteSession()
          return totalSeconds
        }
        return next
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [session, phase, totalSeconds])

  const handlePause = () => {
    clearInterval(intervalRef.current)
    setPhase("paused")
  }

  const handleResume = () => {
    setPhase("focus")
  }

  const handleCompleteSession = () => {
    clearInterval(intervalRef.current)
    setPhase("complete")
    if (session) {
      const actualMinutes = Math.max(1, Math.ceil(elapsed / 60))
      completeSession.mutate(
        { session_id: session.session_id, actual_minutes: actualMinutes },
        {
          onSuccess: (data) => {
            setAdaptiveResponse(data)
          },
        }
      )
    }
  }

  const handleReset = () => {
    clearInterval(intervalRef.current)
    setElapsed(0)
    setPhase("focus")
  }

  const handleBack = () => {
    queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    queryClient.invalidateQueries({ queryKey: ["planning"] })
    queryClient.invalidateQueries({ queryKey: ["plans"] })
    navigate("/", {
      replace: true,
      state: adaptiveResponse ? { adaptiveResponse } : undefined,
    })
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mx-auto">
            <Clock className="h-7 w-7 text-primary" />
          </div>
          <p className="text-sm font-medium">No study block found</p>
          <p className="text-xs text-muted-foreground">Go back to Today's Mission to start a study session.</p>
          <Button onClick={handleBack} variant="outline" size="sm" className="gap-2">
            Back to Today
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  const progressPercent = totalSeconds > 0 ? (elapsed / totalSeconds) * 100 : 0
  const sessionMinutes = minutesBetween(session.start_time, session.end_time)
  const savedMinutes = Math.floor(elapsed / 60)

  if (phase === "complete") {
    const next = nextSessionAfter(
      state?.sessions ?? [],
      session.backlog_item_id,
      session.start_time
    )

    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="w-full max-w-sm mx-auto text-center space-y-6"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 180, damping: 16, delay: 0.15 }}
            className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10"
          >
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          </motion.div>

          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">
              Nice work{profile?.name ? `, ${profile.name}` : ""}!
            </h1>
            <p className="text-sm text-muted-foreground">
              You finished a focused session.
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5 space-y-3 text-left">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium break-words">{topicFromSession(session)}</p>
                <p className="text-xs text-muted-foreground">
                  {formatTimeDisplay(session.start_time)} – {formatTimeDisplay(session.end_time)} · {sessionMinutes} min
                </p>
              </div>
            </div>
            {savedMinutes > 0 && (
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">One less thing to worry about</p>
                  <p className="text-xs text-muted-foreground">
                    Future You will thank you.
                  </p>
                </div>
              </div>
            )}
          </div>

          {next ? (
            <div className="text-left">
              <RecommendedNextCard
                task={topicFromSession(next)}
                durationLabel={formatMinutes(minutesBetween(next.start_time, next.end_time))}
                reason="Up next in today's plan. Starting now keeps your momentum."
                bestTime={formatTimeDisplay(next.start_time)}
                finishTime={formatTimeDisplay(next.end_time)}
                ctaLabel="Start Next Session"
                onStart={() =>
                  navigate("/focus", {
                    replace: true,
                    state: { session: next, sessions: state?.sessions, plan: state?.plan },
                  })
                }
              />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed bg-card/40 p-5 text-center space-y-1">
              <p className="text-sm font-medium">You're all caught up for today.</p>
              <p className="text-xs text-muted-foreground">
                Momentum will line up your next mission for tomorrow.
              </p>
            </div>
          )}

          <Button onClick={handleBack} size="lg" className="w-full gap-2 h-12 rounded-xl">
            Back to Today
            <ArrowRight className="h-4 w-4" />
          </Button>
        </motion.div>
      </div>
    )
  }

  const isPaused = phase === "paused"

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm mx-auto text-center space-y-6">
        {/* Task title */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-1"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Focus Session
          </p>
          <h1 className="text-lg font-semibold leading-snug break-words">
            {topicFromSession(session)}
          </h1>
          {profile?.name && (
            <p className="text-sm text-muted-foreground">
              {isPaused ? "Paused — the timer is waiting for you." : `Let's finish this one, ${profile.name}.`}
            </p>
          )}
        </motion.div>

        {/* Timer */}
        <div className="relative">
          <svg className="w-64 h-64 mx-auto -rotate-90" viewBox="0 0 256 256" aria-hidden="true">
            <circle
              cx="128"
              cy="128"
              r="112"
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth="8"
              className="opacity-30"
            />
            <motion.circle
              cx="128"
              cy="128"
              r="112"
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 112}
              animate={{
                strokeDashoffset: 2 * Math.PI * 112 * (1 - progressPercent / 100),
              }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
            />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.span
              key={remaining}
              initial={{ opacity: 0.6, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              aria-live="polite"
              className={cn(
                "text-5xl font-bold tracking-tight tabular-nums",
                isPaused && "text-muted-foreground"
              )}
            >
              {formatDuration(remaining)}
            </motion.span>
            <span className="text-sm text-muted-foreground mt-1">
              {isPaused ? "Paused" : "remaining"}
            </span>
          </div>
        </div>

        {/* Coaching */}
        <CoachMessage tone={FOCUS_COACH_TONE} label="Momentum">
          {focusCoachMessage(progressPercent)}
        </CoachMessage>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          <AnimatePresence mode="wait">
            {isPaused ? (
              <motion.div
                key="resume"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <Button
                  onClick={handleResume}
                  size="lg"
                  className="h-16 w-16 rounded-full shadow-lg"
                  aria-label="Resume timer"
                >
                  <Play className="h-6 w-6 ml-0.5" />
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="pause"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <Button
                  onClick={handlePause}
                  variant="secondary"
                  size="lg"
                  className="h-16 w-16 rounded-full shadow-lg"
                  aria-label="Pause timer"
                >
                  <Pause className="h-6 w-6" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          <Button
            onClick={handleCompleteSession}
            variant="outline"
            className="h-12 px-6 rounded-full gap-2"
          >
            <Zap className="h-5 w-5" />
            Finish Early
          </Button>
        </div>

        {/* Reset */}
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto py-2 px-3 -mx-3"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Restart timer
        </button>
      </div>
    </div>
  )
}
