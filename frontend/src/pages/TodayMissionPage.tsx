import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Play, Clock, Sparkles } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { usePlanningPreview, useGeneratePlan, useProfile } from "@/services/hooks"
import { Layout } from "@/components/layout"
import { getCurrentSession, getNextSession, EmptySessionState } from "@/components/session-card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

const encouragements = [
  "One chapter today is enough.",
  "Just finish this one.",
  "Small progress still counts.",
  "Future you will be glad you started.",
  "You've got this — one step at a time.",
  "Done is better than perfect.",
  "Every minute counts. You're doing great.",
  "All you need to do is start.",
  "Progress, not perfection.",
  "You're exactly where you need to be.",
]

function pickEncouragement(): string {
  return encouragements[Math.floor(Math.random() * encouragements.length)]
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
  return Math.max(0, h * 60 + m - currentMinutes)
}

function formatTimeDisplay(t: string) {
  const [h, m] = t.split(":").map(Number)
  const period = h >= 12 ? "PM" : "AM"
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
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

/* ─── Greeting ─── */

function Greeting({ name }: { name: string | null }) {
  const now = new Date()
  const hour = now.getHours()

  let greeting: string
  if (hour < 12) greeting = "Good morning"
  else if (hour < 17) greeting = "Good afternoon"
  else greeting = "Good evening"

  const displayName = name ? `, ${name}` : ""

  return (
    <div className="space-y-2">
      <motion.h1
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="text-2xl font-bold tracking-tight"
      >
        {greeting}{displayName} 👋
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="text-sm text-muted-foreground leading-relaxed"
      >
        Don't worry about everything. Let's just finish one thing today.
      </motion.p>
    </div>
  )
}

/* ─── Hero Card ─── */

function HeroCard({
  session,
  isCurrent,
  onStart,
}: {
  session: { start_time: string; end_time: string; reason: string }
  isCurrent: boolean
  onStart?: () => void
}) {
  const duration = getMinutesBetween(session.start_time, session.end_time)

  return (
    <div className="rounded-2xl border bg-gradient-to-b from-primary/[0.04] to-background p-6 sm:p-8 shadow-sm">
      <div className="space-y-5">
        {/* Status */}
        <div>
          {isCurrent ? (
            <div className="flex items-center gap-2">
              <div className="relative flex h-2.5 w-2.5">
                <div className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/75 opacity-75" />
                <div className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
              </div>
              <span className="text-xs font-medium text-primary">Now Studying</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>{getMinutesUntil(session.start_time) > 0 ? `Starts in ${getMinutesUntil(session.start_time)} min` : "Starting soon"}</span>
            </div>
          )}
        </div>

        {/* Topic */}
        <div>
          <h2 className="text-xl font-semibold leading-snug">{session.reason}</h2>
          <p className="text-sm text-muted-foreground mt-1">{duration} min</p>
        </div>

        {/* CTA */}
        {isCurrent && onStart && (
          <Button
            onClick={onStart}
            size="lg"
            className="w-full gap-2.5 h-14 text-base font-semibold rounded-xl shadow-lg shadow-primary/20"
          >
            <Play className="h-5 w-5" />
            Start Studying
          </Button>
        )}
      </div>
    </div>
  )
}

/* ─── Next Session Card (compact) ─── */

function NextSessionCard({ session }: { session: { start_time: string; end_time: string; reason: string } }) {
  const duration = getMinutesBetween(session.start_time, session.end_time)
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5 min-w-0">
          <p className="text-sm font-medium truncate">{session.reason}</p>
          <p className="text-xs text-muted-foreground">
            {formatTimeDisplay(session.start_time)} – {formatTimeDisplay(session.end_time)} · {duration} min
          </p>
        </div>
        <span className="shrink-0 ml-3 text-xs text-muted-foreground">
          {getMinutesUntil(session.start_time) > 0
            ? `in ${getMinutesUntil(session.start_time)} min`
            : "starting soon"}
        </span>
      </div>
    </div>
  )
}

/* ─── Simplified Progress ─── */

function SimplifiedProgress({
  health,
}: {
  health: {
    pending_items: number
    estimated_completion_date: string | null
  } | undefined
}) {
  if (!health) return null
  const completionDate = formatDate(health.estimated_completion_date)

  return (
    <div className="flex items-center justify-between rounded-xl border bg-card px-5 py-3.5">
      <div className="space-y-0.5">
        <span className="text-xs text-muted-foreground">Pending topics</span>
        <p className="text-lg font-semibold tracking-tight">{health.pending_items}</p>
      </div>
      {completionDate && (
        <div className="text-right space-y-0.5">
          <span className="text-xs text-muted-foreground">Estimated finish</span>
          <p className="text-sm font-medium">{completionDate}</p>
        </div>
      )}
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

  const [encouragement] = useState(pickEncouragement)

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

  const sessions = plan?.sessions ?? []
  const otherSessions = useMemo(
    () => {
      const now = new Date()
      const currentMinutes = now.getHours() * 60 + now.getMinutes()
      return sessions.filter((s) => {
        if (s.backlog_item_id === currentSession?.backlog_item_id) return false
        if (s.backlog_item_id === nextSession?.backlog_item_id) return false
        const [eh, em] = s.end_time.split(":").map(Number)
        if (eh * 60 + em <= currentMinutes) return false
        return true
      })
    },
    [sessions, currentSession, nextSession]
  )

  const handleRefresh = () => {
    refetchPreview()
    refetchPlan()
  }

  const handleStartStudy = () => {
    if (!currentSession || !plan) return
    navigate("/focus", {
      state: {
        session: currentSession,
        sessions,
        plan,
      },
    })
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-5 max-w-lg mx-auto">
          <Skeleton className="h-16 w-56" />
          <Skeleton className="h-56 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      </Layout>
    )
  }

  if (hasError) {
    return (
      <Layout>
        <div className="space-y-5 max-w-lg mx-auto">
          <Greeting name={profile?.name ?? null} />
          <Container>
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-12 text-center">
              <p className="text-sm text-muted-foreground mb-4">Couldn't load your plan</p>
              <Button onClick={handleRefresh} variant="outline" size="sm">Try again</Button>
            </div>
          </Container>
        </div>
      </Layout>
    )
  }

  const showCurrent = !!currentSession
  const showNext = !showCurrent && !!nextSession

  return (
    <Layout>
      <div className="space-y-5 max-w-lg mx-auto pb-8">
        {/* 1. Greeting */}
        <Container>
          <Greeting name={profile?.name ?? null} />
        </Container>

        {/* 2. Hero — current or next session */}
        <Container delay={0.05}>
          {showCurrent ? (
            <HeroCard session={currentSession} isCurrent onStart={handleStartStudy} />
          ) : showNext ? (
            <HeroCard session={nextSession} isCurrent={false} />
          ) : (
            <EmptySessionState message="All caught up for today. Time to recharge." />
          )}
        </Container>

        {/* 3. Remaining sessions */}
        {otherSessions.length > 0 && (
          <Container delay={0.1}>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Also today</p>
              <div className="space-y-1.5">
                {otherSessions.slice(0, 4).map((session) => (
                  <NextSessionCard key={session.backlog_item_id + session.start_time} session={session} />
                ))}
              </div>
            </div>
          </Container>
        )}

        {/* 4. Overflow — reassuring */}
        {remainingCount > 0 && (
          <Container delay={0.15}>
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              You're focusing on what's most important today. The rest can wait until tomorrow.
            </p>
          </Container>
        )}

        {/* 5. Progress — simplified */}
        <Container delay={0.2}>
          <SimplifiedProgress health={preview?.backlog_health} />
        </Container>

        {/* 6. Encouragement */}
        <Container delay={0.25}>
          <div className="flex items-start gap-2.5">
            <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-primary/60" />
            <p className="text-sm text-muted-foreground leading-relaxed">{encouragement}</p>
          </div>
        </Container>
      </div>
    </Layout>
  )
}
