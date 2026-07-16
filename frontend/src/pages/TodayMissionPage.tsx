import { useEffect, useMemo } from "react"
import { motion } from "framer-motion"
import { Sparkles, RefreshCw, Play, Clock, AlertCircle } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { usePlanningPreview, useGeneratePlan, useProfile } from "@/services/hooks"
import { Layout } from "@/components/layout"
import { SessionCard, getCurrentSession, getNextSession, EmptySessionState } from "@/components/session-card"
import { BacklogHealthWidget } from "@/components/backlog-health"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

/* ─── Helpers ─── */

function formatTimeDisplay(t: string) {
  const [h, m] = t.split(":").map(Number)
  const period = h >= 12 ? "PM" : "AM"
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`
}

function getMinutesBetween(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  return (eh * 60 + em) - (sh * 60 + sm)
}

function getMinutesUntil(time: string) {
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m - currentMinutes
}

function Greeting() {
  const now = new Date()
  const hour = now.getHours()
  const day = now.toLocaleDateString("en-US", { weekday: "long" })
  const date = now.toLocaleDateString("en-US", { month: "short", day: "numeric" })

  let greeting: string
  if (hour < 12) greeting = "Good morning"
  else if (hour < 17) greeting = "Good afternoon"
  else greeting = "Good evening"

  return (
    <div className="space-y-0.5">
      <motion.h1
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="text-2xl font-bold tracking-tight sm:text-3xl"
      >
        {greeting}
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="text-sm text-muted-foreground"
      >
        {day}, {date}
      </motion.p>
    </div>
  )
}

function Container({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  )
}

/* ─── Current Session Hero ─── */

function CurrentSessionHero({
  session,
  onStart,
  onRefresh,
}: {
  session: { start_time: string; end_time: string; reason: string }
  onStart: () => void
  onRefresh: () => void
}) {
  const duration = getMinutesBetween(session.start_time, session.end_time)
  const remaining = getMinutesUntil(session.end_time)
  const elapsed = duration - remaining

  return (
    <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-b from-primary/5 to-background">
      <div className="absolute top-0 left-0 right-0 h-1 bg-primary/20">
        <motion.div
          initial={{ width: `${(elapsed / duration) * 100}%` }}
          animate={{ width: `${(elapsed / duration) * 100}%` }}
          className="h-full bg-primary rounded-full"
        />
      </div>

      <div className="p-6 sm:p-8">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="relative flex h-3 w-3">
              <div className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/75 opacity-75" />
              <div className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">Now Studying</span>
          </div>
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            onClick={onRefresh}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
          </motion.button>
        </div>

        <h2 className="text-xl font-semibold mb-1 leading-snug">{session.reason}</h2>

        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-6">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {remaining > 0 ? `${remaining} min remaining` : "Ending soon"}
          </span>
          <span>·</span>
          <span>{formatTimeDisplay(session.start_time)} – {formatTimeDisplay(session.end_time)}</span>
        </div>

        <Button onClick={onStart} size="lg" className="w-full gap-2 h-14 text-base font-semibold rounded-xl shadow-lg shadow-primary/20">
          <Play className="h-5 w-5" />
          Start Session
        </Button>
      </div>
    </Card>
  )
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border bg-card shadow-sm ${className}`}>
      {children}
    </div>
  )
}

/* ─── Main Page ─── */

export function TodayMissionPage() {
  const navigate = useNavigate()
  const { data: profile, isLoading: profileLoading } = useProfile()
  const { data: preview, isLoading: previewLoading, error: previewError, refetch: refetchPreview } = usePlanningPreview()
  const { data: planData, isLoading: planLoading, error: planError, refetch: refetchPlan } = useGeneratePlan()

  const onboarded = localStorage.getItem("momentum_onboarded") === "true"

  useEffect(() => {
    if (profileLoading) return
    if (onboarded && profile) return
    if (!onboarded || !profile?.class_name) {
      navigate("/onboarding", { replace: true })
    }
  }, [profileLoading, onboarded, profile, navigate])

  const isLoading = profileLoading || previewLoading || planLoading
  const hasError = previewError || planError

  const plan = planData?.plan

  const currentSession = useMemo(() => plan?.sessions ? getCurrentSession(plan.sessions) : null, [plan])
  const nextSession = useMemo(() => plan?.sessions ? getNextSession(plan.sessions) : null, [plan])
  const remainingCount = plan?.overflow.length ?? 0

  const dailyMessage = useMemo(() => {
    const msg = plan?.daily_message
    if (!msg || msg === "Keep going!" || msg.startsWith("Planned")) {
      const messages = [
        "Focus on what matters most. Start with your highest priority task.",
        "Small steps lead to big results. Tackle one session at a time.",
        "You've got this! Break it down and take it session by session.",
        "Consistency beats intensity. Stay with the plan.",
        "Your future self will thank you for the work you do today.",
      ]
      return messages[Math.floor(Math.random() * messages.length)]
    }
    return msg
  }, [plan])

  const handleRefresh = () => {
    refetchPreview()
    refetchPlan()
  }

  const handleStartSession = () => {
    if (!currentSession || !plan) return
    navigate("/focus", {
      state: {
        session: currentSession,
        sessions,
        plan,
      },
    })
  }

  const sessions = plan?.sessions ?? []
  const otherSessions = useMemo(
    () => sessions.filter(
      (s) => s.backlog_item_id !== currentSession?.backlog_item_id && s.backlog_item_id !== nextSession?.backlog_item_id
    ),
    [sessions, currentSession, nextSession]
  )

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6 max-w-lg mx-auto">
          <Greeting />
          <Skeleton className="h-64 w-full rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        </div>
      </Layout>
    )
  }

  if (hasError) {
    return (
      <Layout>
        <div className="space-y-6 max-w-lg mx-auto">
          <Greeting />
          <Container>
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-12 text-center">
              <p className="text-sm text-muted-foreground mb-4">Unable to load your mission</p>
              <Button onClick={handleRefresh} variant="outline" size="sm">
                <RefreshCw className="mr-2 h-4 w-4" />
                Try again
              </Button>
            </div>
          </Container>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-6 max-w-lg mx-auto pb-8">
        {/* Greeting */}
        <Container>
          <Greeting />
        </Container>

        {/* Current Session / Next Session / Empty */}
        <Container delay={0.05}>
          {currentSession ? (
            <CurrentSessionHero
              session={currentSession}
              onStart={handleStartSession}
              onRefresh={handleRefresh}
            />
          ) : nextSession ? (
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Next Session</span>
              </div>
              <h2 className="text-lg font-semibold mb-1">{nextSession.reason}</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {getMinutesUntil(nextSession.start_time) > 0
                  ? `Starts in ${getMinutesUntil(nextSession.start_time)} min`
                  : "Starting soon"}
                {" · "}
                {formatTimeDisplay(nextSession.start_time)} – {formatTimeDisplay(nextSession.end_time)}
              </p>
              <Button onClick={handleRefresh} variant="outline" size="sm" className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
            </Card>
          ) : (
            <EmptySessionState message="All caught up! No sessions scheduled today." />
          )}
        </Container>

        {/* Remaining after today */}
        {remainingCount > 0 && (
          <Container delay={0.1}>
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200/50 bg-amber-50/50 px-4 py-3 text-xs text-amber-800 dark:border-amber-800/30 dark:bg-amber-950/20 dark:text-amber-200">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                <span className="font-medium">{remainingCount}</span> item{remainingCount !== 1 ? "s" : ""} remaining after today
              </span>
            </div>
          </Container>
        )}

        {/* Upcoming Sessions */}
        {otherSessions.length > 0 && (
          <Container delay={0.15}>
            <div className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
                Remaining Today ({sessions.length - 1})
              </h3>
              <div className="space-y-1.5">
                {otherSessions.slice(0, 4).map((session) => (
                  <SessionCard key={session.backlog_item_id + session.start_time} session={session} />
                ))}
              </div>
            </div>
          </Container>
        )}

        {/* You're on track */}
        <Container delay={0.2}>
          <BacklogHealthWidget health={preview?.backlog_health} />
        </Container>

        {/* Daily insight */}
        <Container delay={0.25}>
          <div className="flex items-start gap-2.5 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
            <span>{dailyMessage}</span>
          </div>
        </Container>
      </div>
    </Layout>
  )
}
