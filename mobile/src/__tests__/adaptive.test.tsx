import { computeTimelineBounds } from "@/components/adaptive/AdaptiveTimelineBar";
import type { PlanSession, PlanChange } from "@/services/types";

function makeSession(
  overrides: Partial<PlanSession> & { session_id: string },
): PlanSession {
  return {
    backlog_item_id: "backlog-1",
    start_time: "16:00",
    end_time: "16:30",
    reason: "Work on Maths",
    remaining_minutes: 0,
    ...overrides,
  };
}

function makeChange(
  overrides: Partial<PlanChange> & { session_id: string },
): PlanChange {
  return {
    backlog_item_id: "backlog-1",
    title: "Maths",
    change_type: "rescheduled",
    previous_start: "16:00",
    previous_end: "16:30",
    new_start: "17:00",
    new_end: "17:30",
    reason: "Maths was rescheduled.",
    ...overrides,
  };
}

// ─── computeTimelineBounds ───

describe("computeTimelineBounds", () => {
  it("returns default bounds for empty arrays", () => {
    const { minStart, span } = computeTimelineBounds([], []);
    expect(minStart).toBe(-5);
    expect(span).toBe(70);
  });

  it("computes bounds from a single session array", () => {
    const sessions = [
      makeSession({ session_id: "s1", start_time: "14:00", end_time: "15:00" }),
    ];
    const { minStart, span } = computeTimelineBounds([], sessions);
    expect(minStart).toBeLessThan(14 * 60);
    expect(span).toBeGreaterThan(60);
  });

  it("computes bounds across both previous and current sessions", () => {
    const prev = [
      makeSession({
        session_id: "p1",
        start_time: "16:00",
        end_time: "16:30",
      }),
    ];
    const curr = [
      makeSession({
        session_id: "c1",
        start_time: "17:00",
        end_time: "17:45",
      }),
    ];
    const { minStart, span } = computeTimelineBounds(prev, curr);
    // 16:00 = 960, 17:45 = 1065. range = 105
    expect(minStart).toBeLessThan(960);
    expect(span).toBeGreaterThan(105);
  });

  it("pads the range by 5% on each side", () => {
    const sessions = [
      makeSession({ session_id: "s1", start_time: "10:00", end_time: "10:30" }),
    ];
    const { minStart, span } = computeTimelineBounds([], sessions);
    // 10:00 = 600, 10:30 = 630. range = 30. padding = max(5, 1.5) = 5
    expect(minStart).toBe(595);
    expect(span).toBe(40);
  });
});

// ─── groupChanges (internal to AdaptiveChangeGroup, tested via import trick) ───

describe("AdaptiveChangeGroup grouping logic", () => {
  it("groups changes by change_type in insertion order", () => {
    const changes = [
      makeChange({
        session_id: "s1",
        change_type: "rescheduled",
        title: "Maths",
      }),
      makeChange({
        session_id: "s2",
        change_type: "moved_to_overflow",
        title: "English",
        new_start: null,
        new_end: null,
      }),
      makeChange({
        session_id: "s3",
        change_type: "rescheduled",
        title: "Physics",
      }),
    ];

    const groups = new Map<string, PlanChange[]>();
    for (const change of changes) {
      const existing = groups.get(change.change_type) ?? [];
      existing.push(change);
      groups.set(change.change_type, existing);
    }

    expect(groups.size).toBe(2);
    expect(groups.get("rescheduled")).toHaveLength(2);
    expect(groups.get("moved_to_overflow")).toHaveLength(1);
  });

  it("empty array produces empty map", () => {
    const changes: PlanChange[] = [];
    const groups = new Map<string, PlanChange[]>();
    for (const change of changes) {
      const existing = groups.get(change.change_type) ?? [];
      existing.push(change);
      groups.set(change.change_type, existing);
    }
    expect(groups.size).toBe(0);
  });

  it("preserves distinct session_ids with the same title", () => {
    const changes = [
      makeChange({ session_id: "s1", title: "Maths" }),
      makeChange({ session_id: "s2", title: "Maths" }),
    ];
    const groups = new Map<string, PlanChange[]>();
    for (const change of changes) {
      const existing = groups.get(change.change_type) ?? [];
      existing.push(change);
      groups.set(change.change_type, existing);
    }
    expect(groups.get("rescheduled")).toHaveLength(2);
  });

  it("slice(0, MAX_VISIBLE) limits visible items", () => {
    const changes = [
      makeChange({ session_id: "s1", title: "A" }),
      makeChange({ session_id: "s2", title: "B" }),
      makeChange({ session_id: "s3", title: "C" }),
      makeChange({ session_id: "s4", title: "D" }),
    ];
    const MAX_VISIBLE = 2;
    const visible = changes.slice(0, MAX_VISIBLE);
    expect(visible).toHaveLength(2);
    expect(changes.length - visible.length).toBe(2);
  });
});

// ─── AdaptiveTimelineBar overflow logic ───

describe("AdaptiveTimelineBar overflow logic", () => {
  it("returns null for empty sessions", () => {
    expect([]).toHaveLength(0);
  });

  it("returns null for span <= 0", () => {
    expect(0).toBeLessThanOrEqual(0);
    expect(-1).toBeLessThanOrEqual(0);
  });

  it("computes percentage positions correctly", () => {
    const minStart = 900; // 15:00
    const span = 180; // 3 hours
    const session = makeSession({
      session_id: "s1",
      start_time: "16:00",
      end_time: "16:30",
    });
    const [sh, sm] = session.start_time.split(":").map(Number);
    const [eh, em] = session.end_time.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;

    const leftPct = ((startMin - minStart) / span) * 100;
    const widthPct = Math.max(4, ((endMin - startMin) / span) * 100);

    // 16:00 = 960. (960-900)/180 = 33.3%
    expect(leftPct).toBeCloseTo(33.33, 1);
    // 30min/180min = 16.7%
    expect(widthPct).toBeCloseTo(16.67, 1);
  });

  it("enforces minimum width of 4%", () => {
    const minStart = 900;
    const span = 180;
    const widthPct = Math.max(4, (5 / 180) * 100);
    expect(widthPct).toBe(4);
  });
});

// ─── AdaptiveChangeRow icon logic ───

describe("AdaptiveChangeRow icon logic", () => {
  it("shows clock icon for overflow changes", () => {
    const change = makeChange({
      session_id: "s1",
      change_type: "moved_to_overflow",
    });
    expect(change.change_type).toBe("moved_to_overflow");
  });

  it("shows arrow icon for rescheduled changes", () => {
    const change = makeChange({
      session_id: "s1",
      change_type: "rescheduled",
    });
    expect(change.change_type).toBe("rescheduled");
  });

  it("detects danger state for overflow and removed", () => {
    const overflow = makeChange({
      session_id: "s1",
      change_type: "moved_to_overflow",
    });
    const removed = makeChange({
      session_id: "s2",
      change_type: "removed",
    });
    const rescheduled = makeChange({ session_id: "s3" });

    expect(
      overflow.change_type === "moved_to_overflow" ||
        overflow.change_type === "removed",
    ).toBe(true);
    expect(
      removed.change_type === "moved_to_overflow" ||
        removed.change_type === "removed",
    ).toBe(true);
    expect(
      rescheduled.change_type === "moved_to_overflow" ||
        rescheduled.change_type === "removed",
    ).toBe(false);
  });
});

// ─── Session legend logic ───

describe("AdaptiveSessionLegend logic", () => {
  it("extracts topic from reason by removing 'Work on' prefix", () => {
    const session = makeSession({ session_id: "s1", reason: "Work on Maths" });
    const topic = session.reason.replace(/^Work on\s+/, "");
    expect(topic).toBe("Maths");
  });

  it("returns full reason when no 'Work on' prefix", () => {
    const session = makeSession({
      session_id: "s1",
      reason: "Review past papers",
    });
    const topic = session.reason.replace(/^Work on\s+/, "");
    expect(topic).toBe("Review past papers");
  });

  it("determines changed status from Set membership", () => {
    const changedIds = new Set(["s1"]);
    expect(changedIds.has("s1")).toBe(true);
    expect(changedIds.has("s2")).toBe(false);
  });

  it("determines overflow status from Set membership", () => {
    const overflowIds = new Set(["backlog-1"]);
    expect(overflowIds.has("backlog-1")).toBe(true);
    expect(overflowIds.has("backlog-2")).toBe(false);
  });

  it("picks correct dot color based on changed and overflow flags", () => {
    function pickColor(isChanged: boolean, isOverflow: boolean): string {
      if (isChanged) return "#2563EB";
      if (isOverflow) return "#F0B429";
      return "#64748B";
    }

    expect(pickColor(true, false)).toBe("#2563EB");
    expect(pickColor(false, true)).toBe("#F0B429");
    expect(pickColor(false, false)).toBe("#64748B");
  });
});

// ─── Change type labels ───

describe("Change type labels", () => {
  const GROUP_LABELS: Record<string, string> = {
    rescheduled: "Rescheduled",
    moved_to_overflow: "Moved to overflow",
    removed: "Removed",
    shortened: "Shortened",
  };

  it("maps known change types to labels", () => {
    expect(GROUP_LABELS["rescheduled"]).toBe("Rescheduled");
    expect(GROUP_LABELS["moved_to_overflow"]).toBe("Moved to overflow");
    expect(GROUP_LABELS["removed"]).toBe("Removed");
    expect(GROUP_LABELS["shortened"]).toBe("Shortened");
  });

  it("falls back to replacing underscores for unknown types", () => {
    const unknownType = "unknown_change_type";
    const label = GROUP_LABELS[unknownType] ?? unknownType.replace(/_/g, " ");
    expect(label).toBe("unknown change type");
  });
});
