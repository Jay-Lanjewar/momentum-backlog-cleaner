import { useCallback, useEffect, useState } from "react"
import {
  User,
  BookOpen,
  Moon,
  Zap,
  Clock,
  CalendarDays,
  Save,
  Loader2,
  Sun,
  Sunrise,
  Sunset,
  Monitor,
  Mail,
  LogOut,
  Flame,
  HeartPulse,
  Shield,
} from "lucide-react"
import { toast } from "sonner"
import { useNavigate } from "react-router-dom"

import { Layout } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { FadeIn } from "@/components/ui/fade-in"
import { useProfile, useSaveProfile, useStreaks, useBalanceScore } from "@/services/hooks"
import { useTheme } from "@/lib/theme"
import { useAuthStore } from "@/store/useAuthStore"
import { useAuth } from "@/hooks/useAuth"
import type {
  ProfileUpdatePayload,
} from "@/services/types"

const ENERGY_OPTIONS = [
  { value: "morning", label: "Morning", icon: Sunrise, desc: "Sharpest in the AM" },
  { value: "afternoon", label: "Afternoon", icon: Sun, desc: "Peak after lunch" },
  { value: "evening", label: "Evening", icon: Sunset, desc: "Best after 5 PM" },
  { value: "night", label: "Night", icon: Moon, desc: "Night owl mode" },
]

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/5">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  )
}

function TimeInput({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  return (
    <input
      id={id}
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-10 w-28 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  )
}

/* ---------- Main Profile Page ---------- */

export function ProfilePage() {
  const navigate = useNavigate()
  const authUser = useAuthStore((s) => s.user)
  const { logout } = useAuth()

  const { data: profile, isLoading: profileLoading } = useProfile()
  const saveProfile = useSaveProfile()

  const { data: streaks } = useStreaks()
  const { data: balanceScore } = useBalanceScore()

  const [class_name, setClassName] = useState("")
  const [board, setBoard] = useState("")
  const [sleepStart, setSleepStart] = useState("22:00")
  const [sleepEnd, setSleepEnd] = useState("06:00")
  const [energyPeak, setEnergyPeak] = useState("morning")
  const [studyEarliest, setStudyEarliest] = useState("06:00")
  const [studyLatest, setStudyLatest] = useState("22:00")
  const [dailyTarget, setDailyTarget] = useState<number | null>(120)

  const [saving, setSaving] = useState(false)

  const isLoading = profileLoading

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

  const handleSave = useCallback(async () => {
    setSaving(true)

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
      toast.success("Profile saved")
    } catch {
      toast.error("Failed to save profile")
    } finally {
      setSaving(false)
    }
  }, [class_name, board, sleepStart, sleepEnd, energyPeak, studyEarliest, studyLatest, dailyTarget, saveProfile])

  const memberSince = authUser?.created_at
    ? new Date(authUser.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long" })
    : "—"

  const handleLogout = async () => {
    await logout()
    navigate("/login")
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full rounded-xl" />
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
        <FadeIn>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
              <p className="text-sm text-muted-foreground">Manage your account and study preferences</p>
            </div>
          </div>
        </FadeIn>

        {/* Account Info */}
        <FadeIn delay={0.03}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4 text-muted-foreground" />
                Account
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-xl font-semibold text-primary">
                  {authUser?.name?.[0]?.toUpperCase() || authUser?.email?.[0]?.toUpperCase() || "?"}
                </div>
                <div>
                  <p className="text-base font-semibold">{authUser?.name || "User"}</p>
                   <p className="text-sm text-muted-foreground flex items-center gap-1.5 truncate">
                    <Mail className="h-3.5 w-3.5" />
                    {authUser?.email}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard icon={CalendarDays} label="Member Since" value={memberSince} />
                <StatCard icon={Flame} label="Streak" value={streaks?.momentum?.current_streak ?? 0} />
                <StatCard icon={HeartPulse} label="Health" value={balanceScore?.score != null ? `${balanceScore.score}%` : "—"} />
                <StatCard icon={Shield} label="Recovery" value={streaks?.momentum?.recovery_tokens_current ?? 0} />
              </div>
            </CardContent>
          </Card>
        </FadeIn>

        {/* Sign Out */}
        <FadeIn delay={0.04}>
          <Button
            variant="destructive"
            onClick={handleLogout}
            className="w-full gap-2 rounded-xl"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </FadeIn>

        {/* Personal Info */}
        <FadeIn delay={0.05}>
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
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </FadeIn>

        {/* Sleep Schedule */}
        <FadeIn delay={0.1}>
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
        </FadeIn>

        {/* Energy Preference */}
        <FadeIn delay={0.15}>
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
        </FadeIn>

        {/* Theme */}
        <FadeIn delay={0.18}>
          <ThemeToggle />
        </FadeIn>

        {/* Preferred Study Hours */}
        <FadeIn delay={0.2}>
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
        </FadeIn>

        {/* Save Button */}
        <FadeIn delay={0.3}>
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Changes
            </Button>
          </div>
        </FadeIn>
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
          {resolvedTheme === "dark" ? "Dark mode active" : "Light mode active"}
        </p>
      </CardContent>
    </Card>
  )
}
