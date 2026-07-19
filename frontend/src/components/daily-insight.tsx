import { Lightbulb } from "lucide-react"

export function DailyInsight({ message, source }: { message: string; source?: string }) {
  if (!message) return null

  return (
    <div className="group rounded-xl border bg-gradient-to-br from-amber-500/10 to-orange-500/5 p-4 dark:from-amber-500/10 dark:to-orange-500/5">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400">
          <Lightbulb className="h-4 w-4" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Daily Insight</span>
            {source && (
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                {source === "ai" ? "AI" : "Auto"}
              </span>
            )}
          </div>
          <p className="text-sm leading-relaxed text-amber-900/80 dark:text-amber-100/80">
            {message}
          </p>
        </div>
      </div>
    </div>
  )
}
