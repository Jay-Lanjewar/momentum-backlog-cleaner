import { useState, useRef, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Layers,
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  Loader2,
  MoreHorizontal,
  Trash2,
  Pencil,
  BookOpen,
  ChevronDown,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"

import { Layout } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { FadeIn } from "@/components/ui/fade-in"
import {
  useCourses,
  useBacklogItems,
  useCreateBacklogItem,
  useUpdateBacklogItem,
  useDeleteBacklogItem,
  useCreateCourse,
} from "@/services/hooks"
import type {
  BacklogItemData,
  BacklogItemCreatePayload,
  BacklogItemUpdatePayload,
  CourseData,
} from "@/services/types"
import {
  DIFFICULTIES,
  DUE_CHIPS,
  chipForDate,
  difficultyFromPriority,
  difficultyLabel,
  dueDateForChip,
  priorityFromDifficulty,
  type Difficulty,
  type DueChip,
} from "@/lib/coaching"
import { cn } from "@/lib/cn"

const TABS = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "completed", label: "Completed" },
] as const

const COURSE_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
]

const DIFFICULTY_VARIANT: Record<Difficulty, "destructive" | "warning" | "success"> = {
  hard: "destructive",
  medium: "warning",
  easy: "success",
}

function formatDate(d: string | null) {
  if (!d) return null
  const dt = new Date(d)
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === "completed") return false
  return new Date(dueDate) < new Date()
}

function dueChipLabel(dueDate: string | null): string | null {
  const chip = chipForDate(dueDate)
  if (!chip || chip === "custom") return null
  return DUE_CHIPS.find((c) => c.value === chip)?.label ?? null
}

/* ---------- Course Selector with Inline Create ---------- */

function CourseSelector({
  courses,
  value,
  onChange,
  createCourse,
}: {
  courses: CourseData[]
  value: string
  onChange: (id: string) => void
  createCourse: ReturnType<typeof useCreateCourse>
}) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newColor, setNewColor] = useState(COURSE_COLORS[0])
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selected = courses.find((c) => c.id === value)

  useEffect(() => {
    if (creating && inputRef.current) {
      inputRef.current.focus()
    }
  }, [creating])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
        setNewName("")
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    try {
      const course = await createCourse.mutateAsync({ name: newName.trim(), color: newColor })
      onChange(course.id)
      setNewName("")
      setCreating(false)
      setOpen(false)
      toast.success(`Course "${course.name}" created`)
    } catch {
      toast.error("Failed to create course")
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Subject"
        aria-expanded={open}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {selected ? (
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: selected.color }} />
            {selected.name}
          </span>
        ) : (
          <span className="text-muted-foreground">Select a subject</span>
        )}
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-1 w-full rounded-lg border bg-background shadow-lg overflow-hidden"
          >
            {creating ? (
              <div className="p-3 space-y-3">
                <input
                  ref={inputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate()
                    if (e.key === "Escape") {
                      setCreating(false)
                      setNewName("")
                    }
                  }}
                  placeholder="Subject name"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <div className="flex gap-1.5">
                  {COURSE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      className={`h-8 w-8 rounded-full transition-all ${newColor === c ? "ring-2 ring-primary ring-offset-2" : ""}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setCreating(false); setNewName("") }}>
                    Cancel
                  </Button>
                  <Button type="button" size="sm" disabled={!newName.trim() || createCourse.isPending} onClick={handleCreate} className="gap-1.5">
                    {createCourse.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Create
                  </Button>
                </div>
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto py-1">
                {courses.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { onChange(c.id); setOpen(false) }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors ${c.id === value ? "bg-accent font-medium" : ""}`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                    {c.name}
                  </button>
                ))}
                <div className="border-t mt-1 pt-1">
                  <button
                    type="button"
                    onClick={() => setCreating(true)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-accent transition-colors font-medium"
                  >
                    <Plus className="h-4 w-4" />
                    Add Subject
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ---------- Difficulty selector ---------- */

function DifficultySelector({
  value,
  onChange,
}: {
  value: Difficulty
  onChange: (d: Difficulty) => void
}) {
  return (
    <div className="flex gap-1.5">
      {DIFFICULTIES.map((d) => (
        <button
          key={d.value}
          type="button"
          onClick={() => onChange(d.value)}
          aria-pressed={value === d.value}
          className={cn(
            "flex-1 rounded-lg border px-2 py-2 text-center transition-all",
            value === d.value
              ? "border-primary bg-primary/5 shadow-sm"
              : "border-input hover:border-muted-foreground/30"
          )}
        >
          <span className={cn("block text-sm font-medium", value === d.value ? "text-foreground" : "text-muted-foreground")}>
            {d.label}
          </span>
          <span className="block text-[10px] text-muted-foreground/70 mt-0.5">
            {d.hint}
          </span>
        </button>
      ))}
    </div>
  )
}

/* ---------- Add/Edit Modal ---------- */

function ItemFormModal({
  open,
  onClose,
  onSave,
  courses,
  initial,
  saving,
  createCourse,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: BacklogItemCreatePayload | BacklogItemUpdatePayload) => void
  courses: CourseData[]
  initial?: BacklogItemData | null
  saving: boolean
  createCourse: ReturnType<typeof useCreateCourse>
}) {
  const [title, setTitle] = useState(initial?.title ?? "")
  const [courseId, setCourseId] = useState(initial?.course_id ?? courses[0]?.id ?? "")
  const [difficulty, setDifficulty] = useState<Difficulty>(
    difficultyFromPriority(initial?.priority)
  )
  const [dueChip, setDueChip] = useState<DueChip | null>(
    chipForDate(initial?.due_date)
  )
  const [customDueDate, setCustomDueDate] = useState(
    initial?.due_date ? initial.due_date.split("T")[0] : ""
  )
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(
    initial?.estimated_minutes ?? null
  )
  const [description, setDescription] = useState(initial?.description ?? "")

  if (!open) return null

  const valid = title.trim().length > 0 && courseId

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return

    let dueDate: string | null = null
    if (dueChip === "custom") {
      dueDate = customDueDate ? new Date(customDueDate).toISOString() : null
    } else if (dueChip) {
      dueDate = new Date(dueDateForChip(dueChip)).toISOString()
    }

    const estimatedMinutesPayload =
      initial || showAdvanced ? estimatedMinutes || null : undefined

    onSave({
      title: title.trim(),
      course_id: courseId,
      priority: priorityFromDifficulty(difficulty),
      due_date: dueDate,
      description: description.trim() ? description.trim() : null,
      estimated_minutes: estimatedMinutesPayload,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="relative z-10 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-background border shadow-xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-form-modal-title"
      >
        <form onSubmit={handleSubmit} className="space-y-5 p-6 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 id="item-form-modal-title" className="text-lg font-semibold tracking-tight">
              {initial ? "Edit task" : "New task"}
            </h2>
            <button type="button" onClick={onClose} className="h-9 px-3 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              Cancel
            </button>
          </div>

          <div className="space-y-2">
            <label htmlFor="task-title" className="text-sm font-medium">Task name</label>
            <input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Complete Chapter 5 exercises"
              maxLength={255}
              autoFocus
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Subject</label>
            <CourseSelector
              courses={courses}
              value={courseId}
              onChange={setCourseId}
              createCourse={createCourse}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Difficulty</label>
            <DifficultySelector value={difficulty} onChange={setDifficulty} />
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-primary" />
              Momentum estimates the time for you.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Due</label>
            <div className="flex gap-1.5">
              {DUE_CHIPS.map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => setDueChip(chip.value)}
                  aria-pressed={dueChip === chip.value}
                  className={cn(
                    "flex-1 h-9 rounded-lg border text-xs font-medium transition-all",
                    dueChip === chip.value
                      ? "border-primary bg-primary/5 text-foreground shadow-sm"
                      : "border-input text-muted-foreground hover:border-muted-foreground/30"
                  )}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            {dueChip === "custom" && (
              <input
                type="date"
                value={customDueDate}
                onChange={(e) => setCustomDueDate(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            )}
          </div>

          <div className="border-t pt-1">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              aria-expanded={showAdvanced}
              className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>Advanced</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence initial={false}>
              {showAdvanced && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4 overflow-hidden"
                >
                  <div className="space-y-2 pt-3">
                    <label htmlFor="est-minutes" className="text-sm font-medium">Est. minutes</label>
                    <input
                      id="est-minutes"
                      type="number"
                      min={5}
                      max={1440}
                      value={estimatedMinutes ?? ""}
                      onChange={(e) => setEstimatedMinutes(e.target.value ? parseInt(e.target.value, 10) : null)}
                      placeholder="Leave blank to auto-estimate"
                      className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave this blank and Momentum will estimate the time from the task and difficulty.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Notes</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                      placeholder="Anything your teacher said (optional)"
                      className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || saving} className="flex-1 gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {initial ? "Save Changes" : "Add Task"}
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
        aria-labelledby="backlog-delete-modal-title"
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <AlertCircle className="h-6 w-6 text-red-500" />
        </div>
        <h3 id="backlog-delete-modal-title" className="text-lg font-semibold mb-1">Remove this task?</h3>
        <p className="text-sm text-muted-foreground mb-6">This action cannot be undone.</p>
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

/* ---------- Three-Dot Menu ---------- */

function CardMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="h-10 w-10 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.1 }}
            className="absolute right-0 top-full mt-1 z-50 w-36 rounded-lg border bg-background shadow-lg overflow-hidden py-1"
          >
            <button
              onClick={() => { onEdit(); setOpen(false) }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
            <button
              onClick={() => { onDelete(); setOpen(false) }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ---------- BacklogCard ---------- */

function BacklogCard({
  item,
  courses,
  onEdit,
  onDelete,
  onToggleComplete,
}: {
  item: BacklogItemData
  courses: CourseData[]
  onEdit: () => void
  onDelete: () => void
  onToggleComplete: () => void
}) {
  const course = courses.find((c) => c.id === item.course_id)
  const overdue = isOverdue(item.due_date, item.status)
  const completed = item.status === "completed"
  const difficulty = difficultyFromPriority(item.priority)
  const dueLabel = dueChipLabel(item.due_date)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12, scale: 0.95 }}
      transition={{ duration: 0.25 }}
    >
      <Card className={`group transition-all duration-200 ${completed ? "opacity-60" : "hover:shadow-md"}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <button
              onClick={onToggleComplete}
              className="shrink-0 mt-0.5 h-10 w-10 flex items-center justify-center rounded-lg text-muted-foreground hover:text-emerald-500 transition-colors"
            >
              {completed ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              ) : (
                <Circle className="h-5 w-5" />
              )}
            </button>

            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className={`text-sm font-medium ${completed ? "line-through text-muted-foreground" : ""}`}>
                  {item.title}
                </h3>
                <Badge variant={DIFFICULTY_VARIANT[difficulty]} className="text-[10px] px-1.5 py-0">
                  {difficultyLabel(difficulty)}
                </Badge>
              </div>

              <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                {course && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5"
                    style={{
                      borderColor: course.color + "40",
                      backgroundColor: course.color + "10",
                      color: course.color,
                    }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: course.color }} />
                    {course.name}
                  </span>
                )}
                {item.estimated_minutes && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {item.estimated_minutes} min
                  </span>
                )}
                {item.due_date && (
                  <span className={`inline-flex items-center gap-1 ${overdue ? "text-red-500 font-medium" : ""}`}>
                    {overdue ? <AlertCircle className="h-3 w-3" /> : null}
                    {overdue ? "Overdue" : `Due ${dueLabel ?? formatDate(item.due_date)}`}
                  </span>
                )}
              </div>
            </div>

            <CardMenu onEdit={onEdit} onDelete={onDelete} />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* ---------- Empty states ---------- */

function EmptyState({
  activeTab,
  onAdd,
}: {
  activeTab: string
  onAdd: () => void
}) {
  const copy =
    activeTab === "completed"
      ? {
          icon: CheckCircle2,
          title: "Nothing completed yet.",
          body: "Finish a focus session and Momentum will track it here.",
        }
      : activeTab === "upcoming"
        ? {
            icon: BookOpen,
            title: "No upcoming work.",
            body: "Add homework and Momentum will plan it for you.",
          }
        : {
            icon: BookOpen,
            title: "No work yet.",
            body: "Add your homework and Momentum will automatically build today's study plan.",
          }

  const Icon = copy.icon

  return (
    <FadeIn delay={0.1}>
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 px-8 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/5">
          <Icon className="h-8 w-8 text-primary/40" />
        </div>
        <h3 className="text-base font-medium mb-1">{copy.title}</h3>
        <p className="text-sm text-muted-foreground mb-5 max-w-xs">{copy.body}</p>
        {activeTab !== "completed" && (
          <Button onClick={onAdd} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add Work
          </Button>
        )}
      </div>
    </FadeIn>
  )
}

/* ---------- Main Page ---------- */

export function BacklogPage() {
  const [activeTab, setActiveTab] = useState("all")
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<BacklogItemData | null>(null)
  const [deletingItem, setDeletingItem] = useState<BacklogItemData | null>(null)

  const { data: courses = [], isLoading: coursesLoading } = useCourses()
  const createCourse = useCreateCourse()

  const { data: allItems = [], isLoading: itemsLoading } = useBacklogItems()

  const items = useMemo(() => {
    if (activeTab === "all") return allItems
    if (activeTab === "completed") return allItems.filter((i) => i.status === "completed")
    return allItems.filter((i) => i.status !== "completed")
  }, [allItems, activeTab])

  const createItem = useCreateBacklogItem()
  const updateItem = useUpdateBacklogItem()
  const deleteItem = useDeleteBacklogItem()

  const isLoading = coursesLoading || itemsLoading

  const handleSave = async (data: BacklogItemCreatePayload | BacklogItemUpdatePayload) => {
    try {
      if (editingItem) {
        await updateItem.mutateAsync({ id: editingItem.id, payload: data as BacklogItemUpdatePayload })
        toast.success("Task updated")
        setEditingItem(null)
      } else {
        await createItem.mutateAsync(data as BacklogItemCreatePayload)
        toast.success("Task added")
        setShowForm(false)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong"
      toast.error(msg)
    }
  }

  const handleDelete = async () => {
    if (!deletingItem) return
    try {
      await deleteItem.mutateAsync(deletingItem.id)
      toast.success("Task deleted")
      setDeletingItem(null)
    } catch {
      toast.error("Failed to delete task")
    }
  }

  const handleToggleComplete = async (item: BacklogItemData) => {
    const newStatus = item.status === "completed" ? "pending" : "completed"
    try {
      await updateItem.mutateAsync({ id: item.id, payload: { status: newStatus } })
    } catch {
      toast.error("Failed to update task")
    }
  }

  const isSaving = createItem.isPending || updateItem.isPending
  const isDeleting = deleteItem.isPending

  return (
    <Layout>
      <div className="space-y-6 pb-8">
        {/* Header */}
        <FadeIn>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Layers className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Pending Work</h1>
                <p className="text-sm text-muted-foreground">
                  Momentum turns these into study sessions automatically.
                </p>
              </div>
            </div>
            <Button onClick={() => { setEditingItem(null); setShowForm(true) }} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Add Work
            </Button>
          </div>
        </FadeIn>

        {/* Tabs */}
        <FadeIn delay={0.05}>
          <div className="flex gap-1 rounded-xl bg-muted p-1">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                  activeTab === tab.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </FadeIn>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[88px] w-full rounded-xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState activeTab={activeTab} onAdd={() => { setEditingItem(null); setShowForm(true) }} />
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="space-y-2">
              {items.map((item, i) => (
                <FadeIn key={item.id} delay={0.03 * Math.min(i, 6)}>
                  <BacklogCard
                    item={item}
                    courses={courses}
                    onEdit={() => setEditingItem(item)}
                    onDelete={() => setDeletingItem(item)}
                    onToggleComplete={() => handleToggleComplete(item)}
                  />
                </FadeIn>
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {(showForm || editingItem) && (
          <ItemFormModal
            open
            onClose={() => { setShowForm(false); setEditingItem(null) }}
            onSave={handleSave}
            courses={courses}
            initial={editingItem}
            saving={isSaving}
            createCourse={createCourse}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deletingItem && (
          <DeleteConfirm
            open
            onClose={() => setDeletingItem(null)}
            onConfirm={handleDelete}
            deleting={isDeleting}
          />
        )}
      </AnimatePresence>
    </Layout>
  )
}
