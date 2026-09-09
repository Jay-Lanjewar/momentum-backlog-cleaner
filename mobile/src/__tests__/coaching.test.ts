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
  parseTimeToMinutes,
  isSessionCompleted,
  getActiveSessions,
  getCurrentSession,
  getNextSession,
  getUpcomingSessions,
  computeDailyProgress,
} from "../lib/coaching";
import type { PlanSession } from "../services/types";

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

// ─── Session classification helpers ───

function makeSession(overrides: Partial<PlanSession>): PlanSession {
  return {
    backlog_item_id: "item-1",
    session_id: "session-1",
    start_time: "10:00",
    end_time: "11:00",
    reason: "Work on Physics",
    remaining_minutes: 60,
    ...overrides,
  };
}

function makeMap(
  entries: Record<string, string>,
): Map<string, { id: string; status: string }> {
  const map = new Map<string, { id: string; status: string }>();
  for (const [id, status] of Object.entries(entries)) {
    map.set(id, { id, status });
  }
  return map;
}

describe("parseTimeToMinutes", () => {
  it("parses midnight", () => {
    expect(parseTimeToMinutes("00:00")).toBe(0);
  });

  it("parses morning time", () => {
    expect(parseTimeToMinutes("09:30")).toBe(570);
  });

  it("parses evening time", () => {
    expect(parseTimeToMinutes("17:15")).toBe(1035);
  });

  it("parses end of day", () => {
    expect(parseTimeToMinutes("23:59")).toBe(1439);
  });
});

describe("isSessionCompleted", () => {
  it("returns true when backlog item is completed", () => {
    const session = makeSession({ backlog_item_id: "item-1" });
    const map = makeMap({ "item-1": "completed" });
    expect(isSessionCompleted(session, map as any)).toBe(true);
  });

  it("returns false when backlog item is pending", () => {
    const session = makeSession({ backlog_item_id: "item-1" });
    const map = makeMap({ "item-1": "pending" });
    expect(isSessionCompleted(session, map as any)).toBe(false);
  });

  it("returns false when backlog item not in map", () => {
    const session = makeSession({ backlog_item_id: "item-1" });
    const map = makeMap({});
    expect(isSessionCompleted(session, map as any)).toBe(false);
  });
});

describe("getActiveSessions", () => {
  it("filters out completed sessions", () => {
    const sessions = [
      makeSession({ session_id: "a", backlog_item_id: "item-1" }),
      makeSession({ session_id: "b", backlog_item_id: "item-2" }),
    ];
    const map = makeMap({ "item-1": "completed", "item-2": "pending" });
    const active = getActiveSessions(sessions, map as any);
    expect(active).toHaveLength(1);
    expect(active[0].session_id).toBe("b");
  });

  it("returns all sessions when none completed", () => {
    const sessions = [
      makeSession({ session_id: "a", backlog_item_id: "item-1" }),
      makeSession({ session_id: "b", backlog_item_id: "item-2" }),
    ];
    const map = makeMap({ "item-1": "pending", "item-2": "pending" });
    expect(getActiveSessions(sessions, map as any)).toHaveLength(2);
  });

  it("returns empty when all completed", () => {
    const sessions = [
      makeSession({ session_id: "a", backlog_item_id: "item-1" }),
    ];
    const map = makeMap({ "item-1": "completed" });
    expect(getActiveSessions(sessions, map as any)).toHaveLength(0);
  });
});

describe("getCurrentSession", () => {
  const sessions = [
    makeSession({
      session_id: "a",
      start_time: "10:00",
      end_time: "11:00",
    }),
    makeSession({
      session_id: "b",
      start_time: "14:00",
      end_time: "15:00",
    }),
  ];

  it("returns current session when within its time window", () => {
    expect(getCurrentSession(sessions, 630)?.session_id).toBe("a"); // 10:30
  });

  it("returns null when no session is in progress", () => {
    expect(getCurrentSession(sessions, 1140)).toBeNull(); // 19:00
  });

  it("returns null at exact start time", () => {
    expect(getCurrentSession(sessions, 600)?.session_id).toBe("a"); // 10:00
  });

  it("returns null at exact end time", () => {
    expect(getCurrentSession(sessions, 660)).toBeNull(); // 11:00
  });
});

describe("getNextSession", () => {
  const sessions = [
    makeSession({
      session_id: "a",
      start_time: "10:00",
      end_time: "11:00",
    }),
    makeSession({
      session_id: "b",
      start_time: "14:00",
      end_time: "15:00",
    }),
  ];

  it("returns next future session", () => {
    expect(getNextSession(sessions, 599)?.session_id).toBe("a"); // 09:59
  });

  it("returns later session when earlier is in progress", () => {
    expect(getNextSession(sessions, 630)?.session_id).toBe("b"); // 10:30
  });

  it("returns null when all sessions are past", () => {
    expect(getNextSession(sessions, 1140)).toBeNull(); // 19:00
  });
});

describe("getUpcomingSessions", () => {
  const sessions = [
    makeSession({
      session_id: "a",
      start_time: "10:00",
      end_time: "11:00",
    }),
    makeSession({
      session_id: "b",
      start_time: "14:00",
      end_time: "15:00",
    }),
    makeSession({
      session_id: "c",
      start_time: "09:00",
      end_time: "10:00",
    }),
  ];

  it("excludes past sessions", () => {
    const upcoming = getUpcomingSessions(sessions, 660); // 11:00
    expect(upcoming.map((s) => s.session_id)).toEqual(["b"]);
  });

  it("includes sessions starting just after nowMin", () => {
    const upcoming = getUpcomingSessions(sessions, 599); // 09:59
    expect(upcoming.map((s) => s.session_id)).toEqual(["a", "b"]);
  });

  it("returns empty when all past", () => {
    expect(getUpcomingSessions(sessions, 1140)).toHaveLength(0); // 19:00
  });

  it("returns sorted by start_time", () => {
    const upcoming = getUpcomingSessions(sessions, 539); // 08:59
    expect(upcoming.map((s) => s.session_id)).toEqual(["c", "a", "b"]);
  });
});

describe("computeDailyProgress", () => {
  it("returns 0 for empty sessions", () => {
    expect(computeDailyProgress([], new Map())).toBe(0);
  });

  it("returns 0 when no sessions completed", () => {
    const sessions = [
      makeSession({ backlog_item_id: "item-1" }),
      makeSession({ backlog_item_id: "item-2" }),
    ];
    const map = makeMap({ "item-1": "pending", "item-2": "pending" });
    expect(computeDailyProgress(sessions, map as any)).toBe(0);
  });

  it("returns 100 when all sessions completed", () => {
    const sessions = [
      makeSession({ backlog_item_id: "item-1" }),
      makeSession({ backlog_item_id: "item-2" }),
    ];
    const map = makeMap({ "item-1": "completed", "item-2": "completed" });
    expect(computeDailyProgress(sessions, map as any)).toBe(100);
  });

  it("returns 50 when half completed", () => {
    const sessions = [
      makeSession({ backlog_item_id: "item-1" }),
      makeSession({ backlog_item_id: "item-2" }),
    ];
    const map = makeMap({ "item-1": "completed", "item-2": "pending" });
    expect(computeDailyProgress(sessions, map as any)).toBe(50);
  });

  it("never returns negative", () => {
    const sessions = [makeSession({ backlog_item_id: "item-1" })];
    const map = makeMap({ "item-1": "pending" });
    expect(computeDailyProgress(sessions, map as any)).toBeGreaterThanOrEqual(0);
  });

  it("caps at 100", () => {
    const sessions = [makeSession({ backlog_item_id: "item-1" })];
    const map = makeMap({ "item-1": "completed" });
    expect(computeDailyProgress(sessions, map as any)).toBeLessThanOrEqual(100);
  });

  it("does not count past but uncompleted sessions", () => {
    const sessions = [
      makeSession({ backlog_item_id: "item-1" }),
      makeSession({ backlog_item_id: "item-2" }),
    ];
    const map = makeMap({ "item-1": "completed", "item-2": "pending" });
    // Only 1 of 2 completed → 50%, not 100%
    expect(computeDailyProgress(sessions, map as any)).toBe(50);
  });
});
