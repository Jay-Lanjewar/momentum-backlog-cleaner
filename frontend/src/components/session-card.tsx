import { Clock, AlertCircle, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/cn"
import type { PlanSession } from "@/services/types"

function getCurrentTime() {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

function parseTime(t: string) {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

function formatTimeDisplay(t: string) {
  const [h, m] = t.split(":").map(Number)
  const period = h >= 12 ? "PM" : "AM"
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`
}

export function getCurrentSession(sessions: PlanSession[]): PlanSession | null {
  const now = getCurrentTime()
  return sessions.find((s) => {
    const start = parseTime(s.start_time)
    const end = parseTime(s.end_time)
    return now >= start && now < end
  }) ?? null
}

export function getNextSession(sessions: PlanSession[]): PlanSession | null {
  const now = getCurrentTime()
  const upcoming = sessions
    .filter((s) => parseTime(s.start_time) > now)
    .sort((a, b) => parseTime(a.start_time) - parseTime(b.start_time))
  return upcoming[0] ?? null
}

function getMinutesUntil(time: string) {
  const now = getCurrentTime()
  const target = parseTime(time)
  const diff = target - now
  return diff > 0 ? diff : 0
}

export function SessionCard({
  session,
  isCurrent = false,
}: {
  session: PlanSession
  isCurrent?: boolean
}) {
  const minutesUntil = isCurrent ? 0 : getMinutesUntil(session.start_time)
  const duration = parseTime(session.end_time) - parseTime(session.start_time)

  return (
    <div
      className={cn(
        "group relative rounded-xl border p-4 transition-all duration-300",
        isCurrent
          ? "border-primary/30 bg-primary/5 shadow-sm"
          : "border-border hover:border-muted-foreground/20 hover:bg-muted/30"
      )}
    >
      {isCurrent && (
        <div className="absolute -inset-px rounded-xl ring-1 ring-primary/20 animate-pulse" />
      )}

      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            isCurrent ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          {isCurrent ? (
            <div className="relative flex h-3 w-3">
              <div className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/75 opacity-75" />
              <div className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
            </div>
          ) : (
            <Clock className="h-4 w-4" />
          )}
        </div>

        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {isCurrent ? "Now Studying" : "Up Next"}
            </span>
            <span className="text-xs text-muted-foreground">
              {duration} min
            </span>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-1">{session.reason}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatTimeDisplay(session.start_time)}</span>
            <span>–</span>
            <span>{formatTimeDisplay(session.end_time)}</span>
            {!isCurrent && minutesUntil > 0 && minutesUntil <= 60 && (
              <span className="ml-auto text-amber-600 dark:text-amber-400 font-medium">
                in {minutesUntil} min
              </span>
            )}
          </div>
        </div>
      </div>

      {isCurrent && (
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-primary/10">
          <div className="h-full w-2/3 rounded-full bg-primary transition-all duration-1000" />
        </div>
      )}
    </div>
  )
}

export function EmptySessionState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
      <CheckCircle2 className="h-8 w-8 text-muted-foreground/50 mb-2" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

export function OfflineBanner() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span>Using offline mode. Some features may be limited.</span>
    </div>
  )
}
