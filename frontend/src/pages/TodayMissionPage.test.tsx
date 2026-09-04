import { act, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TodayMissionPage } from "@/pages/TodayMissionPage"
import type { DashboardData } from "@/services/types"

const state = vi.hoisted(() => ({
  dashboard: undefined as DashboardData | undefined,
  isLoading: false,
}))

vi.mock("@/services/hooks", () => ({
  useDashboard: () => ({
    data: state.dashboard,
    isLoading: state.isLoading,
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
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TodayMissionPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
  return result
}

describe("TodayMissionPage", () => {
  beforeEach(() => {
    state.dashboard = buildDashboard()
    state.isLoading = false
  })

  it("shows a greeting with dynamic backlog count subtitle", () => {
    renderDashboard()
    expect(
      screen.getByText(/Good (morning|afternoon|evening), Alex/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/You have 2 unfinished tasks/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Momentum picked the best place to start/)
    ).toBeInTheDocument()
  })

  it("explains why Momentum picked this task with decision factors", () => {
    renderDashboard()
    const coach = screen.getByRole("status", { name: "Why this task?" })
    expect(coach).toHaveTextContent(/overdue/)
    expect(coach).toHaveTextContent(/puts you back on schedule/)
  })

  it("shows a coaching explanation with decision factors", () => {
    renderDashboard()
    const coach = screen.getByRole("status", { name: "Why this task?" })
    expect(coach).toHaveTextContent(/overdue/)
  })

  it("shows overdue badge on the mission card when task is overdue", () => {
    renderDashboard()
    expect(screen.getByText("Overdue")).toBeInTheDocument()
  })

  it("shows backlog status with remaining tasks and study time", () => {
    renderDashboard()
    expect(screen.getByText("Backlog Status")).toBeInTheDocument()
    expect(screen.getByText("2 tasks")).toBeInTheDocument()
    expect(screen.getByText("remaining")).toBeInTheDocument()
    expect(screen.getByText("1 overdue")).toBeInTheDocument()
    expect(screen.getByText("needs attention")).toBeInTheDocument()
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

  it("shows all caught up message when all tasks are completed", () => {
    state.dashboard = buildDashboard()
    state.dashboard!.planning.prioritized_backlog[0].status = "completed"
    state.dashboard!.planning.prioritized_backlog[1].status = "completed"
    renderDashboard()
    expect(screen.getByText("All caught up for today.")).toBeInTheDocument()
  })

  it("hides backlog status when there are no tasks", () => {
    state.dashboard = buildDashboard()
    state.dashboard!.planning.prioritized_backlog = []
    state.dashboard!.plan.plan.sessions = []
    renderDashboard()
    expect(screen.queryByText("Backlog Status")).not.toBeInTheDocument()
  })

  it("shows singular subtitle for one unfinished task", () => {
    state.dashboard = buildDashboard()
    state.dashboard!.planning.prioritized_backlog = [
      state.dashboard!.planning.prioritized_backlog[0],
    ]
    state.dashboard!.plan.plan.sessions = [
      state.dashboard!.plan.plan.sessions[0],
    ]
    state.dashboard!.planning.backlog_health = {
      ...state.dashboard!.planning.backlog_health!,
      total_items: 1,
      pending_items: 1,
      overdue_items: 1,
    }
    renderDashboard()
    expect(
      screen.getByText(/You have 1 unfinished task/)
    ).toBeInTheDocument()
  })

  it("shows all caught up subtitle when there are no tasks", () => {
    state.dashboard = buildDashboard()
    state.dashboard!.planning.prioritized_backlog = []
    state.dashboard!.plan.plan.sessions = []
    renderDashboard()
    expect(screen.getByText("All caught up for today.")).toBeInTheDocument()
  })

  it("explains due-soon task with day count", () => {
    state.dashboard = buildDashboard()
    const tomorrow = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000)
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}T12:00:00.000Z`
    state.dashboard!.planning.prioritized_backlog[1].due_date = tomorrowStr
    state.dashboard!.planning.prioritized_backlog[1].overdue = false
    state.dashboard!.planning.prioritized_backlog[0].status = "completed"
    state.dashboard!.planning.backlog_health = {
      ...state.dashboard!.planning.backlog_health!,
      overdue_items: 0,
    }
    const fmt = (d: Date) =>
      `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    const now = Date.now()
    const start = new Date(now + 30 * 60 * 1000)
    state.dashboard!.plan.plan.sessions = [
      {
        backlog_item_id: "b2",
        start_time: fmt(start),
        end_time: fmt(new Date(start.getTime() + 30 * 60 * 1000)),
        reason: "Work on Maths Practice",
        remaining_minutes: 0,
      },
    ]
    renderDashboard()
    const coach = screen.getByRole("status", { name: "Why this task?" })
    expect(coach).toHaveTextContent(/due/)
  })

  it("explains fair-health task with schedule warning", () => {
    state.dashboard = buildDashboard()
    const nextWeek = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
    const nextWeekStr = `${nextWeek.getFullYear()}-${String(nextWeek.getMonth() + 1).padStart(2, "0")}-${String(nextWeek.getDate()).padStart(2, "0")}T12:00:00.000Z`
    state.dashboard!.planning.prioritized_backlog.forEach((item) => {
      item.overdue = false
      item.due_date = nextWeekStr
    })
    state.dashboard!.planning.backlog_health = {
      ...state.dashboard!.planning.backlog_health!,
      overdue_items: 0,
      health_score: "fair",
    }
    const fmt = (d: Date) =>
      `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    const now = Date.now()
    const start = new Date(now + 30 * 60 * 1000)
    state.dashboard!.plan.plan.sessions = [
      {
        backlog_item_id: "b1",
        start_time: fmt(start),
        end_time: fmt(new Date(start.getTime() + 25 * 60 * 1000)),
        reason: "Work on Chemistry Revision",
        remaining_minutes: 0,
      },
    ]
    renderDashboard()
    const coach = screen.getByRole("status", { name: "Why this task?" })
    expect(coach).toHaveTextContent(/falling further behind/)
  })

  it("survives isLoading→loaded transition without hook order crash", () => {
    state.dashboard = undefined
    state.isLoading = true
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TodayMissionPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.queryByText(/Good (morning|afternoon|evening)/)).not.toBeInTheDocument()

    state.isLoading = false
    state.dashboard = buildDashboard()
    act(() => {
      rerender(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <TodayMissionPage />
          </MemoryRouter>
        </QueryClientProvider>
      )
    })

    expect(
      screen.getByText(/Good (morning|afternoon|evening)/)
    ).toBeInTheDocument()
    expect(screen.getByText(/You have 2 unfinished tasks/)).toBeInTheDocument()
  })
})
