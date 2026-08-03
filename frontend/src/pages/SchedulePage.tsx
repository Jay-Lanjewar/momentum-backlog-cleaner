import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  CalendarDays,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Clock,
  MoreHorizontal,
  Save,
  CheckCircle2,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { Layout } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { FadeIn } from "@/components/ui/fade-in"
import {
  useWeeklySchedule,
  useSaveWeeklySchedule,
} from "@/services/hooks"
import type {
  WeeklyBlock,
  DayName,
  BlockType,
  WeeklyScheduleUpdatePayload,
} from "@/services/types"

const DAYS: DayName[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
const DAY_LABELS: Record<DayName, string> = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday",
  friday: "Friday", saturday: "Saturday", sunday: "Sunday",
}

interface BlockTypeInfo {
  value: BlockType
  label: string
  color: string        // Tailwind classes for light mode
  darkColor: string    // Tailwind classes for dark mode
  dotColor: string     // Inline hex for the dot
}

const BLOCK_TYPES: BlockTypeInfo[] = [
  { value: "school",      label: "School",      color: "bg-blue-50 text-blue-700 border-blue-200",      darkColor: "dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",      dotColor: "#3b82f6" },
  { value: "coaching",    label: "Coaching",    color: "bg-purple-50 text-purple-700 border-purple-200", darkColor: "dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800", dotColor: "#a855f7" },
  { value: "homework",    label: "Homework",    color: "bg-orange-50 text-orange-700 border-orange-200", darkColor: "dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800", dotColor: "#f97316" },
  { value: "self_study",  label: "Self Study",  color: "bg-emerald-50 text-emerald-700 border-emerald-200", darkColor: "dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800", dotColor: "#10b981" },
  { value: "project",     label: "Project",     color: "bg-green-50 text-green-700 border-green-200",   darkColor: "dark:bg-green-950 dark:text-green-300 dark:border-green-800",   dotColor: "#22c55e" },
  { value: "robotics",    label: "Robotics",    color: "bg-pink-50 text-pink-700 border-pink-200",      darkColor: "dark:bg-pink-950 dark:text-pink-300 dark:border-pink-800",      dotColor: "#ec4899" },
  { value: "competition", label: "Competition", color: "bg-rose-50 text-rose-700 border-rose-200",      darkColor: "dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800",      dotColor: "#f43f5e" },
  { value: "exercise",    label: "Exercise",    color: "bg-amber-50 text-amber-700 border-amber-200",   darkColor: "dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",   dotColor: "#f59e0b" },
  { value: "sports",      label: "Sports",      color: "bg-teal-50 text-teal-700 border-teal-200",      darkColor: "dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800",      dotColor: "#14b8a6" },
  { value: "music",       label: "Music",       color: "bg-indigo-50 text-indigo-700 border-indigo-200", darkColor: "dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800", dotColor: "#6366f1" },
  { value: "art",         label: "Art",         color: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200", darkColor: "dark:bg-fuchsia-950 dark:text-fuchsia-300 dark:border-fuchsia-800", dotColor: "#d946ef" },
  { value: "reading",     label: "Reading",     color: "bg-cyan-50 text-cyan-700 border-cyan-200",      darkColor: "dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800",      dotColor: "#06b6d4" },
  { value: "travel",      label: "Travel",      color: "bg-gray-50 text-gray-600 border-gray-200",       darkColor: "dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700",      dotColor: "#6b7280" },
  { value: "meal",        label: "Meal",        color: "bg-yellow-50 text-yellow-700 border-yellow-200", darkColor: "dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800", dotColor: "#eab308" },
  { value: "break",       label: "Break",       color: "bg-slate-50 text-slate-600 border-slate-200",    darkColor: "dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700",   dotColor: "#94a3b8" },
  { value: "sleep",       label: "Sleep",       color: "bg-indigo-50 text-indigo-600 border-indigo-200", darkColor: "dark:bg-indigo-950 dark:text-indigo-400 dark:border-indigo-800", dotColor: "#818cf8" },
  { value: "custom",      label: "Custom",      color: "bg-neutral-50 text-neutral-600 border-neutral-200", darkColor: "dark:bg-neutral-900 dark:text-neutral-400 dark:border-neutral-700", dotColor: "#737373" },
]

function getBlockTypeInfo(type: BlockType): BlockTypeInfo {
  return BLOCK_TYPES.find((b) => b.value === type) ?? BLOCK_TYPES[BLOCK_TYPES.length - 1]
}

/* ---------- Add/Edit Block Modal ---------- */

function AddBlockModal({
  open,
  onClose,
  onSave,
  initial,
  saving,
}: {
  open: boolean
  onClose: () => void
  onSave: (block: WeeklyBlock) => void
  initial?: { block: WeeklyBlock; dayIndex: number } | null
  saving: boolean
}) {
  const [type, setType] = useState<BlockType>(initial?.block.type ?? "school")
  const [title, setTitle] = useState(initial?.block.title ?? "")
  const [start, setStart] = useState(initial?.block.start ?? "09:00")
  const [end, setEnd] = useState(initial?.block.end ?? "10:00")

  useEffect(() => {
    if (open) {
      setType(initial?.block.type ?? "school")
      setTitle(initial?.block.title ?? "")
      setStart(initial?.block.start ?? "09:00")
      setEnd(initial?.block.end ?? "10:00")
    }
  }, [open, initial])

  if (!open) return null

  const info = getBlockTypeInfo(type)
  const valid = start && end && start < end

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    onSave({ type, start, end, title: title.trim() || undefined })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="relative z-10 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-background border shadow-xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="block-form-modal-title"
      >
        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <div className="flex items-center justify-between">
            <h2 id="block-form-modal-title" className="text-lg font-semibold tracking-tight">
              {initial ? "Edit fixed commitment" : "Add fixed commitment"}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>

          {/* Block Type Grid */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Category</label>
            <div className="grid grid-cols-4 gap-1.5">
              {BLOCK_TYPES.map((bt) => (
                <button
                  key={bt.value}
                  type="button"
                  onClick={() => setType(bt.value)}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[10px] font-medium transition-all ${
                    type === bt.value
                      ? `${bt.color} ${bt.darkColor} ring-1 ring-primary/30 shadow-sm`
                      : "border-border text-muted-foreground hover:border-muted-foreground/30"
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: bt.dotColor }}
                  />
                  {bt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Title */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Name <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={info.label}
              maxLength={100}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* Time Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Start</label>
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">End</label>
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>

          {start >= end && (
            <p className="text-xs text-red-500">End time must be after start time.</p>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || saving} className="flex-1 gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {initial ? "Save Changes" : "Add Commitment"}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

/* ---------- Delete Confirmation ---------- */

function DeleteConfirm({ open, onClose, onConfirm, deleting }: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  deleting: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative z-10 w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl bg-background border shadow-xl p-6 text-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="block-delete-modal-title"
      >
        <h3 id="block-delete-modal-title" className="text-lg font-semibold mb-1">Delete this commitment?</h3>
        <p className="text-sm text-muted-foreground mb-6">This will remove it from your week. Momentum will just use that time for study sessions instead.</p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={deleting} className="flex-1 gap-1.5">
            {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

/* ---------- Timeline Block ---------- */

function TimelineBlock({
  block,
  index,
  onEdit,
  onDelete,
}: {
  block: WeeklyBlock
  index: number
  onEdit: () => void
  onDelete: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const info = getBlockTypeInfo(block.type)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const displayTitle = block.title || info.label

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      className="group flex items-center gap-3 relative"
    >
      {/* Time */}
      <div className="flex items-center gap-1.5 w-16 shrink-0">
        <span className="text-xs font-mono text-muted-foreground tabular-nums">
          {block.start}
        </span>
      </div>

      {/* Dot */}
      <div className="relative flex flex-col items-center shrink-0">
        <span
          className="h-2.5 w-2.5 rounded-full border-2 border-background z-10"
          style={{ backgroundColor: info.dotColor }}
        />
      </div>

      {/* Content */}
      <div
        className={`flex-1 flex items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-all ${info.color} ${info.darkColor}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">{displayTitle}</span>
          <span className="text-[10px] opacity-60 shrink-0">{block.start} – {block.end}</span>
        </div>

        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="h-10 w-10 flex items-center justify-center rounded-md md:opacity-0 md:group-hover:opacity-100 opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-all"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.1 }}
                className="absolute right-0 top-full mt-1 z-50 w-32 rounded-lg border bg-background shadow-lg overflow-hidden py-1"
              >
                <button
                  onClick={() => { onEdit(); setMenuOpen(false) }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  onClick={() => { onDelete(); setMenuOpen(false) }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}

/* ---------- Day Card ---------- */

function DayCard({
  day,
  blocks,
  onAdd,
  onEdit,
  onDelete,
}: {
  day: DayName
  blocks: WeeklyBlock[]
  onAdd: () => void
  onEdit: (index: number) => void
  onDelete: (index: number) => void
}) {
  const isToday = (() => {
    const jsDay = new Date().getDay()
    const dayIndex = DAYS.indexOf(day)
    return jsDay === (dayIndex + 1) % 7
  })()

  return (
    <Card className={`transition-all ${isToday ? "ring-2 ring-primary/20 shadow-md" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${isToday ? "text-primary" : ""}`}>
              {DAY_LABELS[day]}
            </span>
            {isToday && (
              <span className="text-[10px] font-medium text-primary bg-primary/10 rounded-full px-1.5 py-0.5">
                Today
              </span>
            )}
          </div>
          <button
            onClick={onAdd}
            className="flex h-8 items-center gap-1 rounded-md border border-dashed border-muted-foreground/30 px-2 text-[10px] font-medium text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>

        {blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Clock className="h-6 w-6 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground mb-1">No fixed commitments</p>
            <p className="text-[10px] text-muted-foreground/70 mb-2">
              Add busy times like school or coaching.
            </p>
            <button
              onClick={onAdd}
              className="text-xs font-medium text-primary hover:underline py-2 px-3 -mx-3"
            >
              + Add commitment
            </button>
          </div>
        ) : (
          <div className="space-y-0 relative">
            {/* Vertical line */}
            <div className="absolute left-[3.5rem] top-1.5 bottom-1.5 w-px bg-border" />
            <AnimatePresence mode="popLayout">
              {blocks.map((block, i) => (
                <div key={`${block.type}-${block.start}-${i}`} className="py-1.5">
                  <TimelineBlock
                    block={block}
                    index={i}
                    onEdit={() => onEdit(i)}
                    onDelete={() => onDelete(i)}
                  />
                </div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ---------- Main Page ---------- */

export function SchedulePage() {
  const { data: schedule, isLoading } = useWeeklySchedule()
  const saveSchedule = useSaveWeeklySchedule()

  const [weeklyBlocks, setWeeklyBlocks] = useState<Partial<Record<DayName, WeeklyBlock[]>>>({})
  const [showModal, setShowModal] = useState(false)
  const [editingTarget, setEditingTarget] = useState<{ block: WeeklyBlock; dayIndex: number } | null>(null)
  const [targetDay, setTargetDay] = useState<DayName>("monday")
  const [deletingTarget, setDeletingTarget] = useState<{ dayIndex: number; blockIndex: number } | null>(null)
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    if (schedule?.schedule) {
      setWeeklyBlocks(schedule.schedule)
    }
  }, [schedule])

  const updateBlocks = useCallback((day: DayName, blocks: WeeklyBlock[]) => {
    setWeeklyBlocks((prev) => ({ ...prev, [day]: blocks }))
    setHasChanges(true)
  }, [])

  const handleAdd = (day: DayName) => {
    setTargetDay(day)
    setEditingTarget(null)
    setShowModal(true)
  }

  const handleEdit = (day: DayName, blockIndex: number) => {
    const blocks = weeklyBlocks[day] ?? []
    setTargetDay(day)
    setEditingTarget({ block: blocks[blockIndex], dayIndex: blockIndex })
    setShowModal(true)
  }

  const handleDelete = (day: DayName, blockIndex: number) => {
    const blocks = [...(weeklyBlocks[day] ?? [])]
    blocks.splice(blockIndex, 1)
    updateBlocks(day, blocks)
    toast.success("Commitment removed")
  }

  const handleSaveBlock = (block: WeeklyBlock) => {
    const blocks = [...(weeklyBlocks[targetDay] ?? [])]
    if (editingTarget) {
      blocks[editingTarget.dayIndex] = block
    } else {
      blocks.push(block)
      blocks.sort((a, b) => a.start.localeCompare(b.start))
    }
    updateBlocks(targetDay, blocks)
    setShowModal(false)
    setEditingTarget(null)
    toast.success(editingTarget ? "Commitment updated" : "Commitment added")
  }

  const handleSaveSchedule = async () => {
    try {
      await saveSchedule.mutateAsync({ schedule: weeklyBlocks } as WeeklyScheduleUpdatePayload)
      setHasChanges(false)
      toast.success("Changes saved")
    } catch {
      toast.error("Failed to save changes")
    }
  }

  const isSaving = saveSchedule.isPending
  const totalBlocks = Object.values(weeklyBlocks).reduce((sum, blocks) => sum + (blocks?.length ?? 0), 0)

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-48 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-6 pb-8">
        {/* Header */}
        <FadeIn>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                <CalendarDays className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Fixed Commitments</h1>
                <p className="text-sm text-muted-foreground max-w-md">
                  Add only the parts of your week that are fixed. Momentum will automatically
                  schedule study sessions around them.
                </p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  {totalBlocks} {totalBlocks === 1 ? "commitment" : "commitments"} across{" "}
                  {DAYS.filter((d) => (weeklyBlocks[d]?.length ?? 0) > 0).length} days
                </p>
              </div>
            </div>
          </div>
        </FadeIn>

        {/* Helper cards */}
        <FadeIn delay={0.05}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <h2 className="text-sm font-semibold">What should I add?</h2>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {["School", "Coaching", "Meals", "Sports", "Work", "Sleep"].map((label) => (
                    <span
                      key={label}
                      className="rounded-full border border-emerald-200 dark:border-emerald-800 bg-background px-2.5 py-0.5 text-xs font-medium"
                    >
                      {label}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Anything that happens at the same time every week.
                </p>
              </CardContent>
            </Card>
            <Card className="border-red-200/70 bg-red-50/40 dark:border-red-900/50 dark:bg-red-950/20">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500 dark:text-red-400" />
                  <h2 className="text-sm font-semibold">What should I NOT add?</h2>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {["Study time", "Homework", "Flexible free time"].map((label) => (
                    <span
                      key={label}
                      className="rounded-full border border-red-200 dark:border-red-900 bg-background px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                    >
                      {label}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Momentum plans study sessions for you — you just mark when you're busy.
                </p>
              </CardContent>
            </Card>
          </div>
        </FadeIn>

        {/* Day Cards Grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          {DAYS.map((day, i) => (
            <FadeIn key={day} delay={0.03 * Math.min(i, 6)}>
              <DayCard
                day={day}
                blocks={weeklyBlocks[day] ?? []}
                onAdd={() => handleAdd(day)}
                onEdit={(blockIndex) => handleEdit(day, blockIndex)}
                onDelete={(blockIndex) => handleDelete(day, blockIndex)}
              />
            </FadeIn>
          ))}
        </div>

        {/* Save Bar */}
        <FadeIn delay={0.3}>
          <div className="flex items-center justify-between rounded-xl border bg-card px-5 py-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {hasChanges && (
                <span className="flex items-center gap-1.5 text-amber-600 text-xs font-medium">
                  <Clock className="h-3.5 w-3.5" />
                  Unsaved changes
                </span>
              )}
            </div>
            <Button
              onClick={handleSaveSchedule}
              disabled={!hasChanges || isSaving}
              className="gap-1.5"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Changes
            </Button>
          </div>
        </FadeIn>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showModal && (
          <AddBlockModal
            open
            onClose={() => { setShowModal(false); setEditingTarget(null) }}
            onSave={handleSaveBlock}
            initial={editingTarget}
            saving={false}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deletingTarget && (
          <DeleteConfirm
            open
            onClose={() => setDeletingTarget(null)}
            onConfirm={() => {
              if (deletingTarget) {
                const day = DAYS[deletingTarget.dayIndex]
                handleDelete(day, deletingTarget.blockIndex)
              }
              setDeletingTarget(null)
            }}
            deleting={false}
          />
        )}
      </AnimatePresence>
    </Layout>
  )
}
