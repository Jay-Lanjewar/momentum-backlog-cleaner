/**
 * Schedule feature tests.
 * Verifies types, utility functions, hooks, and file structure.
 */

import * as fs from "fs";
import * as path from "path";

import {
  BLOCK_TYPES,
  BLOCK_TYPE_MAP,
  DAYS,
  DAY_LABELS,
  DAY_FULL_LABELS,
  getCurrentDayName,
  formatTime12h,
  isValidTimeRange,
  hasOverlap,
} from "../lib/schedule";

const SRC = path.resolve(__dirname, "..");

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(SRC, relativePath), "utf8");
}

// ─── Block Types ───

describe("BLOCK_TYPES", () => {
  it("has exactly 17 block types", () => {
    expect(BLOCK_TYPES).toHaveLength(17);
  });

  it("includes all required types", () => {
    const values = BLOCK_TYPES.map((bt) => bt.value);
    expect(values).toContain("school");
    expect(values).toContain("coaching");
    expect(values).toContain("homework");
    expect(values).toContain("self_study");
    expect(values).toContain("project");
    expect(values).toContain("robotics");
    expect(values).toContain("competition");
    expect(values).toContain("exercise");
    expect(values).toContain("sports");
    expect(values).toContain("music");
    expect(values).toContain("art");
    expect(values).toContain("reading");
    expect(values).toContain("travel");
    expect(values).toContain("meal");
    expect(values).toContain("break");
    expect(values).toContain("sleep");
    expect(values).toContain("custom");
  });

  it("each block type has a label", () => {
    for (const bt of BLOCK_TYPES) {
      expect(bt.label).toBeTruthy();
      expect(typeof bt.label).toBe("string");
    }
  });

  it("each block type has a hex color", () => {
    for (const bt of BLOCK_TYPES) {
      expect(bt.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("BLOCK_TYPE_MAP", () => {
  it("maps each block type value to its info", () => {
    expect(BLOCK_TYPE_MAP.size).toBe(17);
    expect(BLOCK_TYPE_MAP.get("school")?.label).toBe("School");
    expect(BLOCK_TYPE_MAP.get("sleep")?.label).toBe("Sleep");
    expect(BLOCK_TYPE_MAP.get("custom")?.label).toBe("Custom");
  });
});

// ─── Days ───

describe("DAYS", () => {
  it("has 7 days in order", () => {
    expect(DAYS).toHaveLength(7);
    expect(DAYS[0]).toBe("monday");
    expect(DAYS[6]).toBe("sunday");
  });
});

describe("DAY_LABELS", () => {
  it("has short labels for all days", () => {
    expect(DAY_LABELS.monday).toBe("Mon");
    expect(DAY_LABELS.sunday).toBe("Sun");
  });
});

describe("DAY_FULL_LABELS", () => {
  it("has full labels for all days", () => {
    expect(DAY_FULL_LABELS.monday).toBe("Monday");
    expect(DAY_FULL_LABELS.sunday).toBe("Sunday");
  });
});

describe("getCurrentDayName", () => {
  it("returns a valid day name", () => {
    const day = getCurrentDayName();
    expect(DAYS).toContain(day);
  });
});

// ─── Time Formatting ───

describe("formatTime12h", () => {
  it("formats midnight", () => {
    expect(formatTime12h("00:00")).toBe("12 AM");
  });

  it("formats morning time without minutes", () => {
    expect(formatTime12h("09:00")).toBe("9 AM");
  });

  it("formats morning time with minutes", () => {
    expect(formatTime12h("09:30")).toBe("9:30 AM");
  });

  it("formats noon", () => {
    expect(formatTime12h("12:00")).toBe("12 PM");
  });

  it("formats afternoon", () => {
    expect(formatTime12h("14:00")).toBe("2 PM");
  });

  it("formats evening with minutes", () => {
    expect(formatTime12h("18:45")).toBe("6:45 PM");
  });

  it("formats end of day", () => {
    expect(formatTime12h("23:59")).toBe("11:59 PM");
  });
});

// ─── Time Validation ───

describe("isValidTimeRange", () => {
  it("returns true when start < end", () => {
    expect(isValidTimeRange("08:00", "09:00")).toBe(true);
  });

  it("returns false when start === end", () => {
    expect(isValidTimeRange("08:00", "08:00")).toBe(false);
  });

  it("returns false when start > end", () => {
    expect(isValidTimeRange("09:00", "08:00")).toBe(false);
  });

  it("returns true for full day range", () => {
    expect(isValidTimeRange("00:00", "23:59")).toBe(true);
  });
});

// ─── Overlap Detection ───

describe("hasOverlap", () => {
  const blocks = [
    { start: "08:00", end: "10:00" },
    { start: "12:00", end: "14:00" },
  ];

  it("returns false for no overlap", () => {
    expect(hasOverlap(blocks, "10:00", "12:00")).toBe(false);
  });

  it("returns true for overlapping at start", () => {
    expect(hasOverlap(blocks, "09:00", "11:00")).toBe(true);
  });

  it("returns true for overlapping at end", () => {
    expect(hasOverlap(blocks, "11:00", "13:00")).toBe(true);
  });

  it("returns true for fully contained block", () => {
    expect(hasOverlap(blocks, "08:30", "09:30")).toBe(true);
  });

  it("returns true for fully containing block", () => {
    expect(hasOverlap(blocks, "07:00", "15:00")).toBe(true);
  });

  it("returns false for adjacent blocks", () => {
    expect(hasOverlap(blocks, "10:00", "12:00")).toBe(false);
  });

  it("excludes specified index", () => {
    expect(hasOverlap(blocks, "08:00", "10:00", 0)).toBe(false);
  });

  it("does not exclude other indices", () => {
    expect(hasOverlap(blocks, "08:00", "10:00", 1)).toBe(true);
  });

  it("returns false for empty blocks", () => {
    expect(hasOverlap([], "08:00", "10:00")).toBe(false);
  });
});

// ─── Types ───

describe("Schedule types", () => {
  it("types.ts defines BlockType union", () => {
    const content = readFile("services/types.ts");
    expect(content).toContain("export type BlockType");
    expect(content).toContain('"school"');
    expect(content).toContain('"coaching"');
    expect(content).toContain('"custom"');
  });

  it("types.ts defines WeeklyBlock", () => {
    const content = readFile("services/types.ts");
    expect(content).toContain("export interface WeeklyBlock");
    expect(content).toContain("type: BlockType");
    expect(content).toContain("start: string");
    expect(content).toContain("end: string");
    expect(content).toContain("title?: string");
  });

  it("types.ts defines DayName", () => {
    const content = readFile("services/types.ts");
    expect(content).toContain("export type DayName");
    expect(content).toContain('"monday"');
    expect(content).toContain('"sunday"');
  });

  it("types.ts defines WeeklyScheduleData", () => {
    const content = readFile("services/types.ts");
    expect(content).toContain("export interface WeeklyScheduleData");
    expect(content).toContain("schedule: Partial<Record<DayName, WeeklyBlock[]>>");
  });

  it("types.ts defines WeeklyScheduleUpdatePayload", () => {
    const content = readFile("services/types.ts");
    expect(content).toContain("export interface WeeklyScheduleUpdatePayload");
  });
});

// ─── Hooks ───

describe("Schedule hooks", () => {
  it("hooks.ts has useWeeklySchedule", () => {
    const content = readFile("services/hooks.ts");
    expect(content).toContain("useWeeklySchedule");
    expect(content).toContain("/api/v1/profile/schedule");
  });

  it("hooks.ts has useSaveWeeklySchedule", () => {
    const content = readFile("services/hooks.ts");
    expect(content).toContain("useSaveWeeklySchedule");
    expect(content).toContain('queryKey: ["schedule"]');
  });

  it("useSaveWeeklySchedule invalidates schedule and backlog", () => {
    const content = readFile("services/hooks.ts");
    const section = content.slice(
      content.indexOf("useSaveWeeklySchedule"),
    );
    expect(section).toContain('queryKey: ["schedule"]');
    expect(section).toContain('queryKey: ["backlog"]');
    expect(section).toContain('queryKey: ["dashboard"]');
  });

  it("hooks.ts imports WeeklyScheduleData and WeeklyScheduleUpdatePayload", () => {
    const content = readFile("services/hooks.ts");
    expect(content).toContain("WeeklyScheduleData");
    expect(content).toContain("WeeklyScheduleUpdatePayload");
  });
});

// ─── File Structure ───

describe("Schedule file structure", () => {
  it("has schedule.tsx screen (not placeholder)", () => {
    const content = readFile("app/(app)/(plan)/schedule.tsx");
    expect(content).toContain("ScheduleScreen");
    expect(content).not.toContain("Placeholder");
  });

  it("schedule screen imports useWeeklySchedule", () => {
    const content = readFile("app/(app)/(plan)/schedule.tsx");
    expect(content).toContain("useWeeklySchedule");
  });

  it("schedule screen imports useSaveWeeklySchedule", () => {
    const content = readFile("app/(app)/(plan)/schedule.tsx");
    expect(content).toContain("useSaveWeeklySchedule");
  });

  it("schedule screen has day selector", () => {
    const content = readFile("app/(app)/(plan)/schedule.tsx");
    expect(content).toContain("DAYS");
    expect(content).toContain("dayTab");
    expect(content).toContain("selectedDay");
  });

  it("schedule screen has timeline/block rendering", () => {
    const content = readFile("app/(app)/(plan)/schedule.tsx");
    expect(content).toContain("blockCard");
    expect(content).toContain("blocks.map");
  });

  it("schedule screen has add block form", () => {
    const content = readFile("app/(app)/(plan)/schedule.tsx");
    expect(content).toContain("showForm");
    expect(content).toContain("BlockFormModal");
  });

  it("schedule screen has delete confirmation", () => {
    const content = readFile("app/(app)/(plan)/schedule.tsx");
    expect(content).toContain("deletingIndex");
    expect(content).toContain("Delete Block");
  });

  it("schedule screen has save functionality", () => {
    const content = readFile("app/(app)/(plan)/schedule.tsx");
    expect(content).toContain("handleSave");
    expect(content).toContain("hasChanges");
  });

  it("schedule screen uses DateTimePicker", () => {
    const content = readFile("app/(app)/(plan)/schedule.tsx");
    expect(content).toContain("DateTimePicker");
  });

  it("schedule screen imports schedule utilities", () => {
    const content = readFile("app/(app)/(plan)/schedule.tsx");
    expect(content).toContain("@/lib/schedule");
  });

  it("has schedule.ts utility file", () => {
    const content = readFile("lib/schedule.ts");
    expect(content).toContain("BLOCK_TYPES");
    expect(content).toContain("DAYS");
    expect(content).toContain("formatTime12h");
    expect(content).toContain("isValidTimeRange");
    expect(content).toContain("hasOverlap");
  });
});

// ─── Validation in Form ───

describe("Schedule form validation", () => {
  it("form uses isValidTimeRange for start/end validation", () => {
    const content = readFile("app/(app)/(plan)/schedule.tsx");
    expect(content).toContain("isValidTimeRange");
  });

  it("form uses hasOverlap for overlap detection", () => {
    const content = readFile("app/(app)/(plan)/schedule.tsx");
    expect(content).toContain("hasOverlap");
  });

  it("form shows error for invalid time range", () => {
    const content = readFile("app/(app)/(plan)/schedule.tsx");
    expect(content).toContain("End time must be after start time");
  });

  it("form shows error for overlapping blocks", () => {
    const content = readFile("app/(app)/(plan)/schedule.tsx");
    expect(content).toContain("overlaps with an existing block");
  });

  it("save button is disabled when validation fails", () => {
    const content = readFile("app/(app)/(plan)/schedule.tsx");
    expect(content).toContain("canSave");
    expect(content).toContain("formSaveDisabled");
  });
});

// ─── API Contract ───

describe("Schedule API contract", () => {
  it("uses correct endpoint for GET", () => {
    const content = readFile("services/hooks.ts");
    expect(content).toContain("/api/v1/profile/schedule");
  });

  it("uses PUT for saving schedule", () => {
    const content = readFile("services/hooks.ts");
    const section = content.slice(content.indexOf("useSaveWeeklySchedule"));
    expect(section).toContain("api.put");
    expect(section).toContain("/api/v1/profile/schedule");
  });

  it("sends full schedule as replacement", () => {
    const content = readFile("services/hooks.ts");
    const section = content.slice(content.indexOf("useSaveWeeklySchedule"));
    expect(section).toContain("WeeklyScheduleUpdatePayload");
  });
});

// ─── Query Invalidation ───

describe("Schedule query invalidation", () => {
  it("save invalidates schedule query", () => {
    const content = readFile("services/hooks.ts");
    const section = content.slice(content.indexOf("useSaveWeeklySchedule"));
    expect(section).toContain('queryKey: ["schedule"]');
  });

  it("save invalidates backlog query", () => {
    const content = readFile("services/hooks.ts");
    const section = content.slice(content.indexOf("useSaveWeeklySchedule"));
    expect(section).toContain('queryKey: ["backlog"]');
  });

  it("save invalidates dashboard query", () => {
    const content = readFile("services/hooks.ts");
    const section = content.slice(content.indexOf("useSaveWeeklySchedule"));
    expect(section).toContain('queryKey: ["dashboard"]');
  });
});
