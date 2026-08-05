import { motion } from "framer-motion"
import { CheckCircle2, Clock, Flame, CalendarDays } from "lucide-react"

export interface TimelineBlock {
  color: string
  startMinutes: number
  endMinutes: number
  completed: boolean
  label: string
}

export interface ProgressOverviewProps {
  tasksDone: number
  tasksTotal: number
  studyMinutes: number
  targetMinutes: number
  streakDays?: number | null
  deadlineLabel?: string | null
  deadlineDate?: string | null
  timeline?: TimelineBlock[]
}

export function ProgressOverview({
  tasksDone,
  tasksTotal,
  studyMinutes,
  targetMinutes,
  streakDays,
  deadlineLabel,
  deadlineDate,
  timeline = [],
}: ProgressOverviewProps) {
  const target = Math.max(1, targetMinutes)
  const taskPercent = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0
  const timePercent = Math.min(100, Math.round((studyMinutes / target) * 100))

  const hasTimeline = timeline.length > 0
  const minStart = Math.min(...timeline.map((b) => b.startMinutes))
  const maxEnd = Math.max(...timeline.map((b) => b.endMinutes))
  const span = Math.max(1, maxEnd - minStart)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="rounded-xl border bg-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium">Today's Progress</span>
        <span className="text-sm font-semibold tabular-nums">
          {tasksTotal > 0 ? `${taskPercent}%` : "—"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <CheckCircle2 className="h-3 w-3" /> Tasks
          </div>
          <p className="mt-0.5 text-lg font-semibold tracking-tight tabular-nums">
            {tasksTotal > 0 ? `${tasksDone}/${tasksTotal}` : "—"}
          </p>
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Clock className="h-3 w-3" /> Study Time
          </div>
          <p className="mt-0.5 text-lg font-semibold tracking-tight tabular-nums">
            {`${studyMinutes}/${target} min`}
          </p>
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Flame className="h-3 w-3" /> Streak
          </div>
          <p className="mt-0.5 text-lg font-semibold tracking-tight tabular-nums">
            {streakDays != null ? `${streakDays} days` : "—"}
          </p>
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <CalendarDays className="h-3 w-3" /> Next Deadline
          </div>
          <p className="mt-0.5 text-sm font-semibold truncate">
            {deadlineLabel ?? "—"}
          </p>
          {deadlineDate && (
            <p className="text-[11px] text-muted-foreground">{deadlineDate}</p>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>Daily target</span>
          <span>{timePercent}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${timePercent}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="h-full rounded-full bg-primary"
          />
        </div>
      </div>

      {hasTimeline && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            Today's study timeline
          </p>
          <div className="relative h-6">
            <div className="absolute inset-y-0 left-0 right-0 rounded-full bg-secondary/60" />
            {timeline.map((block, i) => {
              const left = ((block.startMinutes - minStart) / span) * 100
              const width = Math.max(
                4,
                ((block.endMinutes - block.startMinutes) / span) * 100
              )
              return (
                <div
                  key={i}
                  title={block.label}
                  className={`absolute inset-y-0.5 rounded-full ${block.completed ? "opacity-90" : "opacity-40"}`}
                  style={{ left: `${left}%`, width: `${width}%`, backgroundColor: block.color }}
                />
              )
            })}
          </div>
        </div>
      )}
    </motion.div>
  )
}
