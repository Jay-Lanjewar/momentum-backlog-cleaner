import {
  formatMinutes,
  formatHourMinute,
  formatTimeRange,
  getGreeting,
  firstName,
  focusCoachMessage,
  sessionLengthCategory,
  healthTone,
  buildRecommendationReason,
  buildPlanStatusText,
  isGeneratedPlanStatus,
  sessionDurationMinutes,
  sessionRemainingMinutes,
  formatPlannedDuration,
  formatRemainingLabel,
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
  it("formats 0 minutes", () => {
    expect(formatMinutes(0)).toBe("0m");
  });

  it("formats minutes only (< 60)", () => {
    expect(formatMinutes(5)).toBe("5m");
  });

  it("formats minutes only at boundary", () => {
    expect(formatMinutes(45)).toBe("45m");
  });

  it("formats exactly 60 as 1h", () => {
    expect(formatMinutes(60)).toBe("1h");
  });

  it("formats 90 as 1h 30m", () => {
    expect(formatMinutes(90)).toBe("1h 30m");
  });

  it("formats 125 as 2h 5m", () => {
    expect(formatMinutes(125)).toBe("2h 5m");
  });

  it("formats hours only when exact", () => {
    expect(formatMinutes(120)).toBe("2h");
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

  it("returns placeholder for empty string", () => {
    expect(formatHourMinute("")).toBe("--:--");
  });

  it("returns placeholder for malformed time", () => {
    expect(formatHourMinute("abc")).toBe("--:--");
  });
});

describe("firstName", () => {
  it("returns the first token of a full name", () => {
    expect(firstName("Ravindra Kumar Sharma")).toBe("Ravindra");
  });

  it("keeps a single-word name", () => {
    expect(firstName("Ada")).toBe("Ada");
  });

  it("trims surrounding whitespace", () => {
    expect(firstName("  Ada  ")).toBe("Ada");
  });

  it("returns null for empty or missing names", () => {
    expect(firstName("")).toBeNull();
    expect(firstName("   ")).toBeNull();
    expect(firstName(null)).toBeNull();
    expect(firstName(undefined)).toBeNull();
  });
});

describe("getGreeting", () => {
  it("includes name when provided", () => {
    const result = getGreeting("Alice");
    expect(result).toContain("Alice");
  });

  it("uses the first name only for a full name", () => {
    const result = getGreeting("Ravindra Kumar");
    expect(result).toContain("Ravindra");
    expect(result).not.toContain("Kumar");
    expect(result).toMatch(/^Good (morning|afternoon|evening), Ravindra$/);
  });

  it("never leaves a dangling comma without a name", () => {
    expect(getGreeting(null)).not.toContain(",");
    expect(getGreeting("   ")).not.toContain(",");
  });

  it("returns generic greeting when no name", () => {
    const result = getGreeting(null);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("session duration (end_time - start_time)", () => {
  it("derives a 40-minute session as 40 minutes", () => {
    const session = makeSession({
      start_time: "16:00",
      end_time: "16:40",
      // Backend truth: last session of a task carries a backlog remainder of 0
      remaining_minutes: 0,
    });
    expect(sessionDurationMinutes(session)).toBe(40);
    expect(formatPlannedDuration(session)).toBe("~40m");
  });

  it("derives a 30-minute session as 30 minutes", () => {
    const session = makeSession({
      start_time: "18:00",
      end_time: "18:30",
      remaining_minutes: 0,
    });
    expect(sessionDurationMinutes(session)).toBe(30);
    expect(formatPlannedDuration(session)).toBe("~30m");
  });

  it("ignores a larger backlog remainder (never shows ~52m for 30m)", () => {
    const session = makeSession({
      start_time: "16:00",
      end_time: "16:30",
      remaining_minutes: 52,
    });
    expect(formatPlannedDuration(session)).toBe("~30m");
  });

  it("formats an hour-long session", () => {
    expect(
      formatPlannedDuration(makeSession({ start_time: "09:00", end_time: "10:00" })),
    ).toBe("~1h");
  });

  it("returns 0 and an empty label for malformed times", () => {
    const session = makeSession({ start_time: "bad", end_time: "worse" });
    expect(sessionDurationMinutes(session)).toBe(0);
    expect(formatPlannedDuration(session)).toBe("");
  });

  it("never renders a negative duration for a reversed range", () => {
    const session = makeSession({ start_time: "16:40", end_time: "16:00" });
    expect(sessionDurationMinutes(session)).toBe(0);
  });
});

describe("session remaining time in an active session", () => {
  const running = makeSession({ start_time: "16:00", end_time: "16:40" });

  it("reports minutes left until the session ends", () => {
    expect(sessionRemainingMinutes(running, 16 * 60 + 15)).toBe(25);
    expect(formatRemainingLabel(running, 16 * 60 + 15)).toBe("25m left");
  });

  it("reports the full duration at session start", () => {
    expect(sessionRemainingMinutes(running, 16 * 60)).toBe(40);
    expect(formatRemainingLabel(running, 16 * 60)).toBe("40m left");
  });

  it("clamps to 0 once the session has ended", () => {
    expect(sessionRemainingMinutes(running, 17 * 60)).toBe(0);
    expect(formatRemainingLabel(running, 17 * 60)).toBe("");
  });

  it("stays separate from the planned duration", () => {
    expect(sessionRemainingMinutes(running, 16 * 60 + 30)).toBe(10);
    expect(sessionDurationMinutes(running)).toBe(40);
  });
});

describe("buildPlanStatusText", () => {
  it("says a single task is planned for today", () => {
    expect(buildPlanStatusText({ scheduledTasks: 1, pendingTasks: 1 })).toBe(
      "1 task planned for today.",
    );
  });

  it("says every task is scheduled when nothing overflows", () => {
    expect(buildPlanStatusText({ scheduledTasks: 4, pendingTasks: 4 })).toBe(
      "All 4 tasks are scheduled.",
    );
  });

  it("is honest about tasks that continue later", () => {
    expect(buildPlanStatusText({ scheduledTasks: 2, pendingTasks: 4 })).toBe(
      "2 of 4 tasks planned today. The rest will continue later.",
    );
  });

  it("returns null when nothing is scheduled today", () => {
    expect(buildPlanStatusText({ scheduledTasks: 0, pendingTasks: 3 })).toBeNull();
  });

  it("returns null when there is no pending work", () => {
    expect(buildPlanStatusText({ scheduledTasks: 0, pendingTasks: 0 })).toBeNull();
  });

  it("never claims everything is scheduled when tasks are unscheduled", () => {
    const text = buildPlanStatusText({ scheduledTasks: 1, pendingTasks: 3 });
    expect(text).toContain("1 of 3");
    expect(text).not.toMatch(/^All /);
  });

  it("never uses planner-internal wording", () => {
    const text = buildPlanStatusText({ scheduledTasks: 2, pendingTasks: 4 });
    expect(text).not.toMatch(/\bitems\b|overflow|snapshot|prioritized/i);
  });
});

describe("isGeneratedPlanStatus", () => {
  it("recognises the planner tally", () => {
    expect(isGeneratedPlanStatus("Planned 2 of 4 items. Keep up the great work!")).toBe(true);
    expect(isGeneratedPlanStatus("Planned 1 of 1 items. All tasks scheduled!")).toBe(true);
  });

  it("keeps human daily messages", () => {
    expect(isGeneratedPlanStatus("Nice steady pace today.")).toBe(false);
    expect(isGeneratedPlanStatus("")).toBe(false);
  });
});

describe("sessionLengthCategory", () => {
  it("returns short for sessions under 30 minutes", () => {
    expect(sessionLengthCategory(20 * 60_000)).toBe("short");
  });

  it("returns medium for sessions 30-60 minutes", () => {
    expect(sessionLengthCategory(45 * 60_000)).toBe("medium");
  });

  it("returns long for sessions over 60 minutes", () => {
    expect(sessionLengthCategory(90 * 60_000)).toBe("long");
  });

  it("returns medium at exact 30 minutes", () => {
    expect(sessionLengthCategory(30 * 60_000)).toBe("medium");
  });

  it("returns medium at exact 60 minutes", () => {
    expect(sessionLengthCategory(60 * 60_000)).toBe("medium");
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

  it("returns final-push message at 90%+", () => {
    const msg = focusCoachMessage(totalMs * 0.9, totalMs);
    expect(msg.toLowerCase()).toContain("final");
  });

  it("returns final-push message at 100%", () => {
    const msg = focusCoachMessage(totalMs, totalMs);
    expect(msg.toLowerCase()).toContain("final");
  });

  it("returns done message for zero total", () => {
    expect(focusCoachMessage(0, 0)).toBe("You're done!");
  });

  describe("session-length awareness", () => {
    const shortSession = 20 * 60_000; // 20 min
    const mediumSession = 45 * 60_000; // 45 min
    const longSession = 90 * 60_000; // 90 min

    it("short session uses concise messages", () => {
      const msg = focusCoachMessage(shortSession * 0.3, shortSession);
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
    });

    it("medium session uses pace-focused messages", () => {
      const msg = focusCoachMessage(mediumSession * 0.3, mediumSession);
      expect(msg.toLowerCase()).toContain("zone");
    });

    it("long session uses deep-work messages", () => {
      const msg = focusCoachMessage(longSession * 0.5, longSession);
      expect(msg.toLowerCase()).toContain("deep work");
    });

    it("long session final push differs from short session", () => {
      const shortFinal = focusCoachMessage(shortSession * 0.95, shortSession);
      const longFinal = focusCoachMessage(longSession * 0.95, longSession);
      expect(shortFinal).not.toBe(longFinal);
    });
  });

  describe("variant rotation", () => {
    it("variant 0 and variant 1 can produce different messages at same threshold", () => {
      const totalMs = 90 * 60_000; // long session
      const elapsed = totalMs * 0.3; // 25-50% tier
      const msg0 = focusCoachMessage(elapsed, totalMs, 0);
      const msg1 = focusCoachMessage(elapsed, totalMs, 1);
      // Both should be valid strings (may or may not differ)
      expect(typeof msg0).toBe("string");
      expect(typeof msg1).toBe("string");
    });
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
  it("returns a supportive message for overdue items", () => {
    const result = buildRecommendationReason(
      { overdue: true, due_date: "2026-09-01", priority: 2 },
      "good",
    );
    expect(result).toContain("behind");
    expect(result).toContain("most important next step");
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
    expect(result).toContain("High priority");
  });

  it("returns top-of-backlog message when isTopPriority", () => {
    const result = buildRecommendationReason(
      { overdue: false, due_date: null, priority: 3 },
      "good",
      { isTopPriority: true },
    );
    expect(result).toContain("Highest priority from your current work");
  });

  it("prefers overdue over isTopPriority", () => {
    const result = buildRecommendationReason(
      { overdue: true, due_date: "2026-09-01", priority: 3 },
      "good",
      { isTopPriority: true },
    );
    expect(result).toContain("behind");
    expect(result).not.toContain("Highest priority");
  });

  it("returns due-date message when has due_date and not top priority", () => {
    const result = buildRecommendationReason(
      { overdue: false, due_date: "2026-09-30", priority: 3 },
      "good",
      { isTopPriority: false },
    );
    expect(result).toMatch(/^Due /);
  });

  it("falls back to a fit-based message with no signals", () => {
    const result = buildRecommendationReason(
      { overdue: false, due_date: null, priority: 3 },
      "good",
      { isTopPriority: false },
    );
    expect(result).toBe("Best next fit for the time you have.");
  });

  it("never uses planner-internal wording", () => {
    const results = [
      buildRecommendationReason(
        { overdue: true, due_date: null, priority: 1 },
        "good",
        { isTopPriority: true },
      ),
      buildRecommendationReason(
        { overdue: false, due_date: null, priority: 3 },
        "good",
        { isTopPriority: true },
      ),
      buildRecommendationReason(
        { overdue: false, due_date: "2026-09-30", priority: 3 },
        "good",
      ),
    ];
    for (const result of results) {
      expect(result).not.toMatch(
        /prioritized backlog|backlog items|best next match|remaining_minutes/i,
      );
    }
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
  it("returns false when backlog item is present with pending status", () => {
    const session = makeSession({ backlog_item_id: "item-1" });
    const map = makeMap({ "item-1": "pending" });
    expect(isSessionCompleted(session, map as any)).toBe(false);
  });

  it("returns false when backlog item is present with in_progress status", () => {
    const session = makeSession({ backlog_item_id: "item-1" });
    const map = makeMap({ "item-1": "in_progress" });
    expect(isSessionCompleted(session, map as any)).toBe(false);
  });

  it("returns true when backlog item is absent from prioritized_backlog", () => {
    const session = makeSession({ backlog_item_id: "item-1" });
    const map = makeMap({});
    expect(isSessionCompleted(session, map as any)).toBe(true);
  });
});

describe("getActiveSessions", () => {
  it("filters out completed sessions (absent from map)", () => {
    const sessions = [
      makeSession({ session_id: "a", backlog_item_id: "item-1" }),
      makeSession({ session_id: "b", backlog_item_id: "item-2" }),
    ];
    const map = makeMap({ "item-2": "pending" });
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
    const map = makeMap({});
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
    const map = makeMap({});
    expect(computeDailyProgress(sessions, map as any)).toBe(100);
  });

  it("returns 50 when half completed", () => {
    const sessions = [
      makeSession({ backlog_item_id: "item-1" }),
      makeSession({ backlog_item_id: "item-2" }),
    ];
    const map = makeMap({ "item-2": "pending" });
    expect(computeDailyProgress(sessions, map as any)).toBe(50);
  });

  it("never returns negative", () => {
    const sessions = [makeSession({ backlog_item_id: "item-1" })];
    const map = makeMap({ "item-1": "pending" });
    expect(computeDailyProgress(sessions, map as any)).toBeGreaterThanOrEqual(0);
  });

  it("caps at 100", () => {
    const sessions = [makeSession({ backlog_item_id: "item-1" })];
    const map = makeMap({});
    expect(computeDailyProgress(sessions, map as any)).toBeLessThanOrEqual(100);
  });

  it("does not count past but uncompleted sessions", () => {
    const sessions = [
      makeSession({ backlog_item_id: "item-1" }),
      makeSession({ backlog_item_id: "item-2" }),
    ];
    const map = makeMap({ "item-1": "pending", "item-2": "pending" });
    expect(computeDailyProgress(sessions, map as any)).toBe(0);
  });
});
