jest.mock("@/lib/api", () => ({ api: {} }));

import {
  getDashboardQueryKey,
  getDashboardScope,
  clearDashboardQueryCache,
  registerDashboardQueryClient,
} from "@/services/hooks";
import { QueryClient } from "@tanstack/react-query";
import {
  getDeviceDateAndTimezone,
  loadDashboardPreview,
  removeDashboardPreview,
  saveDashboardPreview,
} from "@/services/dashboardPreview";

function makeDashboard() {
  return {
    profile: null,
    streaks: {
      momentum: {
        current_streak: 0,
        longest_streak: 0,
        total_study_days: 0,
        last_completed_date: null,
        recovery_tokens_current: 0,
        recovery_tokens_earned: 0,
        recovery_tokens_used: 0,
        streak_protected_today: false,
      },
      subjects: [],
    },
    balance: { score: 0, message: null, neglected_subjects: [] },
    insight: { title: "Keep going", message: "Keep going", priority: 1 },
    planning: {
      available_windows: [],
      prioritized_backlog: [],
      total_available_minutes: 0,
      total_required_minutes: 0,
      estimated_days_to_clear: null,
      backlog_health: {
        total_items: 0,
        completed_items: 0,
        overdue_items: 0,
        pending_items: 0,
        clear_rate_7d: 0,
        health_score: "good",
        estimated_completion_date: null,
      },
    },
    plan: {
      plan: { sessions: [], daily_message: "", overflow: [] },
      source: "deterministic" as const,
      snapshot_id: "snapshot-1",
    },
    today_completed_minutes: 0,
  };
}

const userId = "user-1";
const now = new Date(2026, 9, 11, 12, 0, 0);

beforeEach(() => {
  const values = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
});

afterEach(() => {
  delete (globalThis as any).localStorage;
});

function rawSnapshot() {
  return JSON.parse(
    (globalThis as any).localStorage.getItem(
      `momentum.today-dashboard.v1.${encodeURIComponent(userId)}`,
    ),
  );
}

describe("Today dashboard preview storage", () => {
  it("uses distinct authoritative query keys for different users and dates", () => {
    const a = getDashboardScope("user-a", now);
    const b = getDashboardScope("user-b", now);
    const tomorrow = getDashboardScope("user-a", new Date(2026, 9, 12));

    expect(getDashboardQueryKey(a)).not.toEqual(getDashboardQueryKey(b));
    expect(getDashboardQueryKey(a)).not.toEqual(
      getDashboardQueryKey(tomorrow),
    );
  });

  it("clears all authoritative dashboard queries without touching previews", () => {
    const queryClient = new QueryClient();
    const scope = getDashboardScope(userId, now);
    queryClient.setQueryData(getDashboardQueryKey(scope), makeDashboard());
    registerDashboardQueryClient(queryClient);

    clearDashboardQueryCache();

    expect(queryClient.getQueryData(getDashboardQueryKey(scope))).toBeUndefined();
  });

  it("saves and restores a valid user/date/timezone snapshot", () => {
    const dashboard = makeDashboard();
    saveDashboardPreview(userId, dashboard, now);

    expect(loadDashboardPreview(userId, now)).toEqual(dashboard);
    expect(rawSnapshot()).toEqual(
      expect.objectContaining({
        version: 1,
        userId,
        ...getDeviceDateAndTimezone(now),
        data: dashboard,
      }),
    );
  });

  it.each([
    [
      "wrong user",
      () => {
        const snapshot = rawSnapshot();
        snapshot.userId = "other-user";
        (globalThis as any).localStorage.setItem(
          `momentum.today-dashboard.v1.${encodeURIComponent(userId)}`,
          JSON.stringify(snapshot),
        );
        return loadDashboardPreview(userId, now);
      },
    ],
    ["wrong date", () => loadDashboardPreview(userId, new Date(2026, 9, 12))],
    [
      "wrong timezone",
      () => {
        const snapshot = rawSnapshot();
        snapshot.timezone = "Pacific/Honolulu";
        (globalThis as any).localStorage.setItem(
          `momentum.today-dashboard.v1.${encodeURIComponent(userId)}`,
          JSON.stringify(snapshot),
        );
        return loadDashboardPreview(userId, now);
      },
    ],
    [
      "unsupported version",
      () => {
        const snapshot = rawSnapshot();
        snapshot.version = 99;
        (globalThis as any).localStorage.setItem(
          `momentum.today-dashboard.v1.${encodeURIComponent(userId)}`,
          JSON.stringify(snapshot),
        );
        return loadDashboardPreview(userId, now);
      },
    ],
    [
      "malformed data",
      () => {
        (globalThis as any).localStorage.setItem(
          `momentum.today-dashboard.v1.${encodeURIComponent(userId)}`,
          "{not-json",
        );
        return loadDashboardPreview(userId, now);
      },
    ],
  ])("rejects and discards %s snapshots", (_label, read) => {
    saveDashboardPreview(userId, makeDashboard(), now);
    expect(read()).toBeNull();
    expect(
      (globalThis as any).localStorage.getItem(
        `momentum.today-dashboard.v1.${encodeURIComponent(userId)}`,
      ),
    ).toBeNull();
  });

  it("removes only the requested user's snapshot", () => {
    saveDashboardPreview(userId, makeDashboard(), now);
    saveDashboardPreview("other-user", makeDashboard(), now);

    removeDashboardPreview(userId);

    expect(loadDashboardPreview(userId, now)).toBeNull();
    expect(loadDashboardPreview("other-user", now)).not.toBeNull();
  });
});
