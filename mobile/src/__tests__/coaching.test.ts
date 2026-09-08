import {
  formatMinutes,
  formatHourMinute,
  getGreeting,
  focusCoachMessage,
  healthTone,
  buildRecommendationReason,
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
