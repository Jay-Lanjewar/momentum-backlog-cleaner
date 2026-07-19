import { useEffect, useMemo } from "react"
import { motion } from "framer-motion"
import { Play, Clock, Target, AlertTriangle, CheckCircle2, Sprout } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { usePlanningPreview, useGeneratePlan, useProfile, useStreaks, useBalanceScore, useInsight } from "@/services/hooks"
import { Layout } from "@/components/layout"
import { getCurrentSession, getNextSession, EmptySessionState } from "@/components/session-card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { MomentumStreak, RecoveryTokens, SubjectStreaksCard, BalanceScoreCard } from "@/components/streak-display"
import type { PlanSession, PrioritizedBacklogItem, BacklogHealth } from "@/services/types"

/* ─── Helpers ─── */

function getDifficulty(priority: number): { label: string; variant: "destructive" | "warning" | "success" } {
  if (priority <= 2) return { label: "Hard", variant: "destructive" }
  if (priority === 3) return { label: "Medium", variant: "warning" }
  return { label: "Easy", variant: "success" }
}

function getMinutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  return (eh * 60 + em) - (sh * 60 + sm)
}

function formatTimeDisplay(t: string): string {
  const [h, m] = t.split(":").map(Number)
  const period = h >= 12 ? "PM" : "AM"
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`
}

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function getStatusMessage(
  health: BacklogHealth | undefined,
  overdueMinutes: number,
): { message: string; variant: "success" | "warning" | "destructive" } {
  if (!health) return { message: "You are on track.", variant: "success" }

  if (health.health_score === "good") {
    if (health.estimated_completion_date && health.pending_items > 0) {
      const date = formatDate(health.estimated_completion_date)
      return { message: `You'll finish everything by ${date}.`, variant: "success" }
    }
    return { message: "You are on track.", variant: "success" }
  }

  if (overdueMinutes > 0) {
    const hours = Math.ceil(overdueMinutes / 60)
    return { message: `You're ${hours} hour${hours > 1 ? "s" : ""} behind.`, variant: "destructive" }
  }

  if (health.health_score === "fair") {
    return { message: "You're slightly behind.", variant: "warning" }
  }

  return { message: "You're behind schedule.", variant: "destructive" }
}

function computeOverdueMinutes(backlog: PrioritizedBacklogItem[] | undefined): number {
  if (!backlog) return 0
  return backlog
    .filter((item) => item.overdue)
    .reduce((sum, item) => sum + (item.estimated_minutes || 30), 0)
}

/* ─── Animated Container ─── */

function Container({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  )
}

/* ─── Greeting + Status ─── */

function Greeting({
  name,
  status,
}: {
  name: string | null
  status: { message: string; variant: "success" | "warning" | "destructive" }
}) {
  const now = new Date()
  const hour = now.getHours()
  let greeting: string
  if (hour < 12) greeting = "Good morning"
  else if (hour < 17) greeting = "Good afternoon"
  else greeting = "Good evening"

  const displayName = name ? `, ${name}` : ""

  const statusColors = {
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    destructive: "text-red-600 dark:text-red-400",
  }

  const statusIcons = {
    success: CheckCircle2,
    warning: AlertTriangle,
    destructive: AlertTriangle,
  }

  const StatusIcon = statusIcons[status.variant]

  return (
    <div className="space-y-3">
      <motion.h1
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="text-2xl font-semibold tracking-tight"
      >
        {greeting}{displayName}
      </motion.h1>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, delay: 0.08 }}
        className="flex items-center gap-2"
      >
        <StatusIcon className={`h-4 w-4 ${statusColors[status.variant]}`} />
        <span className={`text-sm font-medium ${statusColors[status.variant]}`}>
          {status.message}
        </span>
      </motion.div>
    </div>
  )
}

/* ─── Today's Mission Card ─── */

function MissionCard({
  item,
  courseColor,
  isCurrent,
  onStart,
}: {
  item: { session: PlanSession; backlogItem?: PrioritizedBacklogItem }
  courseColor: string
  isCurrent: boolean
  onStart?: () => void
}) {
  const duration = getMinutesBetween(item.session.start_time, item.session.end_time)
  const difficulty = getDifficulty(item.backlogItem?.priority ?? 3)
  const subject = item.backlogItem?.course_name ?? "Study"
  const topic = item.session.reason

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="relative overflow-hidden rounded-2xl border bg-card shadow-sm"
    >
      <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: courseColor }} />

      <div className="p-6 sm:p-8">
        <div className="space-y-5">
          <div>
            {isCurrent ? (
              <div className="flex items-center gap-2">
                <div className="relative flex h-2 w-2">
                  <div className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/75 opacity-75" />
                  <div className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </div>
                <span className="text-xs font-medium text-primary">Now Studying</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>Today's Mission</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: courseColor + "20",
                color: courseColor,
              }}
            >
              {subject}
            </span>
            <Badge variant={difficulty.variant}>{difficulty.label}</Badge>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-semibold leading-snug tracking-tight">{topic}</h2>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                <span>{duration} min</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Target className="h-4 w-4" />
                <span>Finish by {formatTimeDisplay(item.session.end_time)}</span>
              </div>
            </div>
          </div>

          {isCurrent && onStart && (
            <motion.div
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.1 }}
            >
              <Button
                onClick={onStart}
                size="lg"
                className="w-full gap-2 h-14 text-base font-semibold rounded-xl shadow-lg"
              >
                <Play className="h-5 w-5 fill-current" />
                Start Focus
              </Button>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/* ─── Upcoming Session Card ─── */

function UpcomingSessionCard({
  session,
  backlogItem,
}: {
  session: PlanSession
  backlogItem?: PrioritizedBacklogItem
}) {
  const duration = getMinutesBetween(session.start_time, session.end_time)
  const subject = backlogItem?.course_name ?? "Study"
  const courseColor = backlogItem?.course_color ?? "#888"

  return (
    <motion.div
      whileHover={{ x: 4 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="flex items-center gap-4 rounded-xl border bg-card px-4 py-3.5"
    >
      <div
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: courseColor }}
      />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{subject}</p>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
        <span>{formatTimeDisplay(session.start_time)}</span>
        <span className="text-muted-foreground/40">·</span>
        <span>{duration} min</span>
      </div>
    </motion.div>
  )
}

/* ─── Daily Progress ─── */

function DailyProgress({ sessions }: { sessions: PlanSession[] }) {
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  const totalSessions = sessions.length
  const completedSessions = sessions.filter((s) => {
    const [eh, em] = s.end_time.split(":").map(Number)
    return eh * 60 + em <= currentMinutes
  }).length

  const totalMinutes = sessions.reduce((sum, s) => sum + getMinutesBetween(s.start_time, s.end_time), 0)
  const completedMinutes = sessions
    .filter((s) => {
      const [eh, em] = s.end_time.split(":").map(Number)
      return eh * 60 + em <= currentMinutes
    })
    .reduce((sum, s) => sum + getMinutesBetween(s.start_time, s.end_time), 0)

  const progress = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0

  if (totalSessions === 0) return null

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Today's Progress</span>
          <span className="text-sm font-semibold">{progress}%</span>
        </div>

        <Progress value={progress} className="h-2" />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{completedSessions} / {totalSessions} sessions complete</span>
          <span>{completedMinutes} / {totalMinutes} minutes studied</span>
        </div>
      </div>
    </div>
  )
}

/* ─── Backlog Health ─── */

function BacklogHealthCard({ health }: { health: BacklogHealth | undefined }) {
  if (!health) return null

  const isGood = health.health_score === "good"
  const isFair = health.health_score === "fair"

  const borderClass = isGood
    ? "border-emerald-200 dark:border-emerald-900"
    : isFair
      ? "border-amber-200 dark:border-amber-900"
      : "border-red-200 dark:border-red-900"

  const dotClass = isGood ? "bg-emerald-500" : isFair ? "bg-amber-500" : "bg-red-500"

  const labelClass = isGood
    ? "text-emerald-600 dark:text-emerald-400"
    : isFair
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-600 dark:text-red-400"

  const healthLabel = isGood ? "Comfortable" : isFair ? "Manageable" : "Falling behind"

  const completionDate = formatDate(health.estimated_completion_date)

  const daysUntilCompletion = health.estimated_completion_date
    ? Math.max(1, Math.ceil((new Date(health.estimated_completion_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 1

  const avgHoursPerDay =
    health.pending_items > 0 && health.estimated_completion_date
      ? ((health.pending_items * 30) / daysUntilCompletion / 60)
      : 0

  return (
    <div className={`rounded-xl border ${borderClass} bg-card p-5`}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${dotClass}`} />
            <span className="text-sm font-medium">Backlog Health</span>
          </div>
          <span className={`text-xs font-medium ${labelClass}`}>{healthLabel}</span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <div className="text-lg font-semibold tracking-tight">{health.pending_items}</div>
            <div className="text-[11px] text-muted-foreground">Pending topics</div>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <div className="text-lg font-semibold tracking-tight">
              {completionDate ?? "—"}
            </div>
            <div className="text-[11px] text-muted-foreground">Est. completion</div>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <div className="text-lg font-semibold tracking-tight">
              {avgHoursPerDay > 0 ? `${avgHoursPerDay.toFixed(1)}h` : "—"}
            </div>
            <div className="text-[11px] text-muted-foreground">Avg hrs/day</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Today's Insight ─── */

function TodayInsight({ insight }: { insight: { title: string; message: string } | undefined }) {
  if (!insight) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="rounded-xl border bg-card p-5"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Sprout className="h-4 w-4 text-primary" />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Today's Insight</span>
          </div>
          <p className="text-sm font-medium leading-snug text-card-foreground">
            {insight.title}
          </p>
          <p className="text-sm leading-relaxed text-card-foreground/70 max-w-[30ch]">
            {insight.message}
          </p>
        </div>
      </div>
    </motion.div>
  )
}

/* ─── Main Page ─── */

export function TodayMissionPage() {
  const navigate = useNavigate()
  const { data: profile, isLoading: profileLoading } = useProfile()
  const { data: preview, isLoading: previewLoading, error: previewError, refetch: refetchPreview } = usePlanningPreview()
  const { data: planData, isLoading: planLoading, error: planError, refetch: refetchPlan } = useGeneratePlan()
  const { data: streaks } = useStreaks()
  const { data: balanceScore } = useBalanceScore()
  const { data: insight } = useInsight()

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

  const backlogItemMap = useMemo(() => {
    if (!preview?.prioritized_backlog) return new Map<string, PrioritizedBacklogItem>()
    return new Map(preview.prioritized_backlog.map((item) => [item.id, item]))
  }, [preview])

  const plan = planData?.plan
  const sessions = plan?.sessions ?? []

  const currentSession = useMemo(() => (plan?.sessions ? getCurrentSession(plan.sessions) : null), [plan])
  const nextSession = useMemo(() => (plan?.sessions ? getNextSession(plan.sessions) : null), [plan])

  const missionSession = currentSession || nextSession
  const missionBacklogItem = missionSession ? backlogItemMap.get(missionSession.backlog_item_id) : undefined

  const otherSessions = useMemo(() => {
    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    return sessions.filter((s) => {
      if (s.backlog_item_id === currentSession?.backlog_item_id) return false
      if (s.backlog_item_id === nextSession?.backlog_item_id) return false
      const [eh, em] = s.end_time.split(":").map(Number)
      if (eh * 60 + em <= currentMinutes) return false
      return true
    })
  }, [sessions, currentSession, nextSession])

  const overdueMinutes = useMemo(() => computeOverdueMinutes(preview?.prioritized_backlog), [preview])
  const statusMessage = useMemo(() => getStatusMessage(preview?.backlog_health, overdueMinutes), [preview, overdueMinutes])

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
          <Skeleton className="h-12 w-56" />
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </Layout>
    )
  }

  if (hasError) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto space-y-5">
          <Greeting name={profile?.name ?? null} status={statusMessage} />
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-12 text-center">
            <p className="text-sm text-muted-foreground mb-4">Couldn't load your plan</p>
            <Button onClick={handleRefresh} variant="outline" size="sm">
              Try again
            </Button>
          </div>
        </div>
      </Layout>
    )
  }

  const missionCourseColor = missionBacklogItem?.course_color ?? "#888"

  return (
    <Layout>
      <div className="max-w-lg mx-auto space-y-6 pb-8">
        <Container delay={0}>
          <Greeting name={profile?.name ?? null} status={statusMessage} />
        </Container>

        {streaks?.momentum && (
          <Container delay={0.03}>
            <MomentumStreak
              currentStreak={streaks.momentum.current_streak}
              lastCompletedDate={streaks.momentum.last_completed_date}
              streakProtectedToday={streaks.momentum.streak_protected_today}
            />
          </Container>
        )}

        {streaks?.momentum && streaks.momentum.recovery_tokens_earned > 0 && (
          <Container delay={0.04}>
            <RecoveryTokens
              current={streaks.momentum.recovery_tokens_current}
              earned={streaks.momentum.recovery_tokens_earned}
              used={streaks.momentum.recovery_tokens_used}
            />
          </Container>
        )}

        <Container delay={0.05}>
          {missionSession ? (
            <MissionCard
              item={{ session: missionSession, backlogItem: missionBacklogItem }}
              courseColor={missionCourseColor}
              isCurrent={!!currentSession}
              onStart={handleStartStudy}
            />
          ) : (
            <EmptySessionState message="All caught up for today. Time to recharge." />
          )}
        </Container>

        {otherSessions.length > 0 && (
          <Container delay={0.1}>
            <div className="space-y-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Upcoming Today
              </h3>
              <div className="space-y-2">
                {otherSessions.slice(0, 4).map((session) => (
                  <UpcomingSessionCard
                    key={session.backlog_item_id + session.start_time}
                    session={session}
                    backlogItem={backlogItemMap.get(session.backlog_item_id)}
                  />
                ))}
              </div>
            </div>
          </Container>
        )}

        <Container delay={0.15}>
          <DailyProgress sessions={sessions} />
        </Container>

        <Container delay={0.2}>
          <BacklogHealthCard health={preview?.backlog_health} />
        </Container>

        {balanceScore && (
          <Container delay={0.22}>
            <BalanceScoreCard data={balanceScore} />
          </Container>
        )}

        {streaks?.subjects && streaks.subjects.length > 0 && (
          <Container delay={0.24}>
            <SubjectStreaksCard subjects={streaks.subjects} />
          </Container>
        )}

        <Container delay={0.25}>
          <TodayInsight insight={insight} />
        </Container>
      </div>
    </Layout>
  )
}
