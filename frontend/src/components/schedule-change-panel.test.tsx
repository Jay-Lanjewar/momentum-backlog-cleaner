import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { ScheduleChangePanel } from "@/components/schedule-change-panel"
import type { PlanChange, PlanSession } from "@/services/types"

const physicsSession: PlanSession = {
  backlog_item_id: "p1",
  session_id: "p1:s1",
  start_time: "13:00",
  end_time: "13:30",
  reason: "Work on Physics",
  remaining_minutes: 0,
}

const historySession: PlanSession = {
  backlog_item_id: "h1",
  session_id: "h1:s1",
  start_time: "13:30",
  end_time: "14:00",
  reason: "Work on History",
  remaining_minutes: 0,
}

const mathsSession: PlanSession = {
  backlog_item_id: "m1",
  session_id: "m1:s1",
  start_time: "14:00",
  end_time: "14:30",
  reason: "Work on Maths",
  remaining_minutes: 0,
}

const overflowChange: PlanChange = {
  session_id: "h1:s1",
  backlog_item_id: "h1",
  title: "History",
  change_type: "moved_to_overflow",
  previous_start: "13:30",
  previous_end: "14:00",
  new_start: null,
  new_end: null,
  reason: "Physics took longer than expected. History was moved to the next available day.",
}

const rescheduledChange: PlanChange = {
  session_id: "m1:s1",
  backlog_item_id: "m1",
  title: "Maths",
  change_type: "rescheduled",
  previous_start: "14:00",
  previous_end: "14:30",
  new_start: "14:30",
  new_end: "15:00",
  reason: "Maths was rescheduled to a later time.",
}

function renderPanel(
  changes: PlanChange[],
  previousSessions: PlanSession[] = [],
  currentSessions: PlanSession[] = [],
) {
  return render(
    <ScheduleChangePanel
      changes={changes}
      previous_sessions={previousSessions}
      current_sessions={currentSessions}
      onDismiss={() => {}}
    />,
  )
}

describe("ScheduleChangePanel", () => {
  it("returns null when changes is empty", () => {
    const { container } = renderPanel([])
    expect(container.firstChild).toBeNull()
  })

  it("shows the primary reason", () => {
    renderPanel([overflowChange])
    expect(screen.getByText(overflowChange.reason)).toBeInTheDocument()
  })

  it("shows change rows with before/after times", () => {
    renderPanel([overflowChange, rescheduledChange])
    expect(screen.getByText("History")).toBeInTheDocument()
    expect(screen.getByText("Maths")).toBeInTheDocument()
    expect(screen.getByText("Next available day")).toBeInTheDocument()
  })

  it("renders BEFORE and AFTER timelines when sessions provided", () => {
    renderPanel(
      [overflowChange],
      [physicsSession, historySession, mathsSession],
      [physicsSession, mathsSession],
    )
    expect(screen.getByText("Before")).toBeInTheDocument()
    expect(screen.getByText("After")).toBeInTheDocument()
  })

  it("shows all session names in legends across both timelines", () => {
    renderPanel(
      [overflowChange],
      [physicsSession, historySession, mathsSession],
      [physicsSession, mathsSession],
    )
    const physicsElements = screen.getAllByText("Physics")
    expect(physicsElements.length).toBeGreaterThanOrEqual(2)
    const historyElements = screen.getAllByText("History")
    expect(historyElements.length).toBeGreaterThanOrEqual(1)
    const mathsElements = screen.getAllByText("Maths")
    expect(mathsElements.length).toBeGreaterThanOrEqual(2)
  })

  it("shows overflow indicator for moved-to-tomorrow sessions", () => {
    renderPanel(
      [overflowChange],
      [physicsSession, historySession],
      [physicsSession],
    )
    expect(screen.getByText("+1 tomorrow")).toBeInTheDocument()
  })

  it("renders GOT IT dismiss button", () => {
    renderPanel([overflowChange])
    expect(screen.getByRole("button", { name: /got it/i })).toBeInTheDocument()
  })

  it("collapses extra changes when toggle clicked", async () => {
    const user = userEvent.setup()
    renderPanel([overflowChange, rescheduledChange])

    const toggle = screen.getByText("Show less")
    await user.click(toggle)
    expect(screen.getByText(/1 more change/)).toBeInTheDocument()
  })
})
