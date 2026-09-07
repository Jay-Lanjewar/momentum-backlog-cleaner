import { render, screen, fireEvent } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { FocusModePage } from "@/pages/FocusModePage"
import type { PlanSession } from "@/services/types"
import type { FocusLockPhase, UseFocusLockReturn } from "@/hooks/useFocusLock"

const mocks = vi.hoisted(() => {
  const session: PlanSession = {
    backlog_item_id: "b1",
    session_id: "b1:s1",
    start_time: "16:00",
    end_time: "16:25",
    reason: "Work on Chemistry Revision",
    remaining_minutes: 0,
  }

  const nextSession: PlanSession = {
    backlog_item_id: "b2",
    session_id: "b2:s1",
    start_time: "18:00",
    end_time: "18:30",
    reason: "Work on Maths Practice",
    remaining_minutes: 0,
  }

  return {
    session,
    nextSession,
    updateItem: vi.fn(),
    completeResponse: {
      plan: { sessions: [nextSession], daily_message: "", overflow: [] },
      changes: [],
      snapshot_id: "snap-1",
      previous_sessions: [session, nextSession],
    } as Record<string, unknown>,
    adaptiveChanges: [
      {
        session_id: "h1:s1",
        backlog_item_id: "h1",
        title: "History",
        change_type: "moved_to_overflow" as const,
        previous_start: "13:30",
        previous_end: "14:00",
        new_start: null,
        new_end: null,
        reason: "Physics took longer than expected. History was moved to the next available day.",
      },
    ],
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
  }
})

let currentPhase: FocusLockPhase = "focusing"
let currentFocusedElapsedMs = 0

const mockPause = vi.fn(() => { currentPhase = "paused_by_user" })
const mockResume = vi.fn(() => { currentPhase = "focusing" })
const mockComplete = vi.fn(() => { currentPhase = "complete" })
const mockReset = vi.fn()

const mockUseFocusLock = vi.fn<() => UseFocusLockReturn>(() => ({
  phase: currentPhase,
  focusedElapsedMs: currentFocusedElapsedMs,
  remainingMs: 1_500_000 - currentFocusedElapsedMs,
  isFullscreen: false,
  pause: mockPause,
  resume: mockResume,
  complete: mockComplete,
  reset: mockReset,
}))

vi.mock("@/hooks/useFocusLock", () => ({
  useFocusLock: () => mockUseFocusLock(),
}))

vi.mock("@/services/hooks", () => ({
  useProfile: () => ({ data: mocks.profile }),
  useUpdateBacklogItem: () => ({ mutate: mocks.updateItem }),
  useCompleteSession: () => ({
    mutate: vi.fn(
      (
        _payload: { session_id: string; actual_minutes: number },
        options: { onSuccess?: (data: unknown) => void },
      ) => {
        options.onSuccess?.(mocks.completeResponse)
      },
    ),
  }),
}))

function renderFocus(state?: { session: PlanSession; sessions: PlanSession[] }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/focus",
            state: state ?? { session: mocks.session, sessions: [mocks.session, mocks.nextSession] },
          },
        ]}
      >
        <Routes>
          <Route path="/focus" element={<FocusModePage />} />
          <Route path="/" element={<div>Today Home</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe("FocusModePage", () => {
  beforeEach(() => {
    mocks.updateItem.mockClear()
    mockPause.mockClear()
    mockResume.mockClear()
    mockComplete.mockClear()
    mockReset.mockClear()
    currentPhase = "focusing"
    currentFocusedElapsedMs = 0
    mocks.completeResponse = {
      plan: { sessions: [mocks.nextSession], daily_message: "", overflow: [] },
      changes: [],
      snapshot_id: "snap-1",
      previous_sessions: [mocks.session, mocks.nextSession],
    }
  })

  it("shows the session title and timer", () => {
    renderFocus()
    expect(screen.getByRole("heading", { name: "Chemistry Revision" })).toBeInTheDocument()
    expect(screen.getByText("25:00")).toBeInTheDocument()
    expect(screen.getByText("remaining")).toBeInTheDocument()
  })

  it("coaches progress during the session", () => {
    renderFocus()
    const coach = screen.getByRole("status", { name: "Momentum" })
    expect(coach).toHaveTextContent(/Settle in. The first few minutes are the hardest/)
  })

  it("calls pause when Pause button is clicked", () => {
    renderFocus()
    fireEvent.click(screen.getByRole("button", { name: "Pause timer" }))
    expect(mockPause).toHaveBeenCalled()
  })

  it("calls resume when Resume button is clicked", () => {
    currentPhase = "paused_by_user"
    currentFocusedElapsedMs = 600_000
    renderFocus()
    fireEvent.click(screen.getByRole("button", { name: "Resume timer" }))
    expect(mockResume).toHaveBeenCalled()
  })

  it("calls complete when Finish Early is clicked", () => {
    renderFocus()
    fireEvent.click(screen.getByRole("button", { name: /finish early/i }))
    expect(mockComplete).toHaveBeenCalled()
  })

  it("shows completion screen after completion", () => {
    currentPhase = "complete"
    renderFocus()
    expect(screen.getByText(/Nice work, Alex!/)).toBeInTheDocument()
  })

  it("recommends the next task with a Start Next Session action", () => {
    currentPhase = "complete"
    renderFocus()
    expect(screen.getByRole("heading", { name: "Maths Practice" })).toBeInTheDocument()
    expect(
      screen.getByText("Up next in today's plan. Starting now keeps your momentum."),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /start next session/i }),
    ).toBeInTheDocument()
  })
})

describe("FocusModePage empty state", () => {
  it("explains how to get back to a session", () => {
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[{ pathname: "/focus" }]}>
          <Routes>
            <Route path="/focus" element={<FocusModePage />} />
            <Route path="/" element={<div>Today Home</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByText("No study block found")).toBeInTheDocument()
    expect(
      screen.getByText("Go back to Today's Mission to start a study session."),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /back to today/i })).toBeInTheDocument()
  })
})

describe("FocusModePage adaptation summary", () => {
  beforeEach(() => {
    currentPhase = "focusing"
    currentFocusedElapsedMs = 0
    mocks.completeResponse = {
      plan: { sessions: [mocks.nextSession], daily_message: "", overflow: [] },
      changes: [],
      snapshot_id: "snap-1",
      previous_sessions: [mocks.session, mocks.nextSession],
    }
  })

  it("shows adaptation card when adaptiveResponse has changes", () => {
    mocks.completeResponse = {
      plan: { sessions: [mocks.nextSession], daily_message: "", overflow: [] },
      changes: mocks.adaptiveChanges,
      snapshot_id: "snap-2",
      previous_sessions: [mocks.session, mocks.nextSession],
    }
    renderFocus()
    fireEvent.click(screen.getByRole("button", { name: /finish early/i }))
    expect(screen.getByText("Momentum Adapted Your Plan")).toBeInTheDocument()
    expect(
      screen.getByText(/Physics took longer than expected/),
    ).toBeInTheDocument()
  })

  it("hides adaptation card when adaptiveResponse has no changes", () => {
    renderFocus()
    fireEvent.click(screen.getByRole("button", { name: /finish early/i }))
    expect(screen.queryByText("Momentum Adapted Your Plan")).not.toBeInTheDocument()
  })

  it("uses v2 sessions for Start Next Session navigation", () => {
    mocks.completeResponse = {
      plan: { sessions: [mocks.nextSession], daily_message: "", overflow: [] },
      changes: mocks.adaptiveChanges,
      snapshot_id: "snap-2",
      previous_sessions: [mocks.session, mocks.nextSession],
    }
    renderFocus()
    fireEvent.click(screen.getByRole("button", { name: /finish early/i }))
    expect(screen.getByRole("heading", { name: "Maths Practice" })).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /start next session/i }),
    ).toBeInTheDocument()
  })
})

describe("FocusModePage focus lock", () => {
  it("shows focus lock overlay when paused by user", () => {
    currentPhase = "paused_by_user"
    currentFocusedElapsedMs = 600_000
    renderFocus()
    expect(screen.getByText("Take a break")).toBeInTheDocument()
    expect(screen.getByText("Pause the timer whenever you need.")).toBeInTheDocument()
    expect(screen.getByText("10:00 focused")).toBeInTheDocument()
  })

  it("shows focus lock overlay when paused due to lost focus", () => {
    currentPhase = "paused_lost_focus"
    currentFocusedElapsedMs = 300_000
    renderFocus()
    expect(screen.getByText("Focus paused")).toBeInTheDocument()
    expect(screen.getByText("Your focused time is paused until you return.")).toBeInTheDocument()
    expect(screen.getByText("05:00 focused")).toBeInTheDocument()
  })

  it("shows welcome back when returning from lost focus", () => {
    currentPhase = "focus_returned"
    currentFocusedElapsedMs = 300_000
    renderFocus()
    expect(screen.getByText("Welcome back")).toBeInTheDocument()
    expect(screen.getByText("Your timer is right where you left it.")).toBeInTheDocument()
  })

  it("does not show overlay when focusing", () => {
    currentPhase = "focusing"
    renderFocus()
    expect(screen.queryByRole("status", { name: "Focus lock status" })).not.toBeInTheDocument()
  })

  it("resume button calls hook resume", () => {
    currentPhase = "paused_by_user"
    currentFocusedElapsedMs = 600_000
    renderFocus()
    fireEvent.click(screen.getByRole("button", { name: "Resume timer" }))
    expect(mockResume).toHaveBeenCalled()
  })
})
