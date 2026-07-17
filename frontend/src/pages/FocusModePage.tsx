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
} from "lucide-react"

import { useProfile, useUpdateBacklogItem } from "@/services/hooks"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/cn"
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

function formatTimeDisplay(t: string) {
  const [h, m] = t.split(":").map(Number)
  const period = h >= 12 ? "PM" : "AM"
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`
}

/* ─── Confetti ─── */

const CONFETTI_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#ec4899"]

function Confetti() {
  const pieces = useMemo(() =>
    Array.from({ length: 40 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: -10 - Math.random() * 20,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + Math.random() * 8,
      rotation: Math.random() * 360,
      delay: Math.random() * 0.5,
      duration: 1.5 + Math.random() * 1.5,
    })),
  [])

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {pieces.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-sm"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
          }}
          initial={{ opacity: 1, rotate: 0, y: 0, x: 0 }}
          animate={{
            opacity: [1, 1, 0],
            rotate: p.rotation,
            y: ["0vh", "100vh"],
            x: [0, (Math.random() - 0.5) * 200],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: "easeIn",
          }}
        />
      ))}
    </div>
  )
}

/* ─── Main ─── */

type Phase = "focus" | "paused" | "complete"

export function FocusModePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { data: profile } = useProfile()
  const updateBacklogItem = useUpdateBacklogItem()
  const state = location.state as {
    session: PlanSession
    sessions: PlanSession[]
    plan: GeneratedPlan
  } | null

  const session = state?.session ?? null

  const [phase, setPhase] = useState<Phase>("focus")
  const [elapsed, setElapsed] = useState(0)
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
          setPhase("complete")
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

  const handleComplete = () => {
    clearInterval(intervalRef.current)
    setPhase("complete")
    if (session) {
      updateBacklogItem.mutate({ id: session.backlog_item_id, payload: { status: "completed" } })
    }
  }

  const handleReset = () => {
    clearInterval(intervalRef.current)
    setElapsed(0)
    setPhase("focus")
  }

  const handleBack = () => {
    queryClient.invalidateQueries({ queryKey: ["planning"] })
    queryClient.invalidateQueries({ queryKey: ["plans"] })
    navigate("/", { replace: true })
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">No study block found.</p>
          <Button onClick={handleBack} variant="outline" size="sm">Back to Today</Button>
        </div>
      </div>
    )
  }

  const progressPercent = totalSeconds > 0 ? (elapsed / totalSeconds) * 100 : 0
  const otherSessions = (state?.sessions ?? []).filter(
    (s) => s.backlog_item_id !== session.backlog_item_id
  )
  const savedMinutes = Math.floor(elapsed / 60)

  if (phase === "complete") {
    return (
      <>
        <Confetti />
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="w-full max-w-sm mx-auto text-center space-y-6"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
              className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30"
            >
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            </motion.div>

            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">Great work{profile?.name ? `, ${profile.name}` : ""}!</h1>
              <p className="text-sm text-muted-foreground">
                One study block done!
              </p>
            </div>

            <div className="rounded-xl border bg-card p-5 space-y-4 text-left">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">{session.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatTimeDisplay(session.start_time)} – {formatTimeDisplay(session.end_time)}
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

              {otherSessions.length > 0 && (
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{otherSessions.length} topic{otherSessions.length !== 1 ? "s" : ""} still to go</p>
                    <p className="text-xs text-muted-foreground">
                      {otherSessions.slice(0, 3).map((s) => s.reason).join(" · ")}
                      {otherSessions.length > 3 && ` · +${otherSessions.length - 3} more`}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <Button onClick={handleBack} size="lg" className="w-full gap-2 h-12 rounded-xl">
              Back to Today
              <ArrowRight className="h-4 w-4" />
            </Button>
          </motion.div>
        </div>
      </>
    )
  }

  const isPaused = phase === "paused"

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm mx-auto text-center space-y-8">
        {/* Task title */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-1"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Study Mode</p>
          <h1 className="text-lg font-semibold leading-snug">{session.reason}</h1>
          {profile?.name && (
            <p className="text-sm text-muted-foreground">Let's finish this one, {profile.name}.</p>
          )}
        </motion.div>

        {/* Timer */}
        <div className="relative">
          <svg className="w-64 h-64 mx-auto -rotate-90" viewBox="0 0 256 256">
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
                >
                  <Pause className="h-6 w-6" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          <Button
            onClick={handleComplete}
            variant="outline"
            className="h-12 px-6 rounded-full gap-2"
          >
            <CheckCircle2 className="h-5 w-5" />
            Complete
          </Button>
        </div>

        {/* Reset */}
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Restart timer
        </button>
      </div>
    </div>
  )
}
