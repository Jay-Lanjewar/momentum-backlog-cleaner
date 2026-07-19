import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Flame, Award, Heart, ShieldCheck, X } from "lucide-react"
import { cn } from "@/lib/cn"
import type { SubjectStreakData, BalanceScoreData } from "@/services/types"

/* ─── Helpers ─── */

const mainMilestones = [3, 7, 14, 30, 100, 365]
const subjectMilestones = [7, 30, 90, 180]

function getNextMilestone(current: number, milestones: number[]): number | null {
  return milestones.find((m) => current < m) ?? null
}

function getMilestoneProgress(current: number, milestones: number[]): number {
  const next = getNextMilestone(current, milestones)
  if (next === null) return 100
  const prev = milestones.filter((m) => m <= current).pop() ?? 0
  return Math.round(((current - prev) / (next - prev)) * 100)
}

function formatPausedDate(dateStr: string | null): string {
  if (!dateStr) return ""
  const d = new Date(dateStr)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function wasYesterday(dateStr: string | null): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return d.toDateString() === yesterday.toDateString()
}

function isTodayDate(dateStr: string | null): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const today = new Date()
  return d.toDateString() === today.toDateString()
}

/* ─── Momentum Streak ─── */

export function MomentumStreak({
  currentStreak,
  lastCompletedDate,
  streakProtectedToday,
}: {
  currentStreak: number
  lastCompletedDate: string | null
  streakProtectedToday?: boolean
}) {
  const nextMilestone = getNextMilestone(currentStreak, mainMilestones)
  const progress = getMilestoneProgress(currentStreak, mainMilestones)
  const pausedYesterday = !isTodayDate(lastCompletedDate) && wasYesterday(lastCompletedDate)
  const pausedEarlier = !isTodayDate(lastCompletedDate) && !!lastCompletedDate && !wasYesterday(lastCompletedDate)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="rounded-xl border bg-card p-5"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-500" />
            <span className="text-sm font-medium">Momentum Streak</span>
          </div>

          <div className="flex items-baseline gap-1">
            <motion.span
              key={currentStreak}
              initial={{ scale: 1.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="text-3xl font-bold tracking-tight"
            >
              {currentStreak}
            </motion.span>
            <span className="text-sm text-muted-foreground">days</span>
          </div>

          <AnimatePresence mode="wait">
            {streakProtectedToday && (
              <motion.div
                key="protected"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-1.5"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-rose-500" />
                <p className="text-xs text-rose-500 font-medium">
                  Recovery Token Used — Life happens. Your streak is protected.
                </p>
              </motion.div>
            )}
            {!streakProtectedToday && pausedYesterday && (
              <motion.p
                key="paused"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs text-amber-600 dark:text-amber-400"
              >
                Your streak paused yesterday.
              </motion.p>
            )}
            {!streakProtectedToday && pausedEarlier && (
              <motion.p
                key="earlier"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs text-muted-foreground"
              >
                Last active {formatPausedDate(lastCompletedDate)}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {nextMilestone && (
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Award className="h-3.5 w-3.5" />
              <span>{nextMilestone} days</span>
            </div>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="h-full rounded-full bg-orange-500"
              />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

/* ─── Recovery Tokens ─── */

export function RecoveryTokens({
  current,
  earned,
  used,
}: {
  current: number
  earned: number
  used: number
}) {
  const [showDetails, setShowDetails] = useState(false)
  const maxTokens = 5

  return (
    <>
      <motion.button
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        onClick={() => setShowDetails(true)}
        className="w-full rounded-xl border bg-card p-4 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-rose-500" />
            <span className="text-sm font-medium">Recovery Tokens</span>
          </div>
          <div className="flex items-center gap-1">
            <motion.span
              key={current}
              initial={{ scale: 1.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-sm font-semibold"
            >
              {current}
            </motion.span>
            <span className="text-xs text-muted-foreground">/ {maxTokens}</span>
          </div>
        </div>
        <div className="mt-2 flex gap-1">
          {Array.from({ length: maxTokens }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors duration-200",
                i < current ? "bg-rose-500" : "bg-muted",
              )}
            />
          ))}
        </div>
      </motion.button>

      <AnimatePresence>
        {showDetails && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setShowDetails(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed inset-x-4 bottom-auto top-1/2 z-50 -translate-y-1/2 mx-auto max-w-sm rounded-xl border bg-card p-6 shadow-lg"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Heart className="h-5 w-5 text-rose-500" />
                  <h3 className="text-sm font-semibold">Recovery Tokens</h3>
                </div>
                <button
                  onClick={() => setShowDetails(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5">
                  <span className="text-xs text-muted-foreground">Current Tokens</span>
                  <span className="text-sm font-semibold">{current} / {maxTokens}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5">
                  <span className="text-xs text-muted-foreground">Lifetime Earned</span>
                  <span className="text-sm font-semibold">{earned}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5">
                  <span className="text-xs text-muted-foreground">Lifetime Used</span>
                  <span className="text-sm font-semibold">{used}</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed pt-1 border-t">
                  Tokens are earned at streak milestones and automatically protect your streak if you miss a day. Maximum {maxTokens} tokens at a time.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

/* ─── Subject Streaks ─── */

export function SubjectStreaksCard({
  subjects,
}: {
  subjects: SubjectStreakData[] | undefined
}) {
  if (!subjects || subjects.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="rounded-xl border bg-card p-5"
    >
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Subject Streaks</h3>

        <div className="space-y-2">
          {subjects.map((subject) => {
            const nextMilestone = getNextMilestone(subject.current_streak, subjectMilestones)
            const progress = getMilestoneProgress(subject.current_streak, subjectMilestones)

            return (
              <motion.div
                key={subject.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="flex items-center gap-3"
              >
                <div
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: subject.course_color }}
                />
                <span className="flex-1 text-sm truncate">{subject.course_name}</span>

                <div className="flex items-center gap-2">
                  {nextMilestone && (
                    <div className="h-1 w-10 overflow-hidden rounded-full bg-muted">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: subject.course_color }}
                      />
                    </div>
                  )}
                  <motion.span
                    key={subject.current_streak}
                    initial={{ scale: 1.3, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="text-sm font-semibold tabular-nums"
                    style={{ color: subject.course_color }}
                  >
                    {subject.current_streak}
                  </motion.span>
                  <Flame className="h-3.5 w-3.5 text-muted-foreground/60" />
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}

/* ─── Balance Score ─── */

export function BalanceScoreCard({
  data,
}: {
  data: BalanceScoreData | undefined
}) {
  if (!data) return null

  const isGood = data.score >= 80
  const isFair = data.score >= 50
  const colorClass = isGood
    ? "text-emerald-500"
    : isFair
      ? "text-amber-500"
      : "text-red-500"

  const barClass = isGood
    ? "bg-emerald-500"
    : isFair
      ? "bg-amber-500"
      : "bg-red-500"

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="rounded-xl border bg-card p-5"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Balance Score</span>
          <motion.span
            key={data.score}
            initial={{ scale: 1.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={cn("text-lg font-bold", colorClass)}
          >
            {data.score}%
          </motion.span>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${data.score}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className={cn("h-full rounded-full", barClass)}
          />
        </div>

        {data.message && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {data.message}
          </p>
        )}
      </div>
    </motion.div>
  )
}
