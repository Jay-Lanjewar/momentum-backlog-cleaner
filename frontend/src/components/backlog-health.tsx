import { cn } from "@/lib/cn"

function getHealthColor(score: string) {
  switch (score) {
    case "good":
      return { bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-300 dark:border-emerald-800", label: "Good" }
    case "fair":
      return { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", border: "border-amber-300 dark:border-amber-800", label: "Fair" }
    case "critical":
      return { bar: "bg-red-500", text: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", border: "border-red-300 dark:border-red-800", label: "Critical" }
    default:
      return { bar: "bg-muted", text: "text-muted-foreground", bg: "bg-muted/50", border: "border-border", label: score }
  }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function BacklogHealthWidget({
  health,
}: {
  health: {
    health_score: string
    pending_items: number
    overdue_items: number
    clear_rate_7d: number
    estimated_completion_date: string | null
    total_items: number
    completed_items: number
  } | undefined
}) {
  if (!health) return null

  const colors = getHealthColor(health.health_score)
  const clearPercent = Math.round(health.clear_rate_7d * 100)
  const completionDate = formatDate(health.estimated_completion_date)
  const healthPercent = health.total_items > 0
    ? Math.round((health.completed_items / health.total_items) * 100)
    : 0

  return (
    <div className={cn("rounded-xl border p-4 space-y-3", colors.bg, colors.border)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">You're on track</span>
        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", colors.bg, colors.text)}>
          {colors.label}
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Progress (7 days)</span>
          <span>{clearPercent}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-background">
          <div
            className={cn("h-full rounded-full transition-all duration-700 ease-out", colors.bar)}
            style={{ width: `${clearPercent}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-background/80 p-2">
          <div className="font-semibold text-foreground">{health.pending_items}</div>
          <div className="text-muted-foreground">Pending</div>
        </div>
        <div className="rounded-lg bg-background/80 p-2">
          <div className={cn("font-semibold", health.overdue_items > 0 ? "text-red-500" : "text-foreground")}>
            {health.overdue_items}
          </div>
          <div className="text-muted-foreground">Overdue</div>
        </div>
        <div className="rounded-lg bg-background/80 p-2">
          <div className="font-semibold text-foreground">{healthPercent}%</div>
          <div className="text-muted-foreground">Done</div>
        </div>
      </div>

      {completionDate && (
        <div className="flex items-center justify-center gap-1.5 rounded-lg bg-background/80 px-3 py-2 text-xs text-muted-foreground">
          <span>On track to finish by</span>
          <span className="font-medium text-foreground">{completionDate}</span>
        </div>
      )}
    </div>
  )
}
