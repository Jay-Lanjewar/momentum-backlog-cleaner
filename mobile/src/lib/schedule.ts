import type { BlockType, DayName } from "@/services/types";

export interface BlockTypeInfo {
  value: BlockType;
  label: string;
  color: string;
}

export const BLOCK_TYPES: BlockTypeInfo[] = [
  { value: "school", label: "School", color: "#3b82f6" },
  { value: "coaching", label: "Coaching", color: "#a855f7" },
  { value: "homework", label: "Homework", color: "#f97316" },
  { value: "self_study", label: "Self Study", color: "#10b981" },
  { value: "project", label: "Project", color: "#22c55e" },
  { value: "robotics", label: "Robotics", color: "#ec4899" },
  { value: "competition", label: "Competition", color: "#f43f5e" },
  { value: "exercise", label: "Exercise", color: "#f59e0b" },
  { value: "sports", label: "Sports", color: "#14b8a6" },
  { value: "music", label: "Music", color: "#6366f1" },
  { value: "art", label: "Art", color: "#d946ef" },
  { value: "reading", label: "Reading", color: "#06b6d4" },
  { value: "travel", label: "Travel", color: "#6b7280" },
  { value: "meal", label: "Meal", color: "#eab308" },
  { value: "break", label: "Break", color: "#94a3b8" },
  { value: "sleep", label: "Sleep", color: "#818cf8" },
  { value: "custom", label: "Custom", color: "#737373" },
];

export const BLOCK_TYPE_MAP = new Map(
  BLOCK_TYPES.map((bt) => [bt.value, bt]),
);

export const DAYS: DayName[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export const DAY_LABELS: Record<DayName, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

export const DAY_FULL_LABELS: Record<DayName, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export function getCurrentDayName(): DayName {
  const jsDay = new Date().getDay();
  const mapping: DayName[] = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  return mapping[jsDay];
}

export function formatTime12h(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${hour12} ${period}` : `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export function isValidTimeRange(start: string, end: string): boolean {
  return start < end;
}

export function hasOverlap(
  blocks: { start: string; end: string }[],
  newStart: string,
  newEnd: string,
  excludeIndex?: number,
): boolean {
  for (let i = 0; i < blocks.length; i++) {
    if (excludeIndex !== undefined && i === excludeIndex) continue;
    const b = blocks[i];
    if (newStart < b.end && newEnd > b.start) {
      return true;
    }
  }
  return false;
}
