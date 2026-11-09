export type DurableFocusState = "running" | "paused" | "challenge_active" | "recovery_pending" | "completion_pending";

export interface DurableFocusSession {
  version: 1;
  userId: string;
  sessionId: string;
  snapshotId: string;
  generation: string;
  totalDurationMs: number;
  accumulatedMs: number;
  state: DurableFocusState;
  completionMinutes?: number;
  updatedAt: string;
}

export interface FocusSessionIdentity {
  userId: string;
  sessionId: string;
  snapshotId: string;
  generation: string;
}

const KEY_PREFIX = "momentum.focus-session.v1.";
export const FOCUS_CHECKPOINT_INTERVAL_MS = 15_000;

function storage(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

function keyFor(userId: string, sessionId: string): string {
  return `${KEY_PREFIX}${encodeURIComponent(userId)}.${encodeURIComponent(sessionId)}`;
}

function isDurableFocusSession(value: unknown): value is DurableFocusSession {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DurableFocusSession>;
  return item.version === 1
    && typeof item.userId === "string" && item.userId.length > 0 && item.userId.length <= 200
    && typeof item.sessionId === "string" && item.sessionId.length > 0 && item.sessionId.length <= 255
    && typeof item.snapshotId === "string" && item.snapshotId.length > 0 && item.snapshotId.length <= 80
    && typeof item.generation === "string" && item.generation.length >= 16 && item.generation.length <= 80
    && Number.isSafeInteger(item.totalDurationMs) && item.totalDurationMs! > 0
    && Number.isSafeInteger(item.accumulatedMs) && item.accumulatedMs! >= 0 && item.accumulatedMs! <= item.totalDurationMs!
    && (item.state === "running" || item.state === "paused" || item.state === "challenge_active" || item.state === "recovery_pending" || item.state === "completion_pending")
    && (item.state !== "completion_pending" || (Number.isInteger(item.completionMinutes) && item.completionMinutes! >= 1))
    && typeof item.updatedAt === "string" && item.updatedAt.length <= 40;
}

export function loadFocusSession(
  userId: string,
  sessionId: string,
  snapshotId: string,
  totalDurationMs: number,
): DurableFocusSession | null {
  const target = storage();
  if (!target || !userId || !sessionId || !snapshotId || !Number.isSafeInteger(totalDurationMs) || totalDurationMs <= 0) return null;
  try {
    const raw = target.getItem(keyFor(userId, sessionId));
    if (!raw || raw.length > 4_096) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isDurableFocusSession(parsed)) return null;
    if (parsed.userId !== userId || parsed.sessionId !== sessionId || parsed.snapshotId !== snapshotId || parsed.totalDurationMs !== totalDurationMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveFocusSession(record: DurableFocusSession): boolean {
  const target = storage();
  if (!target || !isDurableFocusSession(record)) return false;
  try {
    target.setItem(keyFor(record.userId, record.sessionId), JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function clearFocusSession(userId: string, sessionId: string): void {
  const target = storage();
  if (!target || !userId || !sessionId) return;
  try { target.removeItem(keyFor(userId, sessionId)); } catch { /* keep the record for a later recovery attempt */ }
}
