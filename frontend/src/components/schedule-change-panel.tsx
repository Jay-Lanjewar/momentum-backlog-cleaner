import { useState } from "react"
import { motion } from "framer-motion"
import { ArrowRight, CheckCircle2, Clock, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatTimeDisplay } from "@/lib/coaching"
import type { PlanChange } from "@/services/types"

interface ScheduleChangePanelProps {
  changes: PlanChange[]
  onDismiss: () => void
}

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

export function ScheduleChangePanel({ changes, onDismiss }: ScheduleChangePanelProps) {
  const [expanded, setExpanded] = useState(true)

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
