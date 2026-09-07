import { useState, useMemo } from "react"
import { motion } from "framer-motion"
import { ArrowRight, CheckCircle2, Clock, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatTimeDisplay } from "@/lib/coaching"
import type { PlanChange, PlanSession } from "@/services/types"

interface ScheduleChangePanelProps {
  changes: PlanChange[]
  previous_sessions?: PlanSession[]
  current_sessions?: PlanSession[]
  onDismiss: () => void
}

function topicFromSession(session: PlanSession): string {
  return session.reason.replace(/^Work on\s+/, "")
}

/* ─── Timeline bar ─── */

function TimelineBar({
  sessions,
  changedSessionIds,
  minStart,
  span,
  overflowIds,
}: {
  sessions: PlanSession[]
  changedSessionIds: Set<string>
  minStart: number
  span: number
  overflowIds?: Set<string>
}) {
  if (sessions.length === 0 || span <= 0) return null

  return (
    <div className="relative h-5">
      <div className="absolute inset-y-0 left-0 right-0 rounded-full bg-secondary/40" />
      {sessions.map((session) => {
        const [sh, sm] = session.start_time.split(":").map(Number)
        const [eh, em] = session.end_time.split(":").map(Number)
        const startMin = sh * 60 + sm
        const endMin = eh * 60 + em
        const left = ((startMin - minStart) / span) * 100
        const width = Math.max(4, ((endMin - startMin) / span) * 100)
        const isChanged = changedSessionIds.has(session.session_id)

        return (
          <div
            key={session.session_id}
            title={`${topicFromSession(session)} (${formatTimeDisplay(session.start_time)} – ${formatTimeDisplay(session.end_time)})`}
            className={`absolute inset-y-0.5 rounded-full transition-opacity ${
              isChanged ? "ring-2 ring-primary/60 opacity-90" : "opacity-50"
            }`}
            style={{
              left: `${left}%`,
              width: `${width}%`,
              backgroundColor: isChanged ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
            }}
          />
        )
      })}
      {overflowIds && overflowIds.size > 0 && (
        <div className="absolute -right-1 inset-y-0 flex items-center">
          <span className="text-[9px] text-amber-500 font-medium whitespace-nowrap">
            +{overflowIds.size} tomorrow
          </span>
        </div>
      )}
    </div>
  )
}

/* ─── Session legend ─── */

function SessionLegend({
  sessions,
  changedSessionIds,
  overflowIds,
}: {
  sessions: PlanSession[]
  changedSessionIds: Set<string>
  overflowIds?: Set<string>
}) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
      {sessions.map((session) => {
        const isChanged = changedSessionIds.has(session.session_id)
        const isOverflow = overflowIds?.has(session.backlog_item_id) ?? false
        return (
          <div key={session.session_id} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <div
              className={`h-2 w-2 rounded-full shrink-0 ${isChanged ? "ring-1 ring-primary/60" : ""}`}
              style={{
                backgroundColor: isChanged
                  ? "hsl(var(--primary))"
                  : isOverflow
                    ? "hsl(var(--amber-500))"
                    : "hsl(var(--muted-foreground))",
                opacity: isChanged ? 1 : 0.5,
              }}
            />
            <span className={isChanged ? "font-medium text-foreground" : ""}>
              {topicFromSession(session)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ─── Change row ─── */

function ChangeRow({ change }: { change: PlanChange }) {
  const isOverflow = change.change_type === "moved_to_overflow"
  const isRemoved = change.change_type === "removed"

  return (
    <div className="flex items-start gap-3 py-2">
      <div className={`h-5 w-5 shrink-0 mt-0.5 rounded-full flex items-center justify-center ${
        isOverflow || isRemoved ? "bg-amber-500/10" : "bg-blue-500/10"
      }`}>
        {isOverflow || isRemoved ? (
          <Clock className="h-3 w-3 text-amber-500" />
        ) : (
          <ArrowRight className="h-3 w-3 text-blue-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{change.title}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
          {change.previous_start && change.previous_end && (
            <span className="line-through">
              {formatTimeDisplay(change.previous_start)} - {formatTimeDisplay(change.previous_end)}
            </span>
          )}
          {change.previous_start && change.previous_end && (change.new_start || isOverflow || isRemoved) && (
            <span>{" -> "}</span>
          )}
          {change.new_start && change.new_end ? (
            <span className="font-medium text-foreground">
              {formatTimeDisplay(change.new_start)} - {formatTimeDisplay(change.new_end)}
            </span>
          ) : isOverflow ? (
            <span className="font-medium text-amber-600 dark:text-amber-400">
              Next available day
            </span>
          ) : isRemoved ? (
            <span className="font-medium text-muted-foreground">
              Completed
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/* ─── Main panel ─── */

export function ScheduleChangePanel({
  changes,
  previous_sessions = [],
  current_sessions = [],
  onDismiss,
}: ScheduleChangePanelProps) {
  const [expanded, setExpanded] = useState(true)

  const changedSessionIds = useMemo(
    () => new Set(changes.map((c) => c.session_id)),
    [changes]
  )

  const overflowIds = useMemo(() => {
    const ids = new Set<string>()
    for (const c of changes) {
      if (c.change_type === "moved_to_overflow") {
        ids.add(c.backlog_item_id)
      }
    }
    return ids
  }, [changes])

  const { beforeMin, afterMin, span } = useMemo(() => {
    let allMin = Infinity
    let allMax = 0
    for (const s of previous_sessions) {
      const [sh, sm] = s.start_time.split(":").map(Number)
      const [eh, em] = s.end_time.split(":").map(Number)
      allMin = Math.min(allMin, sh * 60 + sm)
      allMax = Math.max(allMax, eh * 60 + em)
    }
    for (const s of current_sessions) {
      const [sh, sm] = s.start_time.split(":").map(Number)
      const [eh, em] = s.end_time.split(":").map(Number)
      allMin = Math.min(allMin, sh * 60 + sm)
      allMax = Math.max(allMax, eh * 60 + em)
    }
    if (!isFinite(allMin)) { allMin = 0; allMax = 60 }
    const padding = Math.max(5, (allMax - allMin) * 0.05)
    return { beforeMin: allMin - padding, afterMin: allMin - padding, span: (allMax - allMin) + padding * 2 }
  }, [previous_sessions, current_sessions])

  const hasTimelines = previous_sessions.length > 0 || current_sessions.length > 0

  if (changes.length === 0) return null

  const primaryChange = changes[0]
  const hasMore = changes.length > 1

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="rounded-xl border bg-card overflow-hidden"
    >
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Schedule Updated
          </span>
        </div>

        <p className="text-sm text-muted-foreground mb-3">
          {primaryChange.reason}
        </p>

        {hasTimelines && (
          <div className="space-y-3 mb-3">
            {previous_sessions.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-medium">Before</p>
                <TimelineBar
                  sessions={previous_sessions}
                  changedSessionIds={changedSessionIds}
                  minStart={beforeMin}
                  span={span}
                />
                <SessionLegend sessions={previous_sessions} changedSessionIds={changedSessionIds} />
              </div>
            )}

            {current_sessions.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-medium">After</p>
                <TimelineBar
                  sessions={current_sessions}
                  changedSessionIds={changedSessionIds}
                  minStart={afterMin}
                  span={span}
                  overflowIds={overflowIds}
                />
                <SessionLegend
                  sessions={current_sessions}
                  changedSessionIds={changedSessionIds}
                  overflowIds={overflowIds}
                />
              </div>
            )}
          </div>
        )}

        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            {expanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            {expanded ? "Show less" : `Show ${changes.length - 1} more change${changes.length - 1 > 1 ? "s" : ""}`}
          </button>
        )}

        {expanded && (
          <div className="space-y-1 divide-y divide-border/50">
            {changes.map((change) => (
              <ChangeRow key={change.session_id} change={change} />
            ))}
          </div>
        )}
      </div>

      <div className="border-t bg-muted/30 px-4 py-3">
        <Button
          onClick={onDismiss}
          variant="ghost"
          size="sm"
          className="w-full"
        >
          Got it
        </Button>
      </div>
    </motion.div>
  )
}
