import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import {
  Play,
  Clock,
  Target,
  AlertTriangle,
  CheckCircle2,
  Sprout,
} from "lucide-react"
import { toast } from "sonner"
import { useNavigate } from "react-router-dom"

import {
  usePlanningPreview,
  useGeneratePlan,
  useProfile,
  useUpdateBacklogItem,
  useStreaks,
  useBalanceScore,
  useInsight,
} from "@/services/hooks"
import { Layout } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { FadeIn } from "@/components/ui/fade-in"
import {
  MomentumStreak,
  RecoveryTokens,
  SubjectStreaksCard,
  BalanceScoreCard,
} from "@/components/streak-display"
import type {
  PlanSession,
  PrioritizedBacklogItem,
  BacklogHealth,
} from "@/services/types"

/* ─── Helpers ─── */

function getDifficulty(priority: number): {
  label: string
  variant: "destructive" | "warning" | "success"
} {
  if (priority <= 2) return { label: "Hard", variant: "destructive" }
  if (priority === 3) return { label: "Medium", variant: "warning" }
  return { label: "Easy", variant: "success" }
}

function getMinutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  return eh * 60 + em - (sh * 60 + sm)
}

function formatTimeDisplay(t: string): string {
  const [h, m] = t.split(":").map(Number)
  const period = h >= 12 ? "PM" : "AM"
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`
}

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function getStatusMessage(
  health: BacklogHealth | undefined,
  overdueMinutes: number
): { message: string; variant: "success" | "warning" | "destructive" } {
  if (!health) return { message: "You are on track.", variant: "success" }
  if (health.health_score === "good") {
    if (health.estimated_completion_date && health.pending_items > 0) {
      return {
        message: `You'll finish everything by ${formatDate(health.estimated_completion_date)}.`,
        variant: "success",
      }
    }
    return { message: "You are on track.", variant: "success" }
  }
  if (overdueMinutes > 0) {
    const hours = Math.ceil(overdueMinutes / 60)
    return {
      message: `You're ${hours} hour${hours > 1 ? "s" : ""} behind.`,
      variant: "destructive",
    }
  }
  if (health.health_score === "fair")
    return { message: "You're slightly behind.", variant: "warning" }
  return { message: "You're behind schedule.", variant: "destructive" }
}

function computeOverdueMinutes(
  backlog: PrioritizedBacklogItem[] | undefined
): number {
  if (!backlog) return 0
  return backlog
    .filter((item) => item.overdue)
    .reduce((sum, item) => sum + (item.estimated_minutes || 30), 0)
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

  const StatusIcon =
    status.variant === "success" ? CheckCircle2 : AlertTriangle

  return (
    <div className="space-y-3">
      <motion.h1
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="text-2xl font-semibold tracking-tight"
      >
        {greeting}
        {displayName}
      </motion.h1>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, delay: 0.08 }}
        className="flex items-center gap-2"
      >
        <StatusIcon
          className={`h-4 w-4 ${statusColors[status.variant]}`}
        />
        <span
          className={`text-sm font-medium ${statusColors[status.variant]}`}
        >
          {status.message}
        </span>
      </motion.div>
    </div>
  )
}

/* ─── Today's Progress ─── */

function TodayProgress({
  sessions,
  completedIds,
  profile,
}: {
  sessions: PlanSession[]
  completedIds: Set<string>
  profile: { daily_target_minutes: number | null } | undefined | null
}) {
  const completedMinutes = sessions
    .filter((s) => completedIds.has(s.backlog_item_id))
    .reduce(
      (sum, s) => sum + getMinutesBetween(s.start_time, s.end_time),
      0
    )

  const uniqueTasks = new Set(sessions.map((s) => s.backlog_item_id)).size
  const completedTasks = new Set(
    sessions
      .filter((s) => completedIds.has(s.backlog_item_id))
      .map((s) => s.backlog_item_id)
  ).size

  const progress = uniqueTasks > 0 ? Math.round((completedTasks / uniqueTasks) * 100) : 0

  if (uniqueTasks === 0) return null

  const dailyTarget = profile?.daily_target_minutes ?? 180
  const targetProgress = Math.min(100, Math.round((completedMinutes / dailyTarget) * 100))

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Today's Progress</span>
        <span className="text-sm font-semibold">{progress}%</span>
      </div>

      <Progress value={progress} className="h-2" />

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-muted/50 p-3 text-center">
          <div className="text-lg font-semibold tracking-tight">
            {completedMinutes}
          </div>
          <div className="text-[11px] text-muted-foreground">Minutes</div>
        </div>
        <div className="rounded-lg bg-muted/50 p-3 text-center">
          <div className="text-lg font-semibold tracking-tight">
            {completedTasks}/{uniqueTasks}
          </div>
          <div className="text-[11px] text-muted-foreground">Tasks</div>
        </div>
        <div className="rounded-lg bg-muted/50 p-3 text-center">
          <div className="text-lg font-semibold tracking-tight">
            {targetProgress}%
          </div>
          <div className="text-[11px] text-muted-foreground">Daily Target</div>
        </div>
      </div>
    </div>
  )
}

/* ─── Mission Card ─── */

function MissionCard({
  item,
  courseColor,
  isCurrent,
  isCompleted,
  onStart,
  onMarkComplete,
}: {
  item: { session: PlanSession; backlogItem?: PrioritizedBacklogItem }
  courseColor: string
  isCurrent: boolean
  isCompleted: boolean
  onStart?: () => void
  onMarkComplete?: () => void
}) {
  const duration = getMinutesBetween(
    item.session.start_time,
    item.session.end_time
  )
  const difficulty = getDifficulty(item.backlogItem?.priority ?? 3)
  const subject = item.backlogItem?.course_name ?? "Study"
  const topic = item.session.reason.replace(/^Work on\s+/, "")
  const remaining = item.session.remaining_minutes

  return (
    <motion.div
      layout
      whileHover={isCompleted ? undefined : { scale: 1.01 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={`relative overflow-hidden rounded-2xl border bg-card shadow-sm transition-all ${
        isCompleted ? "opacity-60" : ""
      }`}
    >
      <div
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: isCompleted ? "#22c55e" : courseColor }}
      />

      <div className="p-5 sm:p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            {isCurrent && !isCompleted ? (
              <div className="flex items-center gap-2">
                <div className="relative flex h-2 w-2">
                  <div className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/75 opacity-75" />
                  <div className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </div>
                <span className="text-xs font-medium text-primary">
                  Now Studying
                </span>
              </div>
            ) : isCompleted ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  Completed
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>Up Next</span>
              </div>
            )}
            {item.backlogItem?.due_date && (
              <Badge variant={item.backlogItem.overdue ? "destructive" : "outline"} className="text-[10px]">
                Due {formatDate(item.backlogItem.due_date)}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
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

          <div className="space-y-1">
            <h2 className="text-lg font-semibold leading-snug tracking-tight break-words">
              {topic}
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                <span>{duration} min</span>
              </div>
              {remaining > 0 && (
                <span className="text-xs text-muted-foreground/70">
                  · {remaining} min remaining after
                </span>
              )}
              {!isCompleted && (
                <div className="flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5" />
                  <span>by {formatTimeDisplay(item.session.end_time)}</span>
                </div>
              )}
            </div>
          </div>

          {!isCompleted && (
            <div className="flex gap-3">
              {isCurrent && onStart && (
                <motion.div
                  whileTap={{ scale: 0.98 }}
                  className="flex-1"
                >
                  <Button
                    onClick={onStart}
                    size="lg"
                    className="w-full gap-2 h-12 text-sm font-semibold rounded-xl"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    Start Focus
                  </Button>
                </motion.div>
              )}
              {onMarkComplete && (
                <Button
                  onClick={onMarkComplete}
                  variant="outline"
                  size="lg"
                  className="gap-2 h-12 text-sm rounded-xl"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Mark Complete
                </Button>
              )}
            </div>
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
  isCompleted,
  onMarkComplete,
}: {
  session: PlanSession
  backlogItem?: PrioritizedBacklogItem
  isCompleted: boolean
  onMarkComplete?: () => void
}) {
  const duration = getMinutesBetween(session.start_time, session.end_time)
  const courseColor = backlogItem?.course_color ?? "#888"
  const topic = session.reason.replace(/^Work on\s+/, "")

  return (
    <motion.div
      layout
      whileHover={{ x: 4 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={`flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-all ${
        isCompleted ? "opacity-60" : ""
      }`}
    >
      <button
        onClick={onMarkComplete}
        className="shrink-0 mt-0.5 h-10 w-10 flex items-center justify-center rounded-lg"
      >
        {isCompleted ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        ) : (
          <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 hover:border-emerald-500 transition-colors" />
        )}
      </button>

      <div
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: courseColor }}
      />

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isCompleted ? "line-through text-muted-foreground" : ""}`}>
          {topic}
        </p>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
        <span>{formatTimeDisplay(session.start_time)}</span>
        <span className="text-muted-foreground/40">·</span>
        <span>{duration} min</span>
        {session.remaining_minutes > 0 && (
          <span className="text-muted-foreground/60 text-[10px]">
            ({session.remaining_minutes} left)
          </span>
        )}
      </div>
    </motion.div>
  )
}

/* ─── Empty State ─── */

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 px-8 text-center"
    >
      <div className="mb-4 text-4xl">🎉</div>
      <h3 className="text-base font-semibold mb-1">You're done for today.</h3>
      <p className="text-sm text-muted-foreground max-w-xs">
        Enjoy your evening. Your plan is ready for tomorrow.
      </p>
    </motion.div>
  )
}

/* ─── Backlog Health ─── */

function BacklogHealthCard({
  health,
}: {
  health: BacklogHealth | undefined
}) {
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
    ? Math.max(
        1,
        Math.ceil(
          (new Date(health.estimated_completion_date).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
        )
      )
    : 1
  const avgHoursPerDay =
    health.pending_items > 0 && health.estimated_completion_date
      ? (health.pending_items * 30) / daysUntilCompletion / 60
      : 0

  return (
    <div className={`rounded-xl border ${borderClass} bg-card p-5`}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${dotClass}`} />
            <span className="text-sm font-medium">Backlog Health</span>
          </div>
          <span className={`text-xs font-medium ${labelClass}`}>
            {healthLabel}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <div className="text-lg font-semibold tracking-tight">
              {health.pending_items}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Pending topics
            </div>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <div className="text-lg font-semibold tracking-tight">
              {completionDate ?? "—"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Est. completion
            </div>
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

function TodayInsight({
  insight,
}: {
  insight: { title: string; message: string } | undefined
}) {
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
          <span className="text-xs font-medium text-muted-foreground">
            Today's Insight
          </span>
          <p className="text-sm font-medium leading-snug text-card-foreground">
            {insight.title}
          </p>
          <p className="text-sm leading-relaxed text-card-foreground/70">
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
  const {
    data: preview,
    isLoading: previewLoading,
    error: previewError,
    refetch: refetchPreview,
  } = usePlanningPreview()
  const {
    data: planData,
    isLoading: planLoading,
    error: planError,
    refetch: refetchPlan,
  } = useGeneratePlan()
  const { data: streaks } = useStreaks()
  const { data: balanceScore } = useBalanceScore()
  const { data: insight } = useInsight()
  const updateItem = useUpdateBacklogItem()

  const onboarded = localStorage.getItem("momentum_onboarded") === "true"

  useEffect(() => {
    if (profileLoading) return
    if (onboarded && profile) return
    if (!onboarded || !profile?.class_name) {
      navigate("/onboarding", { replace: true })
    }
  }, [profileLoading, onboarded, profile, navigate])

  const [completedSessionIds, setCompletedSessionIds] = useState<Set<string>>(
    new Set()
  )

  const isLoading = profileLoading || previewLoading || planLoading
  const hasError = previewError || planError

  const backlogItemMap = useMemo(() => {
    if (!preview?.prioritized_backlog)
      return new Map<string, PrioritizedBacklogItem>()
    return new Map(
      preview.prioritized_backlog.map((item) => [item.id, item])
    )
  }, [preview])

  const plan = planData?.plan
  const sessions = plan?.sessions ?? []

  const allCompleted = useMemo(() => {
    if (sessions.length === 0) return false
    const uniqueIds = new Set(sessions.map((s) => s.backlog_item_id))
    return [...uniqueIds].every((id) => completedSessionIds.has(id))
  }, [sessions, completedSessionIds])

  const currentSession = useMemo(
    () => (plan?.sessions ? getCurrentSession(plan.sessions) : null),
    [plan]
  )
  const nextSession = useMemo(
    () => (plan?.sessions ? getNextSession(plan.sessions) : null),
    [plan]
  )

  const missionSession = currentSession || nextSession
  const missionBacklogItem = missionSession
    ? backlogItemMap.get(missionSession.backlog_item_id)
    : undefined

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

  const overdueMinutes = useMemo(
    () => computeOverdueMinutes(preview?.prioritized_backlog),
    [preview]
  )
  const statusMessage = useMemo(
    () => getStatusMessage(preview?.backlog_health, overdueMinutes),
    [preview, overdueMinutes]
  )

  const handleRefresh = () => {
    refetchPreview()
    refetchPlan()
  }

  const handleStartStudy = () => {
    if (!currentSession || !plan) return
    navigate("/focus", {
      state: { session: currentSession, sessions, plan },
    })
  }

  const handleMarkComplete = (backlogItemId: string) => {
    setCompletedSessionIds((prev) => new Set([...prev, backlogItemId]))
    updateItem.mutateAsync({
      id: backlogItemId,
      payload: { status: "completed" },
    })
    toast.success("Task marked complete")
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-5 max-w-lg mx-auto">
          <Skeleton className="h-12 w-56" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      </Layout>
    )
  }

  if (hasError) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto space-y-5">
          <Greeting
            name={profile?.name ?? null}
            status={statusMessage}
          />
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-12 text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Couldn't load your plan
            </p>
            <Button onClick={handleRefresh} variant="outline" size="sm">
              Try again
            </Button>
          </div>
        </div>
      </Layout>
    )
  }

  const allDone = allCompleted || sessions.length === 0

  return (
    <Layout>
      <div className="max-w-lg mx-auto space-y-6 pb-8">
        <FadeIn delay={0}>
          <Greeting
            name={profile?.name ?? null}
            status={statusMessage}
          />
        </FadeIn>

        {streaks?.momentum && (
          <FadeIn delay={0.03}>
            <MomentumStreak
              currentStreak={streaks.momentum.current_streak}
              lastCompletedDate={streaks.momentum.last_completed_date}
              streakProtectedToday={
                streaks.momentum.streak_protected_today
              }
            />
          </FadeIn>
        )}

        {streaks?.momentum &&
          streaks.momentum.recovery_tokens_earned > 0 && (
            <FadeIn delay={0.04}>
              <RecoveryTokens
                current={streaks.momentum.recovery_tokens_current}
                earned={streaks.momentum.recovery_tokens_earned}
                used={streaks.momentum.recovery_tokens_used}
              />
            </FadeIn>
          )}

        <FadeIn delay={0.08}>
          <TodayProgress
            sessions={sessions}
            completedIds={completedSessionIds}
            profile={profile}
          />
        </FadeIn>

        <FadeIn delay={0.1}>
          {allDone ? (
            <EmptyState />
          ) : missionSession ? (
            <MissionCard
              item={{ session: missionSession, backlogItem: missionBacklogItem }}
              courseColor={missionBacklogItem?.course_color ?? "#888"}
              isCurrent={!!currentSession}
              isCompleted={completedSessionIds.has(
                missionSession.backlog_item_id
              )}
              onStart={handleStartStudy}
              onMarkComplete={() =>
                handleMarkComplete(missionSession.backlog_item_id)
              }
            />
          ) : (
            <EmptyState />
          )}
        </FadeIn>

        {otherSessions.length > 0 && (
          <FadeIn delay={0.12}>
            <div className="space-y-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Upcoming Today
              </h3>
              <div className="space-y-2">
                {otherSessions.map((session) => (
                  <UpcomingSessionCard
                    key={`${session.backlog_item_id}-${session.start_time}`}
                    session={session}
                    backlogItem={backlogItemMap.get(
                      session.backlog_item_id
                    )}
                    isCompleted={completedSessionIds.has(
                      session.backlog_item_id
                    )}
                    onMarkComplete={() =>
                      handleMarkComplete(session.backlog_item_id)
                    }
                  />
                ))}
              </div>
            </div>
          </FadeIn>
        )}

        {sessions.length > 0 && (
          <FadeIn delay={0.15}>
            <BacklogHealthCard health={preview?.backlog_health} />
          </FadeIn>
        )}

        {balanceScore && (
          <FadeIn delay={0.18}>
            <BalanceScoreCard data={balanceScore} />
          </FadeIn>
        )}

        {streaks?.subjects && streaks.subjects.length > 0 && (
          <FadeIn delay={0.2}>
            <SubjectStreaksCard subjects={streaks.subjects} />
          </FadeIn>
        )}

        <FadeIn delay={0.22}>
          <TodayInsight insight={insight} />
        </FadeIn>
      </div>
    </Layout>
  )
}

/* ─── Local session helpers ─── */

function getCurrentSession(sessions: PlanSession[]): PlanSession | null {
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  return (
    sessions.find((s) => {
      const [sh, sm] = s.start_time.split(":").map(Number)
      const [eh, em] = s.end_time.split(":").map(Number)
      return currentMinutes >= sh * 60 + sm && currentMinutes < eh * 60 + em
    }) ?? null
  )
}

function getNextSession(sessions: PlanSession[]): PlanSession | null {
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const upcoming = sessions
    .filter((s) => {
      const [sh, sm] = s.start_time.split(":").map(Number)
      return sh * 60 + sm > currentMinutes
    })
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
  return upcoming[0] ?? null
}
