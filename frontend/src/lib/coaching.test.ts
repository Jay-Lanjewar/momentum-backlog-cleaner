import { describe, expect, it } from "vitest"

import {
  buildCoachingLine,
  buildRecommendationReason,
  chipForDate,
  difficultyFromPriority,
  difficultyLabel,
  dueDateForChip,
  estimateTimeSaved,
  focusCoachMessage,
  formatMinutes,
  formatTimeDisplay,
  getGreeting,
  minutesBetween,
  nextSessionAfter,
  priorityFromDifficulty,
  scheduleConfidence,
} from "@/lib/coaching"
import type { PlanSession } from "@/services/types"

const NOW = new Date("2026-08-05T10:00:00") // a Wednesday

describe("getGreeting", () => {
  it("greets by time of day", () => {
    expect(getGreeting(8)).toBe("Good morning")
    expect(getGreeting(12)).toBe("Good afternoon")
    expect(getGreeting(17)).toBe("Good evening")
    expect(getGreeting(23)).toBe("Good evening")
  })
})

describe("difficulty mapping", () => {
  it("derives difficulty from the 4-level priority", () => {
    expect(difficultyFromPriority(1)).toBe("hard")
    expect(difficultyFromPriority(2)).toBe("hard")
    expect(difficultyFromPriority(3)).toBe("medium")
    expect(difficultyFromPriority(4)).toBe("easy")
    expect(difficultyFromPriority(null)).toBe("medium")
  })

  it("maps difficulty back to a priority that the planner understands", () => {
    expect(priorityFromDifficulty("hard")).toBe(1)
    expect(priorityFromDifficulty("medium")).toBe(3)
    expect(priorityFromDifficulty("easy")).toBe(4)
  })

  it("labels difficulties for display", () => {
    expect(difficultyLabel("easy")).toBe("Easy")
    expect(difficultyLabel("medium")).toBe("Medium")
    expect(difficultyLabel("hard")).toBe("Hard")
  })
})

describe("due date chips", () => {
  it("computes due dates for Today / Tomorrow / This Week", () => {
    expect(dueDateForChip("today", NOW)).toBe("2026-08-05")
    expect(dueDateForChip("tomorrow", NOW)).toBe("2026-08-06")
    // Wednesday 2026-08-05 -> end of week is Sunday 2026-08-09
    expect(dueDateForChip("week", NOW)).toBe("2026-08-09")
  })

  it("classifies an existing date back into a chip", () => {
    expect(chipForDate("2026-08-05T00:00:00", NOW)).toBe("today")
    expect(chipForDate("2026-08-06T00:00:00", NOW)).toBe("tomorrow")
    expect(chipForDate("2026-08-09T00:00:00", NOW)).toBe("week")
    expect(chipForDate("2026-09-01T00:00:00", NOW)).toBe("custom")
    expect(chipForDate(null, NOW)).toBeNull()
  })
})

describe("buildRecommendationReason", () => {
  const base = {
    subject: "Chemistry",
    topic: "Revision",
    overdue: false,
    dueDate: null,
    isCurrent: false,
  }

  it("prioritizes overdue tasks", () => {
    expect(
      buildRecommendationReason({ ...base, overdue: true })
    ).toMatch(/puts you back on schedule/)
  })

  it("flags deadlines that are close", () => {
    expect(
      buildRecommendationReason({ ...base, dueDate: "2026-08-08", daysUntilDue: 2 })
    ).toMatch(/deadline is close/)
  })

  it("mentions work due this week", () => {
    expect(
      buildRecommendationReason({ ...base, subject: "Maths", dueDate: "2026-08-10", daysUntilDue: 6 })
    ).toBe("Maths is due this week. Finishing it now keeps you ahead.")
  })

  it("points to the current session as the next move", () => {
    expect(
      buildRecommendationReason({ ...base, isCurrent: true })
    ).toMatch(/up next in today's plan/)
  })

  it("nudges back on schedule when behind", () => {
    expect(
      buildRecommendationReason({ ...base, healthScore: "fair" })
    ).toMatch(/back on schedule/)
  })

  it("defaults to a positive call to action", () => {
    expect(buildRecommendationReason(base)).toMatch(/highest-impact/)
  })
})

describe("buildCoachingLine", () => {
  it("keeps a good score encouraging", () => {
    expect(
      buildCoachingLine({ healthScore: "good", overdueMinutes: 0 })
    ).toBe("You're on schedule. Keep the momentum going.")
  })

  it("is actionable when overdue", () => {
    expect(
      buildCoachingLine({ healthScore: "fair", overdueMinutes: 95 })
    ).toMatch(/Starting now puts you back on schedule — 2 hours of work is overdue/)
  })

  it("is actionable when slightly behind", () => {
    expect(
      buildCoachingLine({ healthScore: "fair", overdueMinutes: 0 })
    ).toBe("A little behind today. Starting now gets you back on track.")
  })

  it("is actionable when far behind", () => {
    expect(
      buildCoachingLine({ healthScore: "critical", overdueMinutes: 0 })
    ).toBe("You're behind schedule. Starting now is the fastest way back on track.")
  })

  it("mentions the estimated completion date when on track", () => {
    expect(
      buildCoachingLine({
        healthScore: "good",
        overdueMinutes: 0,
        estimatedCompletionDate: "2026-08-20T00:00:00",
      })
    ).toMatch(/You'll finish everything by Aug 20/)
  })
})

describe("focusCoachMessage", () => {
  it("coaches through the session", () => {
    expect(focusCoachMessage(0)).toMatch(/first few minutes/)
    expect(focusCoachMessage(30)).toMatch(/building momentum/)
    expect(focusCoachMessage(55)).toMatch(/More than halfway/)
    expect(focusCoachMessage(90)).toMatch(/final stretch/i)
    expect(focusCoachMessage(100)).toBe("Done. Great focus.")
  })
})

describe("estimateTimeSaved and scheduleConfidence", () => {
  it("computes minutes saved vs the raw estimate", () => {
    expect(estimateTimeSaved(60, 25)).toBe(35)
    expect(estimateTimeSaved(25, 25)).toBeNull()
    expect(estimateTimeSaved(null, 25)).toBeNull()
  })

  it("maps health to a confidence label", () => {
    expect(scheduleConfidence("good")?.label).toBe("High")
    expect(scheduleConfidence("fair")?.label).toBe("Medium")
    expect(scheduleConfidence("critical")?.label).toBe("Low")
    expect(scheduleConfidence(null)).toBeNull()
  })
})

describe("nextSessionAfter", () => {
  const s1: PlanSession = {
    backlog_item_id: "a",
    start_time: "16:00",
    end_time: "16:25",
    reason: "Work on Chemistry",
    remaining_minutes: 0,
  }
  const s2: PlanSession = {
    backlog_item_id: "b",
    start_time: "17:00",
    end_time: "17:30",
    reason: "Work on Maths",
    remaining_minutes: 0,
  }

  it("returns the next scheduled session after the current one", () => {
    expect(nextSessionAfter([s1, s2], "a", "16:00")).toEqual(s2)
    expect(nextSessionAfter([s1, s2], "b", "17:00")).toBeNull()
  })
})

describe("time helpers", () => {
  it("computes minutes and formats time", () => {
    expect(minutesBetween("16:00", "16:25")).toBe(25)
    expect(formatTimeDisplay("16:00")).toBe("4:00 PM")
    expect(formatTimeDisplay("09:05")).toBe("9:05 AM")
    expect(formatMinutes(25)).toBe("25 min")
    expect(formatMinutes(75)).toBe("1h 15m")
    expect(formatMinutes(120)).toBe("2h")
  })
})
