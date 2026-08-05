import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TodayMissionPage } from "@/pages/TodayMissionPage"
import type { DashboardData } from "@/services/types"

const state = vi.hoisted(() => ({
  dashboard: undefined as DashboardData | undefined,
}))

vi.mock("@/services/hooks", () => ({
  useDashboard: () => ({
    data: state.dashboard,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))

const MIN = 60 * 1000
const DAY = 24 * 60 * MIN

function buildDashboard(): DashboardData {
  const now = Date.now()
  const fmt = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`

  const start1 = new Date(now + 30 * MIN)
  const session1 = {
    backlog_item_id: "b1",
    start_time: fmt(start1),
    end_time: fmt(new Date(start1.getTime() + 25 * MIN)),
    reason: "Work on Chemistry Revision",
    remaining_minutes: 0,
  }
  const start2 = new Date(now + 120 * MIN)
  const session2 = {
    backlog_item_id: "b2",
    start_time: fmt(start2),
    end_time: fmt(new Date(start2.getTime() + 30 * MIN)),
    reason: "Work on Maths Practice",
    remaining_minutes: 0,
  }

  const item = (id: string, title: string, course: string, color: string, due: string, overdue: boolean) => ({
    id,
    title,
    course_id: `c-${id}`,
    course_name: course,
    course_color: color,
    priority: 3,
    score: 50,
    estimated_minutes: 40,
    due_date: due,
    overdue,
    status: "pending",
  })

  return {
    profile: {
      id: "u1",
      user_id: "u1",
      name: "Alex",
      class_name: "10",
      board: null,
      school_timings: null,
      coaching_timings: null,
      sleep_schedule: null,
      energy_peak: null,
      preferred_study_window: null,
      daily_target_minutes: 120,
      created_at: "",
      updated_at: "",
    },
    streaks: {
      momentum: {
        current_streak: 3,
        longest_streak: 5,
        total_study_days: 12,
        last_completed_date: new Date(now - DAY).toISOString(),
        recovery_tokens_current: 0,
        recovery_tokens_earned: 0,
        recovery_tokens_used: 0,
        streak_protected_today: false,
      },
      subjects: [],
    },
    balance: { score: 70, message: null, neglected_subjects: [] },
    insight: { title: "", message: "", priority: 0 },
    planning: {
      available_windows: [],
      prioritized_backlog: [
        item("b1", "Chemistry Revision", "Chemistry", "#22c55e", new Date(now - DAY).toISOString(), true),
        item("b2", "Maths Practice", "Maths", "#6366f1", new Date(now + 2 * DAY).toISOString(), false),
      ],
      total_available_minutes: 300,
      total_required_minutes: 80,
      estimated_days_to_clear: 1,
      backlog_health: {
        total_items: 2,
        completed_items: 0,
        overdue_items: 1,
        pending_items: 2,
        clear_rate_7d: 0.5,
        health_score: "fair",
        estimated_completion_date: new Date(now + 3 * DAY).toISOString(),
      },
    },
    plan: {
      plan: {
        sessions: [session1, session2],
        daily_message: "Today's plan focuses on your highest-impact work.",
        overflow: [],
      },
      source: "deterministic",
    },
  }
}

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  localStorage.setItem("momentum_onboarded", "true")
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TodayMissionPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe("TodayMissionPage", () => {
  beforeEach(() => {
    state.dashboard = buildDashboard()
  })

  it("shows a greeting and the mission hero as the primary action", () => {
    renderDashboard()
    expect(
      screen.getByText(/Good (morning|afternoon|evening), Alex/)
    ).toBeInTheDocument()
    expect(screen.getAllByText("Today's Mission").length).toBeGreaterThan(0)
    expect(
      screen.getByRole("heading", { name: "Chemistry Revision" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /start focus session/i })
    ).toBeInTheDocument()
  })

  it("explains why the AI picked this task and coaches actionably", () => {
    renderDashboard()
    expect(
      screen.getByText("This task is overdue. Finishing it now puts you back on schedule.")
    ).toBeInTheDocument()
    const coach = screen.getByRole("status", { name: "AI Coach" })
    expect(coach).toHaveTextContent(/Starting now puts you back on schedule/)
  })

  it("does NOT offer a Mark Complete shortcut on the dashboard", () => {
    renderDashboard()
    expect(
      screen.queryByRole("button", { name: /mark complete/i })
    ).not.toBeInTheDocument()
  })

  it("shows meaningful progress instead of empty statistics", () => {
    renderDashboard()
    expect(screen.getByText("Today's Progress")).toBeInTheDocument()
    expect(screen.getByText("Tasks")).toBeInTheDocument()
    expect(screen.getByText("Study Time")).toBeInTheDocument()
    expect(screen.getByText("Streak")).toBeInTheDocument()
    expect(screen.getByText("Next Deadline")).toBeInTheDocument()
    expect(screen.getByText(/0\/2/)).toBeInTheDocument()
    expect(screen.getByText("3 days")).toBeInTheDocument()
  })

  it("lists the remaining sessions with a Start action", () => {
    renderDashboard()
    expect(screen.getByText("Up Next Today")).toBeInTheDocument()
    expect(screen.getByText("Maths Practice")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /start maths practice/i })).toBeInTheDocument()
  })

  it("educates the user when there is no work yet", () => {
    state.dashboard = buildDashboard()
    state.dashboard!.planning.prioritized_backlog = []
    state.dashboard!.plan.plan.sessions = []
    renderDashboard()
    expect(screen.getByText("No work yet.")).toBeInTheDocument()
    expect(
      screen.getByText(
        "Add your homework and Momentum will automatically build today's study plan."
      )
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /add work/i })).toBeInTheDocument()
  })
})
