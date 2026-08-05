import { motion } from "framer-motion"
import { Sparkles } from "lucide-react"

export function CoachMessage({
  children,
  label = "AI Coach",
  tone = "default",
  className,
}: {
  children: React.ReactNode
  label?: string
  tone?: "default" | "success" | "warning" | "destructive"
  className?: string
}) {
  const toneClasses = {
    default: "border-border bg-card",
    success:
      "border-emerald-300/60 bg-emerald-500/5 dark:border-emerald-800",
    warning: "border-amber-300/60 bg-amber-500/5 dark:border-amber-800",
    destructive: "border-red-300/60 bg-red-500/5 dark:border-red-800",
  }

  const iconTone = {
    default: "bg-primary/10 text-primary",
    success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    destructive: "bg-red-500/15 text-red-600 dark:text-red-400",
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      role="status"
      aria-label={label}
      className={`flex items-start gap-3 rounded-xl border p-4 ${toneClasses[tone]} ${className ?? ""}`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconTone[tone]}`}
      >
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="space-y-1 min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <div className="text-sm leading-relaxed text-card-foreground/90">
          {children}
        </div>
      </div>
    </motion.div>
  )
}
