import { useState, useCallback, useRef, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  GraduationCap,
  Calendar,
  Plus,
  X,
  School,
  Bus,
  Sunset,
  Trophy,
  BookOpen,
  Pencil,
  CheckCircle2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { api } from "@/services/api"
import type { StudentProfileData } from "@/services/types"

const COURSE_COLORS = [
  "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4",
  "#3b82f6", "#6b7280",
]

const LOADING_MESSAGES = [
  "Understanding your work...",
  "Organizing subjects...",
  "Planning your study blocks...",
  "Building your study plan...",
  "Almost there...",
]

/* ─── Parsing ─── */

interface ParsedGroup {
  subject: string
  items: string[]
}

function parseBacklogInput(text: string): ParsedGroup[] {
  const raw = text.trim()
  if (!raw) return []

  const lines = raw.split("\n").map((l) => l.trim())
  const groups: string[][] = []
  let current: string[] = []

  for (const line of lines) {
    if (line === "") {
      if (current.length) { groups.push(current); current = [] }
    } else {
      current.push(line)
    }
  }
  if (current.length) groups.push(current)

  if (groups.length > 1 && groups.every((g) => g.length >= 1)) {
    return groups
      .map((g) => ({ subject: g[0], items: g.slice(1).filter(Boolean) }))
      .filter((g) => g.subject)
  }

  const dashItems = lines.filter((l) => l.includes("-"))
  if (dashItems.length === lines.length && lines.length > 0) {
    const map = new Map<string, string[]>()
    for (const line of lines) {
      const sep = line.indexOf("-")
      if (sep === -1) continue
      const subject = line.slice(0, sep).trim()
      const item = line.slice(sep + 1).trim()
      if (subject && item) {
        if (!map.has(subject)) map.set(subject, [])
        map.get(subject)!.push(item)
      }
    }
    return Array.from(map.entries()).map(([subject, items]) => ({ subject, items }))
  }

  return [{ subject: "General", items: lines }]
}

/* ─── Helpers ─── */

function AnimatedDots() {
  return (
    <span className="inline-flex">
      <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0 }}>.</motion.span>
      <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.3 }}>.</motion.span>
      <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.6 }}>.</motion.span>
    </span>
  )
}

/* ─── Name Step ─── */

function Step1Name({ onNext, onBack }: { onNext: (name: string) => void; onBack: () => void }) {
  const [value, setValue] = useState("")

  const trimmed = value.trim()
  const isValid = trimmed.length > 0 && trimmed.length <= 25

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <div className="flex flex-col items-center text-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Pencil className="h-7 w-7 text-primary" />
        </div>
        <p className="text-lg font-medium leading-snug">What should I call you?</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          This makes Momentum feel a little more personal.
        </p>
      </div>

      <div className="space-y-1">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && isValid) { e.preventDefault(); onNext(trimmed) } }}
          placeholder="e.g. Priyani"
          maxLength={25}
          autoFocus
          className="w-full h-12 rounded-xl border border-input bg-background px-4 text-base text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all"
        />
        {value.length > 25 && (
          <p className="text-xs text-destructive text-center">Maximum 25 characters</p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <Button onClick={() => isValid && onNext(trimmed)} disabled={!isValid} size="lg" className="gap-2 h-12 px-6 rounded-xl">
          Continue
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  )
}

/* ─── Steps ─── */

function Step1Welcome({ onNext }: { onNext: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center text-center gap-6 py-4"
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
        <Sparkles className="h-10 w-10 text-primary" />
      </div>
      <div className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight">Welcome to Momentum</h1>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
          Momentum will build your first study plan in about a minute.
        </p>
      </div>
      <Button onClick={onNext} size="lg" className="gap-2 mt-2">
        Get Started
        <ArrowRight className="h-4 w-4" />
      </Button>
    </motion.div>
  )
}

const EXAMPLE_TEXT = `Physics
Motion
Gravitation

Maths
Triangles
Circles

English
Chapter 4`

function Step2EntryMethod({
  onNext,
  onBack,
}: {
  onNext: (method: string, text: string) => void
  onBack: () => void
}) {
  const [text, setText] = useState(EXAMPLE_TEXT)
  const [showConfirm, setShowConfirm] = useState(false)
  const [edited, setEdited] = useState(false)

  const handleChange = (v: string) => {
    if (!edited) setEdited(true)
    setText(v)
  }

  const parsed = useMemo(() => parseBacklogInput(text), [text])
  const hasContent = parsed.some((g) => g.items.length > 0)
  const totalTopics = parsed.reduce((sum, g) => sum + g.items.length, 0)

  if (showConfirm) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="space-y-6"
      >
        <div className="flex flex-col items-center text-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/30">
            <CheckCircle2 className="h-7 w-7 text-emerald-500" />
          </div>
          <p className="text-lg font-medium leading-snug">Here's what I understood</p>
        </div>

        <div className="space-y-2">
          {parsed.filter((g) => g.items.length > 0).map((group, i) => (
            <div
              key={group.subject}
              className="flex items-center justify-between rounded-xl border bg-card px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: COURSE_COLORS[i % COURSE_COLORS.length] }}
                />
                <span className="text-sm font-medium">{group.subject}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {group.items.length} topic{group.items.length !== 1 ? "s" : ""}
              </span>
            </div>
          ))}
        </div>

        {totalTopics === 0 && (
          <p className="text-sm text-muted-foreground text-center">
            No topics found. Try pasting your list in a different format.
          </p>
        )}

        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowConfirm(false)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
          <Button
            onClick={() => onNext("manual", text)}
            disabled={totalTopics === 0}
            className="gap-1.5"
          >
            Looks correct
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-5"
    >
      <div className="flex flex-col items-center text-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <GraduationCap className="h-7 w-7 text-primary" />
        </div>
        <p className="text-lg font-medium leading-snug max-w-sm">What's waiting to be studied?</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          Just paste whatever you've got. It doesn't have to be organized.
        </p>
      </div>

      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        rows={8}
        className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all resize-none font-mono"
      />

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <Button
          onClick={() => { if (hasContent) setShowConfirm(true) }}
          disabled={!hasContent}
          size="lg"
          className="gap-2 h-12 px-6 rounded-xl"
        >
          Build My Plan
          <Sparkles className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  )
}

function Step3Exams({
  onNext,
  onBack,
}: {
  onNext: (exams: { title: string; date: string }[]) => void
  onBack: () => void
}) {
  const [exams, setExams] = useState<{ title: string; date: string }[]>([])
  const [title, setTitle] = useState("")
  const [date, setDate] = useState("")

  const addExam = () => {
    if (!title.trim()) return
    setExams((prev) => [...prev, { title: title.trim(), date }])
    setTitle("")
    setDate("")
  }

  const removeExam = (i: number) => setExams((prev) => prev.filter((_, j) => j !== i))

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-6"
    >
      <div className="flex flex-col items-center text-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Calendar className="h-7 w-7 text-primary" />
        </div>
        <p className="text-lg font-medium leading-snug max-w-sm">When is your next important exam?</p>
        <p className="text-xs text-muted-foreground">(Optional)</p>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Subject</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) { e.preventDefault(); addExam() } }}
            placeholder="e.g. Physics"
            className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="w-36 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addExam} disabled={!title.trim()} className="h-10 w-10 shrink-0">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {exams.length > 0 && (
        <div className="space-y-1.5">
          {exams.map((exam, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{exam.title}</span>
                {exam.date && <span className="text-muted-foreground">· {new Date(exam.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
              </div>
              <button onClick={() => removeExam(i)} className="text-muted-foreground hover:text-destructive transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between items-center">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <Button onClick={() => onNext(exams)} className="gap-1.5">
          Continue
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  )
}

function Step4Weekday({
  onNext,
  onBack,
}: {
  onNext: (weekdayType: string, coachingEnd: string) => void
  onBack: () => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [coachingEnd, setCoachingEnd] = useState("17:00")

  const options = [
    { value: "school", icon: School, label: "School only" },
    { value: "coaching", icon: Bus, label: "School + Coaching" },
    { value: "tuition", icon: BookOpen, label: "School + Tuition" },
    { value: "sports", icon: Trophy, label: "School + Sports" },
    { value: "other", icon: Sunset, label: "Other" },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-6"
    >
      <div className="flex flex-col items-center text-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <School className="h-7 w-7 text-primary" />
        </div>
        <p className="text-lg font-medium leading-snug max-w-sm">What does a normal weekday look like?</p>
      </div>

      <div className="space-y-2">
        {options.map((opt) => {
          const Icon = opt.icon
          const isSelected = selected === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => setSelected(opt.value)}
              className={`w-full flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all ${
                isSelected
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border hover:border-muted-foreground/30 hover:bg-muted/50"
              }`}
            >
              <Icon className={`h-5 w-5 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
              <span className={`text-sm font-medium ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>
                {opt.label}
              </span>
            </button>
          )
        })}
      </div>

      {selected === "coaching" && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="flex items-center gap-3 pl-2"
        >
          <span className="text-sm text-muted-foreground">Coaching usually ends at</span>
          <input
            type="time"
            value={coachingEnd}
            onChange={(e) => setCoachingEnd(e.target.value)}
            className="h-10 w-28 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </motion.div>
      )}

      <div className="flex justify-between items-center">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <Button onClick={() => selected && onNext(selected, coachingEnd)} disabled={!selected} className="gap-1.5">
          Continue
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  )
}

function Step6Ready({ onFinish }: { onFinish: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center text-center gap-6 py-4"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
        className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30"
      >
        <Sparkles className="h-10 w-10 text-emerald-500" />
      </motion.div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Your study plan is ready</h1>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          Let's tackle one thing at a time.
        </p>
      </div>
      <Button onClick={onFinish} size="lg" className="gap-2 mt-2">
        Let's go
        <ArrowRight className="h-4 w-4" />
      </Button>
    </motion.div>
  )
}

function Step5Loading({
  messageIndex,
}: {
  messageIndex: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center gap-8 py-12"
    >
      <div className="relative">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
          className="h-16 w-16 rounded-full border-4 border-muted border-t-primary"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.p
          key={messageIndex}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          className="text-sm text-muted-foreground"
        >
          {LOADING_MESSAGES[messageIndex]}
          <AnimatedDots />
        </motion.p>
      </AnimatePresence>
    </motion.div>
  )
}

/* ─── Main ─── */

export function OnboardingPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [step, setStep] = useState(0)
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0)
  const loadingTimer = useRef<ReturnType<typeof setInterval>>()

  const nameRef = useRef("")
  const manualTextRef = useRef("")
  const methodRef = useRef("manual")
  const examsRef = useRef<{ title: string; date: string }[]>([])
  const weekdayTypeRef = useRef("school")
  const coachingEndRef = useRef("17:00")

  const advance = () => setStep((s) => s + 1)
  const retreat = () => setStep((s) => Math.max(0, s - 1))

  const handleFinish = useCallback(async () => {
    advance()

    loadingTimer.current = setInterval(() => {
      setLoadingMsgIndex((prev) => Math.min(prev + 1, LOADING_MESSAGES.length - 1))
    }, 2500)

    try {
      const raw = manualTextRef.current
      const parsed = parseBacklogInput(raw)
      const courseIdMap = new Map<string, string>()

      console.log("Creating courses...")
      for (let i = 0; i < parsed.length; i++) {
        const result = await api.post<any>("/api/v1/courses", {
          name: parsed[i].subject,
          color: COURSE_COLORS[i % COURSE_COLORS.length],
        })
        if (result.error) throw new Error(result.error)
        courseIdMap.set(parsed[i].subject, result.data.id)
      }

      console.log("Creating backlog items...")
      let itemCount = 0
      for (const group of parsed) {
        const courseId = courseIdMap.get(group.subject)
        if (!courseId) continue
        for (const item of group.items) {
          await api.post<any>("/api/v1/backlog", {
            title: item,
            course_id: courseId,
            priority: 3,
            estimated_minutes: 30,
          })
          itemCount++
        }
      }

      console.log("Creating goals...")
      for (const exam of examsRef.current) {
        await api.post<any>("/api/v1/goals", {
          title: exam.title,
          target_date: exam.date ? new Date(exam.date).toISOString() : null,
          category: "exam",
          status: "active",
        })
      }

      const weekdayType = weekdayTypeRef.current
      const coachingEnd = coachingEndRef.current
      let studyStart = "16:00"
      let studyEnd = "22:00"

      if (weekdayType === "coaching") {
        const [h, m] = coachingEnd.split(":").map(Number)
        const endMinutes = h * 60 + m + 30
        const eh = Math.floor(endMinutes / 60)
        const em = endMinutes % 60
        studyStart = `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`
      } else if (weekdayType === "tuition") {
        studyStart = "17:00"
      } else if (weekdayType === "sports") {
        studyStart = "18:00"
      } else if (weekdayType === "other") {
        studyStart = "17:00"
      }

      const profilePayload: Record<string, unknown> = {
        name: nameRef.current || undefined,
        sleep_schedule: { start: "22:00", end: "06:00" },
        energy_peak: "morning",
        preferred_study_window: { earliest_start: studyStart, latest_end: studyEnd },
        daily_target_minutes: 120,
        class_name: "Student",
      }
      console.log("Creating profile...")
      await api.put<StudentProfileData>("/api/v1/profile", profilePayload)

      const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday"]
      const schedule: Record<string, any[]> = {}
      for (const day of weekdays) {
        const blocks = [{ type: "school", start: "08:00", end: "15:00" }]
        if (weekdayType === "coaching") {
      const sh = parseInt(coachingEnd.split(":")[0], 10) - 2
      blocks.push({ type: "coaching", start: `${String(sh).padStart(2, "0")}:00`, end: coachingEnd })
        }
        schedule[day] = blocks
      }
      await api.put<any>("/api/v1/profile/schedule", { schedule })

      clearInterval(loadingTimer.current)

      localStorage.setItem("momentum_onboarded", "true")
      setStep(6)
    } catch (error) {
      clearInterval(loadingTimer.current)
      console.error(error)
      alert(error instanceof Error ? error.message : String(error))
    }
  }, [navigate])

  const handleReady = useCallback(() => {
    queryClient.removeQueries({ queryKey: ["profile"] })
    navigate("/", { replace: true })
  }, [navigate, queryClient])

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md mx-auto">
        <Card className="rounded-2xl border shadow-sm">
          <div className="p-6 sm:p-8">
            <AnimatePresence mode="wait">
              {step === 0 && (
                <Step1Welcome key="welcome" onNext={advance} />
              )}
              {step === 1 && (
                <Step1Name
                  key="name"
                  onNext={(name) => {
                    nameRef.current = name
                    advance()
                  }}
                  onBack={retreat}
                />
              )}
              {step === 2 && (
                <Step2EntryMethod
                  key="entry"
                  onNext={(method, text) => {
                    methodRef.current = method
                    manualTextRef.current = text
                    advance()
                  }}
                  onBack={retreat}
                />
              )}
              {step === 3 && (
                <Step3Exams
                  key="exams"
                  onNext={(exams) => {
                    examsRef.current = exams
                    advance()
                  }}
                  onBack={retreat}
                />
              )}
              {step === 4 && (
                <Step4Weekday
                  key="weekday"
                  onNext={(type, end) => {
                    weekdayTypeRef.current = type
                    coachingEndRef.current = end
                    handleFinish()
                  }}
                  onBack={retreat}
                />
              )}
              {step === 5 && (
                <Step5Loading key="loading" messageIndex={loadingMsgIndex} />
              )}
              {step === 6 && (
                <Step6Ready key="ready" onFinish={handleReady} />
              )}
            </AnimatePresence>
          </div>
        </Card>
      </div>
    </div>
  )
}
