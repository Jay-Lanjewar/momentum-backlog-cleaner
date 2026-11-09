import {
  clearFocusSession,
  loadFocusSession,
  saveFocusSession,
  type DurableFocusSession,
} from "@/focus/focusSessionPersistence";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

const store = new MemoryStorage();
const base: DurableFocusSession = {
  version: 1,
  userId: "student-1",
  sessionId: "session-1",
  snapshotId: "snapshot-1",
  generation: "generation-0000001",
  totalDurationMs: 1_500_000,
  accumulatedMs: 340_000,
  state: "running",
  updatedAt: "2026-11-08T00:00:00.000Z",
};

beforeAll(() => { Object.defineProperty(globalThis, "localStorage", { configurable: true, value: store }); });
beforeEach(() => store.clear());

describe("durable Focus session storage", () => {
  it("recovers only the matching account, plan, session, and duration", () => {
    expect(saveFocusSession(base)).toBe(true);
    expect(loadFocusSession("student-1", "session-1", "snapshot-1", 1_500_000)?.accumulatedMs).toBe(340_000);
    expect(loadFocusSession("student-2", "session-1", "snapshot-1", 1_500_000)).toBeNull();
    expect(loadFocusSession("student-1", "session-1", "snapshot-2", 1_500_000)).toBeNull();
  });

  it("preserves explicit paused, challenge, and completion-pending states", () => {
    for (const state of ["paused", "challenge_active", "recovery_pending", "completion_pending"] as const) {
      const record = { ...base, sessionId: `session-${state}`, state, ...(state === "completion_pending" ? { completionMinutes: 6 } : {}) };
      expect(saveFocusSession(record)).toBe(true);
      expect(loadFocusSession("student-1", record.sessionId, "snapshot-1", 1_500_000)?.state).toBe(state);
    }
  });

  it("ignores corrupt, oversized, and unsupported-version records", () => {
    expect(saveFocusSession(base)).toBe(true);
    const key = store.key(0)!;
    store.setItem(key, "{");
    expect(loadFocusSession("student-1", "session-1", "snapshot-1", 1_500_000)).toBeNull();
    store.setItem(key, "x".repeat(4_097));
    expect(loadFocusSession("student-1", "session-1", "snapshot-1", 1_500_000)).toBeNull();
    store.setItem(key, JSON.stringify({ ...base, version: 2 }));
    expect(loadFocusSession("student-1", "session-1", "snapshot-1", 1_500_000)).toBeNull();
  });

  it("clears only the selected account's session record", () => {
    saveFocusSession(base);
    saveFocusSession({ ...base, userId: "student-2" });
    clearFocusSession("student-1", "session-1");
    expect(loadFocusSession("student-1", "session-1", "snapshot-1", 1_500_000)).toBeNull();
    expect(loadFocusSession("student-2", "session-1", "snapshot-1", 1_500_000)).not.toBeNull();
  });
});
