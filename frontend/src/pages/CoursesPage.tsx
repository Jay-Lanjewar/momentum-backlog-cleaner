import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { BookOpen, Plus, Palette, Loader2, AlertCircle } from "lucide-react"

import { Layout } from "@/components/layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useCourses, useCreateCourse, useUpdateCourse, useDeleteCourse } from "@/services/hooks"
import type { CourseData, CourseCreatePayload, CourseUpdatePayload } from "@/services/types"

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4",
  "#3b82f6", "#6b7280",
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

/* ---------- Add/Edit Modal ---------- */

function CourseFormModal({
  open,
  onClose,
  onSave,
  initial,
  saving,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: CourseCreatePayload | CourseUpdatePayload) => void
  initial?: CourseData | null
  saving: boolean
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [color, setColor] = useState(initial?.color ?? PRESET_COLORS[0])

  if (!open) return null

  const valid = name.trim().length > 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    onSave({ name: name.trim(), color })
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
            <h2 className="text-lg font-semibold">{initial ? "Edit Course" : "Add Course"}</h2>
            <button type="button" onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Course name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mathematics"
              maxLength={255}
              autoFocus
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Palette className="h-3.5 w-3.5" />
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full border-2 transition-all ${
                    color === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <div className="h-6 w-6 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-sm text-muted-foreground">{name || "Preview"}</span>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={!valid || saving} className="flex-1 gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {initial ? "Save Changes" : "Add Course"}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

/* ---------- Delete Confirmation ---------- */

function DeleteConfirm({ open, onClose, onConfirm, deleting, courseName }: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  deleting: boolean
  courseName: string
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
        <h3 className="text-lg font-semibold mb-1">Delete "{courseName}"?</h3>
        <p className="text-sm text-muted-foreground mb-6">This action cannot be undone. Any backlog items linked to this course will remain but will be uncategorized.</p>
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

/* ---------- CourseCard ---------- */

function CourseCard({
  course,
  onEdit,
  onDelete,
}: {
  course: CourseData
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="group relative overflow-hidden transition-all duration-300 hover:shadow-md">
        <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: course.color }} />
        <CardContent className="p-4 pl-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-5 w-5 rounded-full shrink-0" style={{ backgroundColor: course.color }} />
              <h3 className="text-sm font-medium truncate">{course.name}</h3>
            </div>
            <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={onEdit} className="h-7 px-2 rounded-md text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                Edit
              </button>
              <button onClick={onDelete} className="h-7 px-2 rounded-md text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                Delete
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* ---------- Main Page ---------- */

export function CoursesPage() {
  const [showForm, setShowForm] = useState(false)
  const [editingCourse, setEditingCourse] = useState<CourseData | null>(null)
  const [deletingCourse, setDeletingCourse] = useState<CourseData | null>(null)

  const { data: courses = [], isLoading } = useCourses()
  const createCourse = useCreateCourse()
  const updateCourse = useUpdateCourse()
  const deleteCourse = useDeleteCourse()

  const handleSave = async (data: CourseCreatePayload | CourseUpdatePayload) => {
    if (editingCourse) {
      await updateCourse.mutateAsync({ id: editingCourse.id, payload: data as CourseUpdatePayload })
      setEditingCourse(null)
    } else {
      await createCourse.mutateAsync(data as CourseCreatePayload)
      setShowForm(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingCourse) return
    await deleteCourse.mutateAsync(deletingCourse.id)
    setDeletingCourse(null)
  }

  const isSaving = createCourse.isPending || updateCourse.isPending

  return (
    <Layout>
      <div className="space-y-5 pb-8">
        {/* Header */}
        <Container>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Courses</h1>
                <p className="text-sm text-muted-foreground">{courses.length} course{courses.length !== 1 ? "s" : ""}</p>
              </div>
            </div>
            <Button onClick={() => { setEditingCourse(null); setShowForm(true) }} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Add Course
            </Button>
          </div>
        </Container>

        {/* Course List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : courses.length === 0 ? (
          <Container delay={0.1}>
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
              <BookOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground mb-1">No courses yet</p>
              <p className="text-xs text-muted-foreground/60 mb-4">Add your first course to organize backlog items.</p>
              <Button
                onClick={() => { setEditingCourse(null); setShowForm(true) }}
                variant="outline"
                size="sm"
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Course
              </Button>
            </div>
          </Container>
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="space-y-2">
              {courses.map((course, i) => (
                <Container key={course.id} delay={0.05 * Math.min(i, 5)}>
                  <CourseCard
                    course={course}
                    onEdit={() => setEditingCourse(course)}
                    onDelete={() => setDeletingCourse(course)}
                  />
                </Container>
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {(showForm || editingCourse) && (
          <CourseFormModal
            open
            onClose={() => { setShowForm(false); setEditingCourse(null) }}
            onSave={handleSave}
            initial={editingCourse}
            saving={isSaving}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deletingCourse && (
          <DeleteConfirm
            open
            onClose={() => setDeletingCourse(null)}
            onConfirm={handleDelete}
            deleting={deleteCourse.isPending}
            courseName={deletingCourse.name}
          />
        )}
      </AnimatePresence>
    </Layout>
  )
}
