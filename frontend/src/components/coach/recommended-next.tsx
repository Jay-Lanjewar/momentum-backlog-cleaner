import { motion } from "framer-motion"
import { Clock, Play, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface RecommendedNextCardProps {
  task: string
  subject?: string
  courseColor?: string
  durationLabel?: string
  reason: string
  eyebrow?: string
  bestTime?: string
  finishTime?: string
  overdue?: boolean
  onStart?: () => void
  ctaLabel?: string
  className?: string
}

export function RecommendedNextCard({
  task,
  subject,
  courseColor = "#6366f1",
  durationLabel,
  reason,
  eyebrow = "Your Next Move",
  bestTime,
  finishTime,
  overdue = false,
  onStart,
  ctaLabel = "Start Focus Session",
  className,
}: RecommendedNextCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`relative overflow-hidden rounded-2xl border bg-card shadow-sm ${className ?? ""}`}
    >
      <div
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: courseColor }}
      />
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {eyebrow}
            </span>
          </div>
          {overdue && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-500 dark:text-red-400">
              <AlertTriangle className="h-3 w-3" />
              Overdue
            </span>
          )}
        </div>

        <div className="space-y-2">
          {subject && (
            <span
              className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: courseColor + "20",
                color: courseColor,
              }}
            >
              {subject}
            </span>
          )}
          <h3 className="text-xl font-semibold leading-snug tracking-tight break-words">
            {task}
          </h3>
          <p className="text-sm text-card-foreground/70 leading-relaxed">
            {reason}
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {durationLabel && (
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {durationLabel}
            </span>
          )}
          {bestTime && finishTime && (
            <span className="text-muted-foreground/60">·</span>
          )}
          {bestTime && finishTime && (
            <span>
              {bestTime} – {finishTime}
            </span>
          )}
        </div>

        {onStart && (
          <Button
            onClick={onStart}
            size="lg"
            className="w-full gap-2 h-12 text-sm font-semibold rounded-xl"
          >
            <Play className="h-4 w-4 fill-current" />
            {ctaLabel}
          </Button>
        )}
      </div>
    </motion.div>
  )
}
