import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Layers,
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  Loader2,
} from "lucide-react"

import { Layout } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  useCourses,
  useBacklogItems,
  useCreateBacklogItem,
  useUpdateBacklogItem,
  useDeleteBacklogItem,
} from "@/services/hooks"
import type {
  BacklogItemData,
  BacklogItemCreatePayload,
  BacklogItemUpdatePayload,
  CourseData,
} from "@/services/types"

const PRIORITY_LABELS = ["", "Urgent", "High", "Medium", "Low"]
const PRIORITY_COLORS = ["", "text-red-500", "text-amber-500", "text-blue-500", "text-muted-foreground"]

const FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
]

function Container({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  )
}

function PriorityDots({ priority }: { priority: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4].map((p) => (
        <div
          key={p}
          className={`h-2 w-2 rounded-full ${
            p <= priority ? PRIORITY_COLORS[priority] : "bg-muted-foreground/20"
          }`}
        />
      ))}
    </div>
  )
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

/* ---------- Add/Edit Modal ---------- */

function ItemFormModal({
  open,
  onClose,
  onSave,
  courses,
  initial,
  saving,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: BacklogItemCreatePayload | BacklogItemUpdatePayload) => void
  courses: CourseData[]
  initial?: BacklogItemData | null
  saving: boolean
}) {
  const [title, setTitle] = useState(initial?.title ?? "")
  const [courseId, setCourseId] = useState(initial?.course_id ?? courses[0]?.id ?? "")
  const [priority, setPriority] = useState(initial?.priority ?? 3)
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(initial?.estimated_minutes ?? 30)
  const [dueDate, setDueDate] = useState(initial?.due_date ? initial.due_date.split("T")[0] : "")

  if (!open) return null

  const valid = title.trim().length > 0 && courseId

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    const payload: BacklogItemCreatePayload | BacklogItemUpdatePayload = {
      title: title.trim(),
      course_id: courseId,
      priority,
      estimated_minutes: estimatedMinutes || null,
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
    }
    onSave(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="relative z-10 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-background border shadow-xl overflow-hidden"
      >
        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{initial ? "Edit Item" : "Add Item"}</h2>
            <button type="button" onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Complete Chapter 5 exercises"
              maxLength={255}
              autoFocus
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Course</label>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Priority</label>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`flex-1 h-9 rounded-lg border text-xs font-medium transition-all ${
                      priority === p
                        ? "border-primary bg-primary/5 text-foreground shadow-sm"
                        : "border-input text-muted-foreground hover:border-muted-foreground/30"
                    }`}
                  >
                    {PRIORITY_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Est. minutes</label>
              <input
                type="number"
                min={5}
                max={1440}
                value={estimatedMinutes ?? ""}
                onChange={(e) => setEstimatedMinutes(e.target.value ? parseInt(e.target.value, 10) : null)}
                className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Due date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={!valid || saving} className="flex-1 gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {initial ? "Save Changes" : "Add Item"}
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
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative z-10 w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl bg-background border shadow-xl p-6 text-center"
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <AlertCircle className="h-6 w-6 text-red-500" />
        </div>
        <h3 className="text-lg font-semibold mb-1">Delete item?</h3>
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

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3 }}
    >
      <Card className={`group relative overflow-hidden transition-all duration-300 ${
        completed ? "opacity-60" : "hover:shadow-md"
      }`}>
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${
          completed ? "bg-emerald-400" : course ? "bg-transparent" : "bg-muted"
        }`} style={course && !completed ? { backgroundColor: course.color } : undefined} />

        <CardContent className="p-4 pl-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <button
                  onClick={onToggleComplete}
                  className="shrink-0 mt-0.5 text-muted-foreground hover:text-emerald-500 transition-colors"
                >
                  {completed ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </button>
                <h3 className={`text-sm font-medium truncate ${completed ? "line-through text-muted-foreground" : ""}`}>
                  {item.title}
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 ml-7 text-xs text-muted-foreground">
                {course && (
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: course.color }} />
                    {course.name}
                  </span>
                )}
                {item.estimated_minutes && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {item.estimated_minutes} min
                  </span>
                )}
                {item.due_date && (
                  <span className={`flex items-center gap-1 ${overdue ? "text-red-500 font-medium" : ""}`}>
                    {overdue ? <AlertCircle className="h-3 w-3" /> : null}
                    {overdue ? "Overdue" : `Due ${formatDate(item.due_date)}`}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-2 shrink-0">
              <PriorityDots priority={item.priority} />
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={onEdit} className="h-7 px-2 rounded-md text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  Edit
                </button>
                <button onClick={onDelete} className="h-7 px-2 rounded-md text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                  Delete
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* ---------- Main Page ---------- */

export function BacklogPage() {
  const [statusFilter, setStatusFilter] = useState("all")
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<BacklogItemData | null>(null)
  const [deletingItem, setDeletingItem] = useState<BacklogItemData | null>(null)

  const { data: courses = [], isLoading: coursesLoading } = useCourses()
  const { data: items = [], isLoading: itemsLoading } = useBacklogItems(statusFilter === "all" ? undefined : statusFilter)
  const createItem = useCreateBacklogItem()
  const updateItem = useUpdateBacklogItem()
  const deleteItem = useDeleteBacklogItem()

  const isLoading = coursesLoading || itemsLoading

  const handleSave = async (data: BacklogItemCreatePayload | BacklogItemUpdatePayload) => {
    if (editingItem) {
      await updateItem.mutateAsync({ id: editingItem.id, payload: data as BacklogItemUpdatePayload })
      setEditingItem(null)
    } else {
      await createItem.mutateAsync(data as BacklogItemCreatePayload)
      setShowForm(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingItem) return
    await deleteItem.mutateAsync(deletingItem.id)
    setDeletingItem(null)
  }

  const handleToggleComplete = async (item: BacklogItemData) => {
    const newStatus = item.status === "completed" ? "pending" : "completed"
    await updateItem.mutateAsync({ id: item.id, payload: { status: newStatus } })
  }

  const isSaving = createItem.isPending || updateItem.isPending
  const isDeleting = deleteItem.isPending

  return (
    <Layout>
      <div className="space-y-5 pb-8">
        {/* Header */}
        <Container>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Layers className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Backlog</h1>
                <p className="text-sm text-muted-foreground">{items.length} item{items.length !== 1 ? "s" : ""}</p>
              </div>
            </div>
            <Button onClick={() => { setEditingItem(null); setShowForm(true) }} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Add Item
            </Button>
          </div>
        </Container>

        {/* Filters */}
        <Container delay={0.05}>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                  statusFilter === f.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </Container>

        {/* Backlog Items */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <Container delay={0.1}>
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
              <Layers className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground mb-1">No backlog items</p>
              <p className="text-xs text-muted-foreground/60 mb-4">Add your first task to get started.</p>
              <Button
                onClick={() => { setEditingItem(null); setShowForm(true) }}
                variant="outline"
                size="sm"
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Item
              </Button>
            </div>
          </Container>
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="space-y-2">
              {items.map((item, i) => (
                <Container key={item.id} delay={0.05 * Math.min(i, 5)}>
                  <BacklogCard
                    item={item}
                    courses={courses}
                    onEdit={() => setEditingItem(item)}
                    onDelete={() => setDeletingItem(item)}
                    onToggleComplete={() => handleToggleComplete(item)}
                  />
                </Container>
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
