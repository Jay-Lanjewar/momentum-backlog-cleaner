import {
  difficultyFromPriority,
  priorityFromDifficulty,
  dueDateForChip,
  chipForDate,
  formatDueDate,
  isOverdue,
  courseMapFromList,
  courseNameForItem,
  courseColorForItem,
} from "../lib/coaching";
import type { Course } from "../services/types";

// ─── Difficulty mapping ───

describe("difficultyFromPriority", () => {
  it("maps priority 1 to hard", () => {
    expect(difficultyFromPriority(1)).toBe("hard");
  });

  it("maps priority 2 to hard", () => {
    expect(difficultyFromPriority(2)).toBe("hard");
  });

  it("maps priority 3 to medium", () => {
    expect(difficultyFromPriority(3)).toBe("medium");
  });

  it("maps priority 4 to easy", () => {
    expect(difficultyFromPriority(4)).toBe("easy");
  });

  it("maps null to medium", () => {
    expect(difficultyFromPriority(null)).toBe("medium");
  });

  it("maps undefined to medium", () => {
    expect(difficultyFromPriority(undefined)).toBe("medium");
  });
});

describe("priorityFromDifficulty", () => {
  it("maps hard to 1", () => {
    expect(priorityFromDifficulty("hard")).toBe(1);
  });

  it("maps medium to 3", () => {
    expect(priorityFromDifficulty("medium")).toBe(3);
  });

  it("maps easy to 4", () => {
    expect(priorityFromDifficulty("easy")).toBe(4);
  });
});

// ─── Due date chips ───

describe("dueDateForChip", () => {
  it("returns today's date key for today chip", () => {
    const now = new Date(2026, 8, 15, 10, 0, 0);
    const result = dueDateForChip("today", now);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).toBe("2026-09-15");
  });

  it("returns tomorrow's date key for tomorrow chip", () => {
    const now = new Date(2026, 8, 15, 10, 0, 0);
    const result = dueDateForChip("tomorrow", now);
    expect(result).toBe("2026-09-16");
  });

  it("returns end of week for week chip", () => {
    const now = new Date(2026, 8, 15, 10, 0, 0); // Tuesday
    const result = dueDateForChip("week", now);
    // Sunday of that week
    expect(result).toBe("2026-09-20");
  });
});

describe("chipForDate", () => {
  it("returns null for null input", () => {
    expect(chipForDate(null)).toBeNull();
  });

  it("returns today for today's date", () => {
    const now = new Date();
    expect(chipForDate(now.toISOString(), now)).toBe("today");
  });

  it("returns tomorrow for tomorrow's date", () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    expect(chipForDate(tomorrow.toISOString(), now)).toBe("tomorrow");
  });

  it("returns week for a date within the current week but not today/tomorrow", () => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const daysToSunday = (7 - dayOfWeek) % 7;
    if (daysToSunday >= 2) {
      const later = new Date(now);
      later.setDate(now.getDate() + 2);
      const key = `${later.getFullYear()}-${String(later.getMonth() + 1).padStart(2, "0")}-${String(later.getDate()).padStart(2, "0")}`;
      expect(chipForDate(key + "T12:00:00.000Z", now)).toBe("week");
    }
  });

  it("returns custom for a far-future date", () => {
    const now = new Date();
    const far = new Date(now);
    far.setDate(now.getDate() + 60);
    expect(chipForDate(far.toISOString(), now)).toBe("custom");
  });
});

describe("formatDueDate", () => {
  it("returns empty string for null", () => {
    expect(formatDueDate(null)).toBe("");
  });

  it("returns Today for today's date", () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    expect(formatDueDate(today.toISOString())).toBe("Today");
  });

  it("returns formatted date for custom dates", () => {
    expect(formatDueDate("2026-12-25T00:00:00.000Z")).toBe("Dec 25");
  });
});

// ─── Overdue ───

describe("isOverdue", () => {
  it("returns false for null", () => {
    expect(isOverdue(null)).toBe(false);
  });

  it("returns true for past dates", () => {
    const past = new Date();
    past.setDate(past.getDate() - 7);
    expect(isOverdue(past.toISOString())).toBe(true);
  });

  it("returns false for future dates", () => {
    const future = new Date();
    future.setDate(future.getDate() + 7);
    expect(isOverdue(future.toISOString())).toBe(false);
  });
});

// ─── Course helpers ───

function makeCourse(overrides: Partial<Course> & { id: string }): Course {
  return {
    user_id: "u1",
    name: "Physics",
    color: "#6366f1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("courseMapFromList", () => {
  it("creates a map from course list", () => {
    const courses = [
      makeCourse({ id: "c1", name: "Physics" }),
      makeCourse({ id: "c2", name: "Maths", color: "#EF4444" }),
    ];
    const map = courseMapFromList(courses);
    expect(map.size).toBe(2);
    expect(map.get("c1")?.name).toBe("Physics");
    expect(map.get("c2")?.color).toBe("#EF4444");
  });

  it("returns empty map for empty array", () => {
    expect(courseMapFromList([]).size).toBe(0);
  });
});

describe("courseNameForItem", () => {
  it("returns course name from map", () => {
    const map = courseMapFromList([makeCourse({ id: "c1", name: "Physics" })]);
    expect(courseNameForItem("c1", map)).toBe("Physics");
  });

  it("returns Unknown for missing course", () => {
    const map = new Map();
    expect(courseNameForItem("missing", map)).toBe("Unknown");
  });
});

describe("courseColorForItem", () => {
  it("returns course color from map", () => {
    const map = courseMapFromList([makeCourse({ id: "c1", color: "#EF4444" })]);
    expect(courseColorForItem("c1", map)).toBe("#EF4444");
  });

  it("returns default gray for missing course", () => {
    const map = new Map();
    expect(courseColorForItem("missing", map)).toBe("#6b7280");
  });
});

// ─── Filter logic ───

describe("backlog tab filtering", () => {
  const items = [
    { status: "pending" },
    { status: "in_progress" },
    { status: "completed" },
    { status: "pending" },
  ];

  it("all tab returns everything", () => {
    expect(items).toHaveLength(4);
  });

  it("upcoming tab returns non-completed", () => {
    const upcoming = items.filter((i) => i.status !== "completed");
    expect(upcoming).toHaveLength(3);
  });

  it("completed tab returns only completed", () => {
    const completed = items.filter((i) => i.status === "completed");
    expect(completed).toHaveLength(1);
  });
});

// ─── File structure ───

import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(__dirname, "..");

function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(SRC, relativePath));
}

describe("backlog file structure", () => {
  it("has backlog list screen", () => {
    expect(fileExists("app/(app)/(work)/index.tsx")).toBe(true);
  });

  it("has backlog edit screen", () => {
    expect(fileExists("app/(app)/(work)/[id].tsx")).toBe(true);
  });

  it("has BacklogForm component", () => {
    expect(fileExists("components/BacklogForm.tsx")).toBe(true);
  });

  it("has backlog types in types.ts", () => {
    const content = fs.readFileSync(
      path.join(SRC, "services/types.ts"),
      "utf-8",
    );
    expect(content).toContain("BacklogItem");
    expect(content).toContain("BacklogItemCreatePayload");
    expect(content).toContain("BacklogItemUpdatePayload");
    expect(content).toContain("interface Course");
  });

  it("has backlog hooks in hooks.ts", () => {
    const content = fs.readFileSync(
      path.join(SRC, "services/hooks.ts"),
      "utf-8",
    );
    expect(content).toContain("useBacklogItems");
    expect(content).toContain("useBacklogItem");
    expect(content).toContain("useCreateBacklogItem");
    expect(content).toContain("useUpdateBacklogItem");
    expect(content).toContain("useDeleteBacklogItem");
    expect(content).toContain("useCourses");
  });

  it("has difficulty mapping in coaching.ts", () => {
    const content = fs.readFileSync(
      path.join(SRC, "lib/coaching.ts"),
      "utf-8",
    );
    expect(content).toContain("difficultyFromPriority");
    expect(content).toContain("priorityFromDifficulty");
    expect(content).toContain("DIFFICULTIES");
  });

  it("has due chip functions in coaching.ts", () => {
    const content = fs.readFileSync(
      path.join(SRC, "lib/coaching.ts"),
      "utf-8",
    );
    expect(content).toContain("dueDateForChip");
    expect(content).toContain("chipForDate");
    expect(content).toContain("formatDueDate");
    expect(content).toContain("isOverdue");
  });

  it("has course helpers in coaching.ts", () => {
    const content = fs.readFileSync(
      path.join(SRC, "lib/coaching.ts"),
      "utf-8",
    );
    expect(content).toContain("courseMapFromList");
    expect(content).toContain("courseNameForItem");
    expect(content).toContain("courseColorForItem");
  });
});

// ─── API contract verification ───

describe("backlog API contract", () => {
  it("hooks.ts uses correct backlog endpoints", () => {
    const content = fs.readFileSync(
      path.join(SRC, "services/hooks.ts"),
      "utf-8",
    );
    expect(content).toContain("/api/v1/backlog");
    expect(content).toContain("/api/v1/courses");
  });

  it("backlog hooks invalidate both backlog and dashboard", () => {
    const content = fs.readFileSync(
      path.join(SRC, "services/hooks.ts"),
      "utf-8",
    );
    const backlogInvalidations = (
      content.match(/invalidateQueries.*backlog/g) ?? []
    ).length;
    const dashboardInvalidations = (
      content.match(/invalidateQueries.*dashboard/g) ?? []
    ).length;
    expect(backlogInvalidations).toBeGreaterThanOrEqual(3);
    expect(dashboardInvalidations).toBeGreaterThanOrEqual(3);
  });
});

// ─── BacklogItem type shape ───

describe("BacklogItem type", () => {
  it("types.ts defines BacklogItem with all required fields", () => {
    const content = fs.readFileSync(
      path.join(SRC, "services/types.ts"),
      "utf-8",
    );
    const fields = [
      "id: string",
      "user_id: string",
      "course_id: string",
      "title: string",
      "description: string | null",
      "priority: number",
      "estimated_minutes: number | null",
      "due_date: string | null",
      "status: string",
      "created_at: string",
      "updated_at: string",
    ];
    for (const field of fields) {
      expect(content).toContain(field);
    }
  });

  it("types.ts defines Course with all required fields", () => {
    const content = fs.readFileSync(
      path.join(SRC, "services/types.ts"),
      "utf-8",
    );
    const fields = [
      "interface Course",
      "id: string",
      "name: string",
      "color: string",
    ];
    for (const field of fields) {
      expect(content).toContain(field);
    }
  });
});
