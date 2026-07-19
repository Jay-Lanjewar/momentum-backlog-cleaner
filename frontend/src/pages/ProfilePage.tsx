import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import {
  User,
  BookOpen,
  Moon,
  Zap,
  Clock,
  CalendarDays,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sun,
  Sunrise,
  Sunset,
  ChevronDown,
  Settings2,
  Monitor,
} from "lucide-react"

import { Layout } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useProfile, useWeeklySchedule, useSaveProfile, useSaveWeeklySchedule } from "@/services/hooks"
import { useTheme } from "@/lib/theme"
import type {
  WeeklyBlock,
  DayName,
  ProfileUpdatePayload,
  WeeklyScheduleUpdatePayload,
} from "@/services/types"

const DAYS: DayName[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
const DAY_LABELS: Record<DayName, string> = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday",
  friday: "Friday", saturday: "Saturday", sunday: "Sunday",
}
const BLOCK_TYPES = [
  { value: "school" as const, label: "School", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  { value: "coaching" as const, label: "Coaching", color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
  { value: "study" as const, label: "Study", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" },
  { value: "break" as const, label: "Break", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
  { value: "commute" as const, label: "Commute", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
]
const ENERGY_OPTIONS = [
  { value: "morning", label: "Morning", icon: Sunrise, desc: "Sharpest in the AM" },
  { value: "afternoon", label: "Afternoon", icon: Sun, desc: "Peak after lunch" },
  { value: "evening", label: "Evening", icon: Sunset, desc: "Best after 5 PM" },
  { value: "night", label: "Night", icon: Moon, desc: "Night owl mode" },
]

function Container({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay, ease: "easeOut" }}>
      {children}
    </motion.div>
  )
}

function TimeInput({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  return (
    <input
      id={id}
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-9 w-28 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    />
  )
}

function NumberInput({ value, onChange, id, min, max, label }: { value: number | null; onChange: (v: number | null) => void; id: string; min?: number; max?: number; label: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value
          onChange(v ? parseInt(v, 10) : null)
        }}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  )
}

/* ---------- Weekly Schedule Editor ---------- */

function BlockRow({ block, index, onChange, onRemove }: {
  block: WeeklyBlock
  index: number
  onChange: (b: WeeklyBlock) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-2 group">
      <select
        value={block.type}
        onChange={(e) => onChange({ ...block, type: e.target.value as WeeklyBlock["type"] })}
        className="flex h-8 w-28 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {BLOCK_TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
      <TimeInput id={`block-${index}-start`} value={block.start} onChange={(v) => onChange({ ...block, start: v })} />
      <span className="text-xs text-muted-foreground">to</span>
      <TimeInput id={`block-${index}-end`} value={block.end} onChange={(v) => onChange({ ...block, end: v })} />
      <button
        onClick={onRemove}
        className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function DaySchedule({ day, blocks, onChange }: {
  day: DayName
  blocks: WeeklyBlock[]
  onChange: (blocks: WeeklyBlock[]) => void
}) {
  const addBlock = (type: WeeklyBlock["type"]) => {
    onChange([...blocks, { type, start: "09:00", end: "10:00" }])
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{DAY_LABELS[day]}</span>
        <div className="flex gap-1">
          {["school", "coaching", "study"].map((type) => (
            <button
              key={type}
              onClick={() => addBlock(type as WeeklyBlock["type"])}
              className="flex h-6 items-center gap-1 rounded-md border border-dashed px-2 text-[10px] uppercase tracking-wider text-muted-foreground hover:border-solid hover:text-foreground transition-colors"
            >
              <Plus className="h-3 w-3" />
              {type}
            </button>
          ))}
        </div>
      </div>
      {blocks.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2 text-center">No blocks</p>
      ) : (
        <div className="space-y-1.5">
          {blocks.map((block, i) => (
            <BlockRow
              key={i}
              block={block}
              index={i}
              onChange={(b) => {
                const next = [...blocks]
                next[i] = b
                onChange(next)
              }}
              onRemove={() => onChange(blocks.filter((_, j) => j !== i))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------- Main Profile Page ---------- */

export function ProfilePage() {
  const { data: profile, isLoading: profileLoading } = useProfile()
  const { data: schedule, isLoading: scheduleLoading } = useSchedule()
  const saveProfile = useSaveProfile()
  const saveSchedule = useSaveWeeklySchedule()

  const [class_name, setClassName] = useState("")
  const [board, setBoard] = useState("")
  const [sleepStart, setSleepStart] = useState("22:00")
  const [sleepEnd, setSleepEnd] = useState("06:00")
  const [energyPeak, setEnergyPeak] = useState("morning")
  const [studyEarliest, setStudyEarliest] = useState("06:00")
  const [studyLatest, setStudyLatest] = useState("22:00")
  const [dailyTarget, setDailyTarget] = useState<number | null>(120)
  const [weeklyBlocks, setWeeklyBlocks] = useState<Partial<Record<DayName, WeeklyBlock[]>>>({})

  const [showAdvanced, setShowAdvanced] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  const isLoading = profileLoading || scheduleLoading

  useEffect(() => {
    if (profile) {
      setClassName(profile.class_name ?? "")
      setBoard(profile.board ?? "")
      if (profile.sleep_schedule) {
        setSleepStart(profile.sleep_schedule.start ?? "22:00")
        setSleepEnd(profile.sleep_schedule.end ?? "06:00")
      }
      setEnergyPeak(profile.energy_peak ?? "morning")
      if (profile.preferred_study_window) {
        setStudyEarliest(profile.preferred_study_window.earliest_start ?? "06:00")
        setStudyLatest(profile.preferred_study_window.latest_end ?? "22:00")
      }
      setDailyTarget(profile.daily_target_minutes ?? 120)
    }
  }, [profile])

  useEffect(() => {
    if (schedule?.schedule) {
      setWeeklyBlocks(schedule.schedule)
    }
  }, [schedule])

  const handleSave = useCallback(async () => {
    setSaveStatus("saving")
    setErrorMsg("")

    try {
      const profilePayload: ProfileUpdatePayload = {
        class_name: class_name || null,
        board: board || null,
        sleep_schedule: { start: sleepStart, end: sleepEnd },
        energy_peak: energyPeak,
        preferred_study_window: { earliest_start: studyEarliest, latest_end: studyLatest },
        daily_target_minutes: dailyTarget,
      }
      await saveProfile.mutateAsync(profilePayload)

      const schedulePayload: WeeklyScheduleUpdatePayload = { schedule: weeklyBlocks }
      await saveSchedule.mutateAsync(schedulePayload)

      setSaveStatus("success")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch {
      setSaveStatus("error")
      setErrorMsg("Failed to save. Please try again.")
    }
  }, [class_name, board, sleepStart, sleepEnd, energyPeak, studyEarliest, studyLatest, dailyTarget, weeklyBlocks, saveProfile, saveSchedule])

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-6 pb-8">
        <Container>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
              <p className="text-sm text-muted-foreground">Manage your study preferences and schedule</p>
            </div>
          </div>
        </Container>

        {/* Personal Info */}
        <Container delay={0.05}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                Personal Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="class_name" className="text-xs font-medium text-muted-foreground">Class</label>
                  <input
                    id="class_name"
                    value={class_name}
                    onChange={(e) => setClassName(e.target.value)}
                    placeholder="e.g. Class 12"
                    maxLength={50}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="board" className="text-xs font-medium text-muted-foreground">Board</label>
                  <input
                    id="board"
                    value={board}
                    onChange={(e) => setBoard(e.target.value)}
                    placeholder="e.g. CBSE, ICSE"
                    maxLength={50}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </Container>

        {/* Sleep Schedule */}
        <Container delay={0.1}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Moon className="h-4 w-4 text-muted-foreground" />
                Sleep Schedule
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="sleep-start" className="text-xs font-medium text-muted-foreground">Sleep time</label>
                  <TimeInput id="sleep-start" value={sleepStart} onChange={setSleepStart} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="sleep-end" className="text-xs font-medium text-muted-foreground">Wake time</label>
                  <TimeInput id="sleep-end" value={sleepEnd} onChange={setSleepEnd} />
                </div>
              </div>
            </CardContent>
          </Card>
        </Container>

        {/* Energy Preference */}
        <Container delay={0.15}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="h-4 w-4 text-muted-foreground" />
                Energy Peak
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {ENERGY_OPTIONS.map((opt) => {
                  const selected = energyPeak === opt.value
                  const Icon = opt.icon
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setEnergyPeak(opt.value)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                        selected
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-muted-foreground/30 hover:bg-muted/50"
                      }`}
                    >
                      <Icon className={`h-5 w-5 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                      <span className={`text-xs font-medium ${selected ? "text-foreground" : "text-muted-foreground"}`}>
                        {opt.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60">{opt.desc}</span>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </Container>

        {/* Theme */}
        <Container delay={0.18}>
          <ThemeToggle />
        </Container>

        {/* Preferred Study Hours */}
        <Container delay={0.2}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Preferred Study Hours
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="study-start" className="text-xs font-medium text-muted-foreground">Earliest start</label>
                  <TimeInput id="study-start" value={studyEarliest} onChange={setStudyEarliest} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="study-end" className="text-xs font-medium text-muted-foreground">Latest end</label>
                  <TimeInput id="study-end" value={studyLatest} onChange={setStudyLatest} />
                </div>
              </div>
              <div className="w-40">
                <NumberInput id="daily-target" label="Daily target (minutes)" value={dailyTarget} onChange={setDailyTarget} min={15} max={1440} />
              </div>
            </CardContent>
          </Card>
        </Container>

        {/* Advanced Settings */}
        <Container delay={0.25}>
          <Card>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full"
            >
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Settings2 className="h-4 w-4 text-muted-foreground" />
                  Advanced Settings
                  <ChevronDown className={`h-4 w-4 ml-auto text-muted-foreground transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
                </CardTitle>
              </CardHeader>
            </button>
            {showAdvanced && (
              <CardContent className="space-y-4 border-t pt-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Weekly Schedule</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Add your regular weekly commitments. The planner uses this to find available study windows.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {DAYS.map((day) => (
                      <DaySchedule
                        key={day}
                        day={day}
                        blocks={weeklyBlocks[day] ?? []}
                        onChange={(blocks) => setWeeklyBlocks({ ...weeklyBlocks, [day]: blocks })}
                      />
                    ))}
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        </Container>

        {/* Save Button */}
        <Container delay={0.3}>
          <div className="flex items-center justify-between rounded-xl border bg-card px-5 py-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {saveStatus === "success" && (
                <span className="flex items-center gap-1.5 text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Saved successfully
                </span>
              )}
              {saveStatus === "error" && (
                <span className="flex items-center gap-1.5 text-red-500">
                  <AlertCircle className="h-4 w-4" />
                  {errorMsg}
                </span>
              )}
              {saveStatus === "saving" && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </span>
              )}
            </div>
            <Button onClick={handleSave} disabled={saveStatus === "saving"} className="gap-1.5">
              {saveStatus === "saving" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Changes
            </Button>
          </div>
        </Container>
      </div>
    </Layout>
  )
}

/* ─── Theme Toggle ─── */

const THEME_OPTIONS = [
  { value: "light" as const, label: "Light", icon: Sun, desc: "Always light" },
  { value: "dark" as const, label: "Dark", icon: Moon, desc: "Always dark" },
  { value: "system" as const, label: "System", icon: Monitor, desc: "Follow device" },
]

function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sun className="h-4 w-4 text-muted-foreground" />
          Theme
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map((opt) => {
            const selected = theme === opt.value
            const Icon = opt.icon
            return (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                  selected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-muted-foreground/30 hover:bg-muted/50"
                }`}
              >
                <Icon className={`h-5 w-5 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`text-xs font-medium ${selected ? "text-foreground" : "text-muted-foreground"}`}>
                  {opt.label}
                </span>
                <span className="text-[10px] text-muted-foreground/60">{opt.desc}</span>
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground text-center">
          {resolvedTheme === "dark" ? "🌙 Dark mode active" : "☀️ Light mode active"}
        </p>
      </CardContent>
    </Card>
  )
}

function useSchedule() {
  return useWeeklySchedule()
}
