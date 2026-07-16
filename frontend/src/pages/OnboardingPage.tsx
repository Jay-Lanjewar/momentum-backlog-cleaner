import { useState, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useNavigate } from "react-router-dom"
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Camera,
  ImageIcon,
  FileText,
  Keyboard,
  GraduationCap,
  Calendar,
  Plus,
  X,
  School,
  Bus,
  Sunset,
  Trophy,
  BookOpen,
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
  "Understanding your backlog...",
  "Organizing subjects...",
  "Estimating workload...",
  "Building your first plan...",
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

function Step2EntryMethod({
  onNext,
  onBack,
}: {
  onNext: (method: string, text: string) => void
  onBack: () => void
}) {
  const [method, setMethod] = useState<string | null>(null)
  const [manualText, setManualText] = useState("")
  const [showManual, setShowManual] = useState(false)

  const options = [
    { value: "photo", icon: Camera, label: "Take a photo" },
    { value: "image", icon: ImageIcon, label: "Upload image" },
    { value: "pdf", icon: FileText, label: "Upload PDF" },
    { value: "manual", icon: Keyboard, label: "Type it manually" },
  ]

  const handleSelect = (v: string) => {
    setMethod(v)
    if (v === "manual") {
      setShowManual(true)
    } else {
      setShowManual(true)
    }
  }

  const valid = manualText.trim().length > 0

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
          <GraduationCap className="h-7 w-7 text-primary" />
        </div>
        <p className="text-lg font-medium leading-snug max-w-sm">How would you like to add your backlog?</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {options.map((opt) => {
          const Icon = opt.icon
          const selected = method === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => handleSelect(opt.value)}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all ${
                selected
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border hover:border-muted-foreground/30 hover:bg-muted/50"
              }`}
            >
              <Icon className={`h-6 w-6 ${selected ? "text-primary" : "text-muted-foreground"}`} />
              <span className={`text-xs font-medium ${selected ? "text-foreground" : "text-muted-foreground"}`}>
                {opt.label}
              </span>
            </button>
          )
        })}
      </div>

      {showManual && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="space-y-3"
        >
          <textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder={`Physics\nMotion\nGravitation\n\nMaths\nTriangles\nCircles\n\nChemistry\nCarbon`}
            rows={8}
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all resize-none font-mono"
          />
          <div className="flex justify-between items-center">
            <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <Button onClick={() => onNext(method || "manual", manualText)} disabled={!valid} className="gap-1.5">
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      )}

      {!showManual && (
        <div className="flex justify-center">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>
      )}
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
        <p className="text-xs text-muted-foreground">Add one or more exams</p>
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
          {exams.length === 0 ? "Skip" : "Continue"}
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

  const [step, setStep] = useState(0)
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0)
  const loadingTimer = useRef<ReturnType<typeof setInterval>>()

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

      for (let i = 0; i < parsed.length; i++) {
        const result = await api.post<any>("/api/v1/courses", {
          name: parsed[i].subject,
          color: COURSE_COLORS[i % COURSE_COLORS.length],
        })
        if (result.error) throw new Error(result.error)
        courseIdMap.set(parsed[i].subject, result.data.id)
      }

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

      await api.put<StudentProfileData>("/api/v1/profile", {
        sleep_schedule: { start: "22:00", end: "06:00" },
        energy_peak: "morning",
        preferred_study_window: { earliest_start: studyStart, latest_end: studyEnd },
        daily_target_minutes: 120,
        class_name: "Student",
      })

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
      navigate("/", { replace: true })
    } catch {
      clearInterval(loadingTimer.current)
      setStep(3)
    }
  }, [navigate])

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
              {step === 2 && (
                <Step3Exams
                  key="exams"
                  onNext={(exams) => {
                    examsRef.current = exams
                    advance()
                  }}
                  onBack={retreat}
                />
              )}
              {step === 3 && (
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
              {step === 4 && (
                <Step5Loading key="loading" messageIndex={loadingMsgIndex} />
              )}
            </AnimatePresence>
          </div>
        </Card>
      </div>
    </div>
  )
}
