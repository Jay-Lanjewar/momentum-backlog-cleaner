import { useState, useEffect, useMemo } from "react"
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
  Zap,
} from "lucide-react"

import { useProfile, useCompleteSession } from "@/services/hooks"
import { useFocusLock } from "@/hooks/useFocusLock"
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
import type { PlanSession, GeneratedPlan, AdaptivePlanResponse } from "@/services/types"

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

function formatFocusedTime(ms: number) {
  const totalSeconds = Math.floor(ms / 1000)
  return formatDuration(totalSeconds)
}

function topicFromSession(session: PlanSession): string {
  return session.reason.replace(/^Work on\s+/, "")
}

const FOCUS_COACH_TONE = "default"

/* ─── Main ─── */

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

  const totalSeconds = useMemo(() => {
    if (!session) return 0
    return (parseMinutes(session.end_time) - parseMinutes(session.start_time)) * 60
  }, [session])

  const totalDurationMs = totalSeconds * 1000

  const {
    phase,
    focusedElapsedMs,
    remainingMs,
    pause,
    resume,
    complete,
  } = useFocusLock(totalDurationMs)

  const [adaptiveResponse, setAdaptiveResponse] = useState<AdaptivePlanResponse | null>(null)

  const handleCompleteSession = () => {
    complete()
    if (session) {
      const actualMinutes = Math.max(1, Math.ceil(focusedElapsedMs / 60000))
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

  const handleBack = () => {
    queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    queryClient.invalidateQueries({ queryKey: ["planning"] })
    queryClient.invalidateQueries({ queryKey: ["plans"] })
    navigate("/", {
      replace: true,
      state: adaptiveResponse ? { adaptiveResponse } : undefined,
    })
  }

  // Auto-complete when focused time reaches total duration
  useEffect(() => {
    if (phase === "focusing" && totalDurationMs > 0 && focusedElapsedMs >= totalDurationMs) {
      complete()
      if (session) {
        const actualMinutes = Math.max(1, Math.ceil(focusedElapsedMs / 60000))
        completeSession.mutate(
          { session_id: session.session_id, actual_minutes: actualMinutes },
          { onSuccess: (data) => setAdaptiveResponse(data) }
        )
      }
    }
  }, [phase, focusedElapsedMs, totalDurationMs])

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

  if (phase === "complete") {
    const effectiveSessions = adaptiveResponse?.plan.sessions ?? state?.sessions ?? []
    const effectivePlan = adaptiveResponse?.plan ?? state?.plan
    const next = nextSessionAfter(
      effectiveSessions,
      session.backlog_item_id,
      session.start_time
    )

    const savedMinutes = Math.floor(focusedElapsedMs / 60000)

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
                  {formatTimeDisplay(session.start_time)} – {formatTimeDisplay(session.end_time)} · {minutesBetween(session.start_time, session.end_time)} min
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

          {adaptiveResponse && adaptiveResponse.changes.length > 0 && (
            <div className="rounded-xl border bg-primary/5 p-4 text-left space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-3 w-3 text-primary" />
                </div>
                <p className="text-sm font-semibold">Momentum Adapted Your Plan</p>
              </div>
              <p className="text-xs text-muted-foreground pl-7">
                {adaptiveResponse.changes[0].reason}
              </p>
            </div>
          )}

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
                    state: { session: next, sessions: effectiveSessions, plan: effectivePlan },
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

  // Focusing or entering
  const isFocusing = phase === "entering" || phase === "focusing"
  const isPaused = phase === "paused_by_user" || phase === "paused_lost_focus" || phase === "focus_returned"
  const progressPercent = totalDurationMs > 0 ? (focusedElapsedMs / totalDurationMs) * 100 : 0
  const remainingSeconds = Math.floor(remainingMs / 1000)

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
          {profile?.name && !isPaused && (
            <p className="text-sm text-muted-foreground">
              {isFocusing ? `Let's finish this one, ${profile.name}.` : "Entering Focus Mode..."}
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
              initial={{ opacity: 0.6, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              aria-live="polite"
              className={cn(
                "text-5xl font-bold tracking-tight tabular-nums",
                isPaused && "text-muted-foreground"
              )}
            >
              {formatDuration(remainingSeconds)}
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
                  onClick={resume}
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
                  onClick={pause}
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

        {/* Focus lock status overlay */}
        <AnimatePresence>
          {isPaused && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="rounded-xl border bg-card p-4 space-y-2"
              role="status"
              aria-label="Focus lock status"
            >
              <p className="text-sm font-semibold">
                {phase === "paused_by_user" && "Take a break"}
                {phase === "paused_lost_focus" && "Focus paused"}
                {phase === "focus_returned" && "Welcome back"}
              </p>
              <p className="text-xs text-muted-foreground">
                {phase === "paused_by_user" && "Pause the timer whenever you need."}
                {phase === "paused_lost_focus" && "Your focused time is paused until you return."}
                {phase === "focus_returned" && "Your timer is right where you left it."}
              </p>
              <p className="text-xs font-medium text-muted-foreground">
                {formatFocusedTime(focusedElapsedMs)} focused
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
