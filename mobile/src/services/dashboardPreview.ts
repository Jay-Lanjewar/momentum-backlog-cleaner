import type { DashboardData } from "@/services/types";

const STORAGE_PREFIX = "momentum.today-dashboard.v1";
const SCHEMA_VERSION = 1;
const MAX_PAYLOAD_BYTES = 512 * 1024;

export interface DashboardPreviewSnapshot {
  version: 1;
  userId: string;
  localDate: string;
  timezone: string;
  fetchedAt: string;
  data: DashboardData;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function getDeviceDateAndTimezone(now = new Date()): {
  localDate: string;
  timezone: string;
} {
  const localDate = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return { localDate, timezone };
}

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}.${encodeURIComponent(userId)}`;
}

function isDashboardData(value: unknown): value is DashboardData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<DashboardData>;
  return (
    "profile" in data &&
    (data.profile === null || typeof data.profile === "object") &&
    !!data.streaks &&
    Array.isArray(data.streaks.subjects) &&
    !!data.balance &&
    Array.isArray(data.balance.neglected_subjects) &&
    !!data.insight &&
    !!data.planning &&
    Array.isArray(data.planning.prioritized_backlog) &&
    !!data.plan &&
    !!data.plan.plan &&
    Array.isArray(data.plan.plan.sessions) &&
    typeof data.today_completed_minutes === "number"
  );
}

function isSnapshot(value: unknown): value is DashboardPreviewSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<DashboardPreviewSnapshot>;
  return (
    snapshot.version === SCHEMA_VERSION &&
    typeof snapshot.userId === "string" &&
    snapshot.userId.length > 0 &&
    typeof snapshot.localDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(snapshot.localDate) &&
    typeof snapshot.timezone === "string" &&
    snapshot.timezone.length > 0 &&
    typeof snapshot.fetchedAt === "string" &&
    !Number.isNaN(Date.parse(snapshot.fetchedAt)) &&
    isDashboardData(snapshot.data)
  );
}

export function saveDashboardPreview(
  userId: string,
  data: DashboardData,
  now = new Date(),
): void {
  const target = storage();
  if (!target || !userId) return;

  const { localDate, timezone } = getDeviceDateAndTimezone(now);
  const snapshot: DashboardPreviewSnapshot = {
    version: SCHEMA_VERSION,
    userId,
    localDate,
    timezone,
    fetchedAt: new Date().toISOString(),
    data,
  };
  const serialized = JSON.stringify(snapshot);
  if (serialized.length > MAX_PAYLOAD_BYTES) return;

  try {
    target.setItem(storageKey(userId), serialized);
  } catch {
    // Preview storage is opportunistic and must never affect Today.
  }
}

export function loadDashboardPreview(
  userId: string,
  now = new Date(),
): DashboardData | null {
  const target = storage();
  if (!target || !userId) return null;

  let serialized: string | null = null;
  try {
    serialized = target.getItem(storageKey(userId));
  } catch {
    return null;
  }
  if (!serialized) return null;
  if (serialized.length > MAX_PAYLOAD_BYTES) {
    try {
      target.removeItem(storageKey(userId));
    } catch {
      // Ignore storage cleanup failures.
    }
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(serialized);
    const { localDate, timezone } = getDeviceDateAndTimezone(now);
    if (
      !isSnapshot(parsed) ||
      parsed.userId !== userId ||
      parsed.localDate !== localDate ||
      parsed.timezone !== timezone
    ) {
      target.removeItem(storageKey(userId));
      return null;
    }
    return parsed.data;
  } catch {
    try {
      target.removeItem(storageKey(userId));
    } catch {
      // Ignore storage cleanup failures.
    }
    return null;
  }
}

export function removeDashboardPreview(userId: string): void {
  const target = storage();
  if (!target || !userId) return;
  try {
    target.removeItem(storageKey(userId));
  } catch {
    // Preview storage is opportunistic and must never affect logout.
  }
}
