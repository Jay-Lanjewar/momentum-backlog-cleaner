import {
  formatMinutes,
  formatHourMinute,
  formatTimeRange,
  getGreeting,
  focusCoachMessage,
  healthTone,
  buildRecommendationReason,
  topicFromSession,
  nextSessionAfter,
} from "../lib/coaching";

describe("formatMinutes", () => {
  it("formats minutes only", () => {
    expect(formatMinutes(45)).toBe("45m");
  });

  it("formats hours only", () => {
    expect(formatMinutes(120)).toBe("2h");
  });

  it("formats hours and minutes", () => {
    expect(formatMinutes(90)).toBe("1h 30m");
  });
});

describe("formatHourMinute", () => {
  it("formats morning time", () => {
    expect(formatHourMinute("09:30")).toBe("9:30 AM");
  });

  it("formats noon", () => {
    expect(formatHourMinute("12:00")).toBe("12:00 PM");
  });

  it("formats evening time", () => {
    expect(formatHourMinute("17:15")).toBe("5:15 PM");
  });

  it("formats midnight", () => {
    expect(formatHourMinute("00:00")).toBe("12:00 AM");
  });
});

describe("getGreeting", () => {
  it("includes name when provided", () => {
    const result = getGreeting("Alice");
    expect(result).toContain("Alice");
  });

  it("returns generic greeting when no name", () => {
    const result = getGreeting(null);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("focusCoachMessage", () => {
  const totalMs = 25 * 60 * 1000; // 25 minutes

  it("returns start message at 0%", () => {
    const msg = focusCoachMessage(0, totalMs);
    expect(msg).toContain("start");
  });

  it("returns momentum message at 30%", () => {
    const msg = focusCoachMessage(totalMs * 0.3, totalMs);
    expect(msg.toLowerCase()).toContain("momentum");
  });

  it("returns halfway message at 60%", () => {
    const msg = focusCoachMessage(totalMs * 0.6, totalMs);
    expect(msg).toContain("halfway");
  });

  it("returns almost done message at 90%", () => {
    const msg = focusCoachMessage(totalMs * 0.9, totalMs);
    expect(msg).toContain("Almost there");
  });
});

describe("healthTone", () => {
  it("returns success for good", () => {
    expect(healthTone("good")).toBe("success");
  });

  it("returns warning for fair", () => {
    expect(healthTone("fair")).toBe("warning");
  });

  it("returns destructive for critical", () => {
    expect(healthTone("critical")).toBe("destructive");
  });
});

describe("buildRecommendationReason", () => {
  it("returns overdue message for overdue items", () => {
    const result = buildRecommendationReason(
      { overdue: true, due_date: "2026-09-01", priority: 2 },
      "good",
    );
    expect(result).toContain("overdue");
  });

  it("returns critical message when health is critical", () => {
    const result = buildRecommendationReason(
      { overdue: false, due_date: null, priority: 2 },
      "critical",
    );
    expect(result).toContain("attention");
  });

  it("returns high-priority message for priority 1", () => {
    const result = buildRecommendationReason(
      { overdue: false, due_date: null, priority: 1 },
      "good",
    );
    expect(result).toContain("High-priority");
  });
});

describe("formatTimeRange", () => {
  it("formats a time range", () => {
    expect(formatTimeRange("14:00", "16:30")).toBe("2:00 PM – 4:30 PM");
  });
});

describe("topicFromSession", () => {
  it("strips Work on prefix", () => {
    expect(topicFromSession({ reason: "Work on Physics Ch. 5" })).toBe(
      "Physics Ch. 5",
    );
  });

  it("returns reason unchanged when no prefix", () => {
    expect(topicFromSession({ reason: "Review past paper" })).toBe(
      "Review past paper",
    );
  });
});

describe("nextSessionAfter", () => {
  const sessions = [
    {
      session_id: "a",
      start_time: "16:00",
      backlog_item_id: "item-1",
      end_time: "17:00",
      reason: "Work on Physics",
      remaining_minutes: 60,
    },
    {
      session_id: "b",
      start_time: "17:00",
      backlog_item_id: "item-2",
      end_time: "18:00",
      reason: "Work on Chemistry",
      remaining_minutes: 60,
    },
    {
      session_id: "c",
      start_time: "15:00",
      backlog_item_id: "item-3",
      end_time: "16:00",
      reason: "Work on Math",
      remaining_minutes: 60,
    },
  ];

  it("returns next session after the completed one by start_time", () => {
    // Completing "a" (16:00) → next is "b" (17:00), c (15:00) is earlier so excluded
    const next = nextSessionAfter(sessions, "a", "16:00");
    expect(next?.session_id).toBe("b");
  });

  it("returns null when completing the last session", () => {
    // Completing "b" (17:00) → no sessions after 17:00
    const next = nextSessionAfter(sessions, "b", "17:00");
    expect(next).toBeNull();
  });

  it("returns null for empty sessions array", () => {
    expect(nextSessionAfter([], "a", "16:00")).toBeNull();
  });

  it("excludes the completed session and earlier sessions", () => {
    // Completing "c" (15:00) → next is "a" (16:00)
    const next = nextSessionAfter(sessions, "c", "15:00");
    expect(next?.session_id).toBe("a");
  });
});
