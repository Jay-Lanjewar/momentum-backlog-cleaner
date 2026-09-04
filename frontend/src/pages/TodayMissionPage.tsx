import { useEffect, useMemo } from "react"
import { motion } from "framer-motion"
import {
  Play,
  CheckCircle2,
  BookOpen,
  Plus,
  ChevronRight,
  ListTodo,
  Clock,
  AlertTriangle,
} from "lucide-react"
import { useNavigate } from "react-router-dom"

import { useDashboard } from "@/services/hooks"
import { Layout } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { FadeIn } from "@/components/ui/fade-in"
import { CoachMessage } from "@/components/coach/coach-message"
import { RecommendedNextCard } from "@/components/coach/recommended-next"
import { ProgressOverview } from "@/components/progress-overview"
import type {
  PlanSession,
  PrioritizedBacklogItem,
  BacklogHealth,
} from "@/services/types"
import {
  buildBacklogStatusSummary,
  buildCoachingExplanation,
  buildHeroSubtitle,
  buildRecommendationReason,
  daysUntilDue,
  formatMinutes,
  formatShortDate,
  formatTimeDisplay,
  getGreeting,
  minutesBetween,
} from "@/lib/coaching"

/* ─── Helpers ─── */

function topicFromSession(session: PlanSession): string {
  return session.reason.replace(/^Work on\s+/, "")
}

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

/* ─── Greeting ─── */

function Greeting({ name, subtitle }: { name: string | null; subtitle: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="space-y-1"
    >
      <h1 className="text-2xl font-semibold tracking-tight">
        {getGreeting()}
        {name ? `, ${name}` : ""}
      </h1>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </motion.div>
  )
}

/* ─── Backlog Status ─── */

function BacklogStatus({
  totalItems,
  overdueItems,
  pendingItems,
  totalRequiredMinutes,
  estimatedDaysToClear,
}: {
  totalItems: number
  overdueItems: number
  pendingItems: number
  totalRequiredMinutes: number
  estimatedDaysToClear: number | null
}) {
  const status = buildBacklogStatusSummary({
    totalItems,
    overdueItems,
    pendingItems,
    totalRequiredMinutes,
    estimatedDaysToClear,
  })

  if (totalItems === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="rounded-xl border bg-card p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <ListTodo className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Backlog Status
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/70">
            <ListTodo className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold tabular-nums">
              {status.remainingTasks} task{status.remainingTasks !== 1 ? "s" : ""}
            </p>
            <p className="text-[11px] text-muted-foreground">remaining</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/70">
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold">{status.remainingHours}</p>
            <p className="text-[11px] text-muted-foreground">of study time</p>
          </div>
        </div>
        {status.overdueCount > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
              <AlertTriangle className="h-4 w-4 text-red-500 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-red-500 dark:text-red-400">
                {status.overdueCount} overdue
              </p>
              <p className="text-[11px] text-muted-foreground">needs attention</p>
            </div>
          </div>
        )}
        {status.clearEstimate && (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <CheckCircle2 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">{status.clearEstimate}</p>
              <p className="text-[11px] text-muted-foreground">to clear all</p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

/* ─── Up Next ─── */

function UpNextRow({
  session,
  item,
  completed,
  onStart,
}: {
  session: PlanSession
  item?: PrioritizedBacklogItem
  completed: boolean
  onStart: () => void
}) {
  const duration = minutesBetween(session.start_time, session.end_time)
  const topic = topicFromSession(session)
  const color = item?.course_color ?? "#888"
  const subject = item?.course_name ?? "Study"

  return (
    <motion.div
      layout
      whileHover={completed ? undefined : { x: 3 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={`flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-all ${
        completed ? "opacity-55" : ""
      }`}
    >
      {completed ? (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
      ) : (
        <div className="h-9 w-14 shrink-0 rounded-lg bg-muted/70 flex items-center justify-center">
          <span className="text-[11px] font-medium text-muted-foreground">
            {formatTimeDisplay(session.start_time)}
          </span>
        </div>
      )}

      <div
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />

      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium truncate ${
            completed ? "line-through text-muted-foreground" : ""
          }`}
        >
          {topic}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {subject} · {duration} min
        </p>
      </div>

      {!completed && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onStart}
          aria-label={`Start ${topic}`}
          className="gap-1.5 shrink-0"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          Start
        </Button>
      )}
    </motion.div>
  )
}

/* ─── Empty states ─── */

function NoWorkEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-14 px-8 text-center"
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/5">
        <BookOpen className="h-7 w-7 text-primary/50" />
      </div>
      <h3 className="text-base font-semibold mb-1">No work yet.</h3>
      <p className="text-sm text-muted-foreground mb-5 max-w-xs">
        Add your homework and Momentum will automatically build today's study
        plan.
      </p>
      <Button onClick={onAdd} className="gap-1.5">
        <Plus className="h-4 w-4" />
        Add Work
      </Button>
    </motion.div>
  )
}

function AllDoneEmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-14 px-8 text-center"
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
        <CheckCircle2 className="h-7 w-7 text-emerald-500" />
      </div>
      <h3 className="text-base font-semibold mb-1">All caught up for today.</h3>
      <p className="text-sm text-muted-foreground max-w-xs">
        Momentum is lining up your next mission. Check back tomorrow to keep
        your streak alive.
      </p>
    </motion.div>
  )
}

/* ─── Main Page ─── */

export function TodayMissionPage() {
  const navigate = useNavigate()
  const { data: dashboard, isLoading, error, refetch } = useDashboard()

  const profile = dashboard?.profile
  const preview = dashboard?.planning
  const planData = dashboard?.plan
  const streaks = dashboard?.streaks

  const onboarded = localStorage.getItem("momentum_onboarded") === "true"

  useEffect(() => {
    if (!onboarded) {
      navigate("/onboarding", { replace: true })
      return
    }
    if (isLoading) return
    if (!dashboard?.profile?.class_name) {
      navigate("/onboarding", { replace: true })
    }
  }, [onboarded, isLoading, dashboard, navigate])

  const backlogItemMap = useMemo(() => {
    if (!preview?.prioritized_backlog)
      return new Map<string, PrioritizedBacklogItem>()
    return new Map(
      preview.prioritized_backlog.map((item) => [item.id, item])
    )
  }, [preview])

  const sessions = planData?.plan?.sessions ?? []
  const health: BacklogHealth | undefined = preview?.backlog_health

  const isSessionCompleted = (s: PlanSession): boolean =>
    backlogItemMap.get(s.backlog_item_id)?.status === "completed"

  const activeSessions = useMemo(
    () => sessions.filter((s) => !isSessionCompleted(s)),
    [sessions, backlogItemMap]
  )

  const currentSession = useMemo(
    () => getCurrentSession(activeSessions),
    [activeSessions]
  )
  const nextSession = useMemo(
    () => getNextSession(activeSessions),
    [activeSessions]
  )
  const missionSession = currentSession || nextSession
  const missionBacklogItem = missionSession
    ? backlogItemMap.get(missionSession.backlog_item_id)
    : undefined

  const upcomingSessions = useMemo(() => {
    const missionId = missionSession?.backlog_item_id
    return activeSessions.filter(
      (s) => s.backlog_item_id !== missionId
    )
  }, [activeSessions, missionSession])

  const recommendationReason = useMemo(() => {
    if (!missionSession) return null
    const item = missionBacklogItem
    return buildRecommendationReason({
      subject: item?.course_name ?? "Study",
      topic: topicFromSession(missionSession),
      overdue: item?.overdue ?? false,
      dueDate: item?.due_date ?? null,
      isCurrent: !!currentSession,
      healthScore: health?.health_score,
    })
  }, [missionSession, missionBacklogItem, currentSession, health])

  const coachingExplanation = useMemo(() => {
    if (!missionSession) return null
    const item = missionBacklogItem
    const backlogTotal = preview?.prioritized_backlog?.length ?? 0
    const overdueCount = preview?.backlog_health?.overdue_items ?? 0
    const sessionMinutes = minutesBetween(
      missionSession.start_time,
      missionSession.end_time
    )
    return buildCoachingExplanation({
      backlogTotal,
      overdueCount,
      isOverdue: item?.overdue ?? false,
      subject: item?.course_name ?? "Study",
      healthScore: health?.health_score,
      estimatedMinutes: item?.estimated_minutes ?? null,
      sessionMinutes,
      dueDate: item?.due_date ?? null,
      priority: item?.priority ?? null,
      isCurrentSession: !!currentSession,
      totalAvailableMinutes: preview?.total_available_minutes ?? 0,
    })
  }, [missionSession, missionBacklogItem, preview, health, currentSession])

  const coachingTone =
    health?.health_score === "critical"
      ? "destructive"
      : health?.health_score === "fair"
        ? "warning"
        : "success"

  const progress = useMemo(() => {
    const uniqueIds = new Set(sessions.map((s) => s.backlog_item_id))
    const uniqueTasks = uniqueIds.size
    const completedTasks = [...uniqueIds].filter((id) => {
      const item = backlogItemMap.get(id)
      return item?.status === "completed"
    }).length
    const studyMinutes = sessions
      .filter((s) => backlogItemMap.get(s.backlog_item_id)?.status === "completed")
      .reduce((sum, s) => sum + minutesBetween(s.start_time, s.end_time), 0)
    const dailyTarget = profile?.daily_target_minutes ?? 180

    const activeItems = activeSessions
      .map((s) => backlogItemMap.get(s.backlog_item_id))
      .filter((i): i is PrioritizedBacklogItem => !!i && !!i.due_date && !i.overdue)
      .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
    const nextDeadline = activeItems[0]
    const deadline = nextDeadline
      ? {
          label: nextDeadline.course_name,
          dateText:
            daysUntilDue(nextDeadline.due_date) === 0
              ? "Today"
              : daysUntilDue(nextDeadline.due_date) === 1
                ? "Tomorrow"
                : formatShortDate(nextDeadline.due_date) ?? "",
        }
      : null

    const sorted = [...sessions].sort((a, b) =>
      a.start_time.localeCompare(b.start_time)
    )
    const timeline = sorted.map((s) => {
      const [sh, sm] = s.start_time.split(":").map(Number)
      const [eh, em] = s.end_time.split(":").map(Number)
      const item = backlogItemMap.get(s.backlog_item_id)
      return {
        color: item?.course_color ?? "#888",
        startMinutes: sh * 60 + sm,
        endMinutes: eh * 60 + em,
        completed: item?.status === "completed",
        label: topicFromSession(s),
      }
    })

    return {
      uniqueTasks,
      completedTasks,
      studyMinutes,
      dailyTarget,
      deadline,
      timeline,
    }
  }, [sessions, activeSessions, backlogItemMap, profile])

  const handleRefresh = () => {
    refetch()
  }

  const handleStartStudy = (session: PlanSession) => {
    if (!planData?.plan) return
    navigate("/focus", {
      state: {
        session,
        sessions,
        plan: planData.plan,
      },
    })
  }

  const heroSubtitle = useMemo(
    () =>
      buildHeroSubtitle(preview?.prioritized_backlog?.length ?? 0, profile?.name ?? null),
    [preview, profile]
  )

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-5 max-w-lg mx-auto">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </Layout>
    )
  }

  if (error) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto space-y-5">
          <Greeting name={profile?.name ?? null} subtitle="Couldn't load your plan." />
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-12 text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Something went wrong loading your dashboard.
            </p>
            <Button onClick={handleRefresh} variant="outline" size="sm">
              Try again
            </Button>
          </div>
        </div>
      </Layout>
    )
  }

  const hasWork = (preview?.prioritized_backlog?.length ?? 0) > 0
  const allDone =
    activeSessions.length === 0 && sessions.length > 0

  const missionDuration = missionSession
    ? minutesBetween(missionSession.start_time, missionSession.end_time)
    : 0

  return (
    <Layout>
      <div className="max-w-lg mx-auto space-y-5 pb-8">
        <FadeIn delay={0}>
          <Greeting name={profile?.name ?? null} subtitle={heroSubtitle} />
        </FadeIn>

        {!hasWork ? (
          <FadeIn delay={0.05}>
            <NoWorkEmptyState onAdd={() => navigate("/backlog")} />
          </FadeIn>
        ) : allDone ? (
          <FadeIn delay={0.05}>
            <AllDoneEmptyState />
          </FadeIn>
        ) : missionSession ? (
          <>
            <FadeIn delay={0.05}>
              <RecommendedNextCard
                task={topicFromSession(missionSession)}
                subject={missionBacklogItem?.course_name ?? "Study"}
                courseColor={missionBacklogItem?.course_color ?? "#6366f1"}
                durationLabel={formatMinutes(missionDuration)}
                reason={recommendationReason ?? missionSession.reason}
                eyebrow="Your Next Move"
                bestTime={formatTimeDisplay(missionSession.start_time)}
                finishTime={formatTimeDisplay(missionSession.end_time)}
                overdue={missionBacklogItem?.overdue ?? false}
                ctaLabel="Start Focus Session"
                onStart={() => handleStartStudy(missionSession)}
              />
            </FadeIn>

            {coachingExplanation && (
              <FadeIn delay={0.1}>
                <CoachMessage tone={coachingTone}>
                  {coachingExplanation}
                </CoachMessage>
              </FadeIn>
            )}
          </>
        ) : null}

        {hasWork && (
          <FadeIn delay={0.15}>
            <BacklogStatus
              totalItems={health?.total_items ?? 0}
              overdueItems={health?.overdue_items ?? 0}
              pendingItems={health?.pending_items ?? 0}
              totalRequiredMinutes={preview?.total_required_minutes ?? 0}
              estimatedDaysToClear={preview?.estimated_days_to_clear ?? null}
            />
          </FadeIn>
        )}

        {sessions.length > 0 && (
          <FadeIn delay={0.2}>
            <ProgressOverview
              tasksDone={progress.completedTasks}
              tasksTotal={progress.uniqueTasks}
              studyMinutes={progress.studyMinutes}
              targetMinutes={progress.dailyTarget}
              streakDays={streaks?.momentum.current_streak ?? null}
              deadlineLabel={progress.deadline?.label ?? null}
              deadlineDate={progress.deadline?.dateText ?? null}
              timeline={progress.timeline}
            />
          </FadeIn>
        )}

        {upcomingSessions.length > 0 && (
          <FadeIn delay={0.25}>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Up Next Today
                </h3>
                <span className="text-xs text-muted-foreground">
                  {upcomingSessions.length} session
                  {upcomingSessions.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="space-y-2">
                {upcomingSessions.map((session) => (
                  <UpNextRow
                    key={`${session.backlog_item_id}-${session.start_time}`}
                    session={session}
                    item={backlogItemMap.get(session.backlog_item_id)}
                    completed={isSessionCompleted(session)}
                    onStart={() => handleStartStudy(session)}
                  />
                ))}
              </div>
            </div>
          </FadeIn>
        )}

        {hasWork && sessions.length > 0 && (
          <FadeIn delay={0.3}>
            <button
              onClick={() => navigate("/backlog")}
              className="flex w-full items-center justify-center gap-1 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <span>View all pending work</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </FadeIn>
        )}
      </div>
    </Layout>
  )
}
