import { motion } from "framer-motion"
import {
  Sparkles,
  Clock,
  Flag,
  Zap,
  ShieldCheck,
  Play,
  ArrowRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatTimeDisplay } from "@/lib/coaching"

export interface RecommendedNextCardProps {
  task: string
  subject?: string
  courseColor?: string
  durationLabel?: string
  reason: string
  eyebrow?: string
  bestTime?: string
  finishTime?: string
  timeSaved?: number | null
  confidence?: { label: string; detail: string } | null
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
  eyebrow = "Recommended Next",
  bestTime,
  finishTime,
  timeSaved,
  confidence,
  onStart,
  ctaLabel = "Start this session",
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
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {eyebrow}
          </span>
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
          <h3 className="text-lg font-semibold leading-snug tracking-tight break-words">
            {task}
          </h3>
          <p className="text-sm text-card-foreground/70 leading-relaxed">
            {reason}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {durationLabel && (
            <div className="rounded-lg bg-muted/50 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Clock className="h-3 w-3" /> Focus Time
              </div>
              <p className="mt-0.5 text-sm font-semibold">{durationLabel}</p>
            </div>
          )}
          {bestTime && (
            <div className="rounded-lg bg-muted/50 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Clock className="h-3 w-3" /> Best Time
              </div>
              <p className="mt-0.5 text-sm font-semibold">{bestTime}</p>
            </div>
          )}
          {finishTime && (
            <div className="rounded-lg bg-muted/50 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Flag className="h-3 w-3" /> Est. Finish
              </div>
              <p className="mt-0.5 text-sm font-semibold">{finishTime}</p>
            </div>
          )}
          {timeSaved != null && (
            <div className="rounded-lg bg-muted/50 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Zap className="h-3 w-3" /> Time Saved
              </div>
              <p className="mt-0.5 text-sm font-semibold">{timeSaved} min</p>
            </div>
          )}
          {confidence && (
            <div className="rounded-lg bg-muted/50 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <ShieldCheck className="h-3 w-3" /> Schedule Confidence
              </div>
              <p className="mt-0.5 text-sm font-semibold">{confidence.label}</p>
            </div>
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
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </motion.div>
  )
}

export function bestTimeLabel(startTime: string | undefined): string | undefined {
  if (!startTime) return undefined
  return formatTimeDisplay(startTime)
}
