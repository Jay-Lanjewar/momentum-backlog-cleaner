import { useState, useCallback } from "react"
import { AnimatePresence } from "framer-motion"
import {
  Activity,
  CheckCircle2,
  Target,
  BookOpen,
  Flame,
  Trophy,
  UserCircle,
  MoreHorizontal,
  Loader2,
  RefreshCw,
} from "lucide-react"

import { Layout } from "@/components/layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { FadeIn } from "@/components/ui/fade-in"
import { useActivityFeed } from "@/services/hooks"
import type { ActivityFeedItem } from "@/services/types"

const PAGE_SIZE = 20

/* ---------- Relative Time ---------- */

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffSec = Math.max(0, Math.floor((now - then) / 1000))

  if (diffSec < 60) return "Just now"
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? "s" : ""} ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return "Yesterday"
  if (diffDay < 7) return `${diffDay} days ago`
  return new Date(dateStr).toLocaleDateString()
}

/* ---------- Activity Config ---------- */

interface ActivityConfig {
  icon: React.ComponentType<{ className?: string }>
  label: string
  color: string
}

function getActivityConfig(type: string): ActivityConfig {
  switch (type) {
    case "TASK_COMPLETED":
      return { icon: CheckCircle2, label: "Completed a task", color: "text-emerald-500" }
    case "MISSION_COMPLETED":
      return { icon: Target, label: "Finished today's mission", color: "text-blue-500" }
    case "COURSE_CREATED":
      return { icon: BookOpen, label: "Created a new course", color: "text-violet-500" }
    case "STREAK_INCREASED":
      return { icon: Flame, label: "Reached a streak", color: "text-orange-500" }
    case "GOAL_ACHIEVED":
      return { icon: Trophy, label: "Achieved a goal", color: "text-yellow-500" }
    case "PROFILE_COMPLETED":
      return { icon: UserCircle, label: "Completed their profile", color: "text-pink-500" }
    default:
      return { icon: MoreHorizontal, label: "Did something new", color: "text-muted-foreground" }
  }
}

function getActivityDescription(type: string, extra: Record<string, unknown> | null): string {
  const config = getActivityConfig(type)
  if (type === "STREAK_INCREASED" && extra && typeof extra === "object" && "streak" in extra) {
    const streak = (extra as Record<string, unknown>).streak
    if (typeof streak === "number") return `Reached a ${streak}-day streak`
  }
  return config.label
}

/* ---------- User Avatar ---------- */

function UserAvatar({
  name,
  avatar_url,
  size = "md",
}: {
  name: string | null
  avatar_url?: string | null
  size?: "sm" | "md"
}) {
  const sizeClasses = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm"
  if (avatar_url) {
    return (
      <img src={avatar_url} alt={name || "User"} className={`${sizeClasses} rounded-full object-cover`} />
    )
  }
  return (
    <div className={`${sizeClasses} flex items-center justify-center rounded-full bg-primary/10 font-semibold text-primary`}>
      {name?.[0]?.toUpperCase() || "?"}
    </div>
  )
}

/* ---------- Activity Card ---------- */

function ActivityCard({ item, index }: { item: ActivityFeedItem; index: number }) {
  const { activity } = item
  const config = getActivityConfig(activity.type)
  const Icon = config.icon
  const description = getActivityDescription(activity.type, activity.extra)

  return (
    <FadeIn delay={0.03 * Math.min(index, 10)}>
      <div className="flex gap-3">
        {/* Timeline connector */}
        <div className="flex flex-col items-center">
          <div className={`flex h-9 w-9 items-center justify-center rounded-full bg-muted ${config.color}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="w-px flex-1 bg-border" />
        </div>

        {/* Card content */}
        <Card className="flex-1 mb-0">
          <CardContent className="p-3">
            <div className="flex items-start gap-3">
              <UserAvatar name={activity.user.name} avatar_url={activity.user.avatar_url} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-snug">
                  <span className="font-semibold">{activity.user.name || "Someone"}</span>{" "}
                  <span className="text-muted-foreground">{description.toLowerCase()}</span>
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {relativeTime(activity.occurred_at || activity.created_at)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </FadeIn>
  )
}

/* ---------- Loading Skeleton ---------- */

function FeedSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="w-px flex-1 mt-2" />
          </div>
          <Skeleton className="flex-1 h-16 rounded-xl" />
        </div>
      ))}
    </div>
  )
}

/* ---------- Empty State ---------- */

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
        <Activity className="h-8 w-8 text-muted-foreground/40" />
      </div>
      <p className="text-sm font-medium text-muted-foreground mb-1">No recent activity from your friends.</p>
      <p className="text-xs text-muted-foreground/60">Add friends to see what they're up to.</p>
    </div>
  )
}

/* ---------- Error State ---------- */

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 mb-4">
        <Activity className="h-8 w-8 text-destructive/40" />
      </div>
      <p className="text-sm font-medium text-muted-foreground mb-3">Failed to load activity feed.</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
        <RefreshCw className="h-3.5 w-3.5" />
        Retry
      </Button>
    </div>
  )
}

/* ---------- Main Page ---------- */

export function FeedPage() {
  const [offset, setOffset] = useState(0)
  const { data, isLoading, isError, refetch, isFetching } = useActivityFeed(PAGE_SIZE, offset)

  const activities = data ?? []
  const canLoadMore = activities.length === PAGE_SIZE

  const handleLoadMore = useCallback(() => {
    setOffset((prev) => prev + PAGE_SIZE)
  }, [])

  return (
    <Layout>
      <div className="space-y-6 pb-8">
        <FadeIn>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Activity</h1>
              <p className="text-sm text-muted-foreground">What your friends are up to</p>
            </div>
          </div>
        </FadeIn>

        {isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : isLoading ? (
          <FeedSkeleton />
        ) : activities.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-0">
            <AnimatePresence mode="popLayout">
              {activities.map((item, i) => (
                <ActivityCard key={item.activity.id} item={item} index={i} />
              ))}
            </AnimatePresence>

            {canLoadMore && (
              <FadeIn delay={0.05}>
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLoadMore}
                    disabled={isFetching}
                    className="gap-1.5"
                  >
                    {isFetching ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Activity className="h-3.5 w-3.5" />
                    )}
                    Load more
                  </Button>
                </div>
              </FadeIn>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
