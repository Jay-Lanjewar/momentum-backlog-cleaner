import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { CoachMessage } from "@/components/coach/coach-message"
import { RecommendedNextCard } from "@/components/coach/recommended-next"

describe("CoachMessage", () => {
  it("renders as a status region labelled AI Coach", () => {
    render(<CoachMessage>Starting now puts you back on schedule.</CoachMessage>)
    const status = screen.getByRole("status", { name: "AI Coach" })
    expect(status).toBeInTheDocument()
    expect(
      screen.getByText("Starting now puts you back on schedule.")
    ).toBeInTheDocument()
  })

  it("supports a custom label and tone", () => {
    render(<CoachMessage label="Momentum" tone="success">Great focus!</CoachMessage>)
    expect(screen.getByRole("status", { name: "Momentum" })).toBeInTheDocument()
    expect(screen.getByText("Great focus!")).toBeInTheDocument()
  })
})

describe("RecommendedNextCard", () => {
  const baseProps = {
    task: "Chemistry Revision",
    subject: "Chemistry",
    reason: "Your chemistry exam is closer than maths. Finishing this now keeps you on schedule.",
    bestTime: "4:00 PM",
    finishTime: "4:25 PM",
    durationLabel: "25 min",
    timeSaved: 15,
    confidence: { label: "High", detail: "Your plan is comfortably on track." },
  }

  it("renders the recommendation with all AI meta fields", () => {
    render(<RecommendedNextCard {...baseProps} />)
    expect(screen.getByText("Recommended Next")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Chemistry Revision" })).toBeInTheDocument()
    expect(screen.getByText(baseProps.reason)).toBeInTheDocument()
    expect(screen.getByText("Focus Time")).toBeInTheDocument()
    expect(screen.getByText("25 min")).toBeInTheDocument()
    expect(screen.getByText("Best Time")).toBeInTheDocument()
    expect(screen.getByText("4:00 PM")).toBeInTheDocument()
    expect(screen.getByText("Est. Finish")).toBeInTheDocument()
    expect(screen.getByText("4:25 PM")).toBeInTheDocument()
    expect(screen.getByText("Time Saved")).toBeInTheDocument()
    expect(screen.getByText("15 min")).toBeInTheDocument()
    expect(screen.getByText("Schedule Confidence")).toBeInTheDocument()
    expect(screen.getByText("High")).toBeInTheDocument()
  })

  it("uses the eyebrow label when provided", () => {
    render(<RecommendedNextCard {...baseProps} eyebrow="Today's Mission" />)
    expect(screen.getByText("Today's Mission")).toBeInTheDocument()
    expect(screen.queryByText("Recommended Next")).not.toBeInTheDocument()
  })

  it("hides optional meta chips when not provided", () => {
    render(
      <RecommendedNextCard
        task="Maths Practice"
        reason="Up next in today's plan."
      />
    )
    expect(screen.queryByText("Focus Time")).not.toBeInTheDocument()
    expect(screen.queryByText("Best Time")).not.toBeInTheDocument()
    expect(screen.queryByText("Schedule Confidence")).not.toBeInTheDocument()
  })

  it("fires onStart when the CTA is pressed", async () => {
    const user = userEvent.setup()
    const onStart = vi.fn()
    render(
      <RecommendedNextCard
        {...baseProps}
        ctaLabel="Start Focus Session"
        onStart={onStart}
      />
    )
    await user.click(screen.getByRole("button", { name: /start focus session/i }))
    expect(onStart).toHaveBeenCalledTimes(1)
  })
})
