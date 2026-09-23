/**
 * Today first-value UX: prefetched dashboard paint, daily_message,
 * recommendation prominence, and split empty states.
 */

import React from "react";
import {
  render,
  screen,
  fireEvent,
} from "@testing-library/react-native";

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
  }),
}));

jest.mock("react-native-safe-area-context", () => {
  const R = require("react");
  return {
    SafeAreaView: ({ children, ...props }: any) =>
      R.createElement("SafeAreaView", props, children),
  };
});

const mockRefetch = jest.fn();

jest.mock("@/services/hooks", () => ({
  useDashboard: jest.fn(),
  fetchDashboard: jest.fn(),
  dashboardQueryKey: ["dashboard"],
}));

jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { name: "Ada", email: "ada@example.com" },
    isAuthenticated: true,
    isLoading: false,
    logout: jest.fn(),
  }),
}));

jest.mock("@/hooks/useNotificationScheduler", () => ({
  useNotificationScheduler: jest.fn(),
}));

const Today = require("@/app/(app)/(today)/index").default;
const { useDashboard } = require("@/services/hooks");

function makeBacklogItem(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Motion ${id}`,
    course_id: "c1",
    course_name: "Physics",
    course_color: "#6366f1",
    priority: 3,
    score: 50,
    estimated_minutes: 30,
    due_date: null,
    overdue: false,
    status: "pending",
    ...overrides,
  };
}

function makeDashboard(overrides: Partial<Record<string, any>> = {}) {
  const item = makeBacklogItem("item-1");
  const session = {
    backlog_item_id: item.id,
    session_id: `${item.id}:s1`,
    start_time: "16:00",
    end_time: "17:00",
    reason: "Work on Motion 1",
    remaining_minutes: 60,
  };

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  // Make session current or next so missionSession is always present when sessions exist
  const startMin = Math.max(nowMin - 10, 0);
  const endMin = startMin + 60;
  const fmt = (m: number) =>
    `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  session.start_time = fmt(startMin);
  session.end_time = fmt(Math.min(endMin, 1439));

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
    insight: { title: "Keep Going", message: "Keep going.", priority: 10 },
    planning: {
      available_windows: [],
      prioritized_backlog: [item],
      total_available_minutes: 0,
      total_required_minutes: 30,
      estimated_days_to_clear: 1,
      backlog_health: {
        total_items: 1,
        completed_items: 0,
        overdue_items: 0,
        pending_items: 1,
        clear_rate_7d: 0,
        health_score: "fair",
        estimated_completion_date: null,
      },
    },
    plan: {
      plan: {
        sessions: [session],
        daily_message: "Planned 1 of 1 items. All tasks scheduled!",
        overflow: [],
      },
      source: "deterministic",
      snapshot_id: "snap-1",
    },
    today_completed_minutes: 0,
    ...overrides,
  };
}

function setDashboard(result: {
  data?: any;
  isLoading?: boolean;
  isRefetching?: boolean;
}) {
  (useDashboard as jest.Mock).mockReturnValue({
    data: result.data ?? null,
    isLoading: result.isLoading ?? false,
    isRefetching: result.isRefetching ?? false,
    refetch: mockRefetch,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Today first-load with prefetched dashboard", () => {
  it("renders recommendation immediately when dashboard data is prefetched", async () => {
    setDashboard({ data: makeDashboard(), isLoading: false });

    await render(<Today />);

    expect(screen.queryByText("Could not load dashboard")).toBeNull();
    // Full-screen loading only when isLoading (cold fetch), not when cache warm
    expect(screen.getByText("Work on Motion 1")).toBeTruthy();
    expect(screen.getByText(/Start (Focus|Next) Session/)).toBeTruthy();
  });

  it("shows daily_message near the recommendation", async () => {
    setDashboard({ data: makeDashboard(), isLoading: false });

    await render(<Today />);

    expect(
      screen.getByText("Planned 1 of 1 items. All tasks scheduled!"),
    ).toBeTruthy();
  });

  it("hides daily_message when empty", async () => {
    const dash = makeDashboard();
    dash.plan.plan.daily_message = "";
    setDashboard({ data: dash, isLoading: false });

    await render(<Today />);

    expect(screen.queryByText(/Planned \d+ of \d+/)).toBeNull();
    expect(screen.getByText("Work on Motion 1")).toBeTruthy();
  });

  it("keeps recommendation as first meaningful content after greeting", async () => {
    setDashboard({ data: makeDashboard(), isLoading: false });

    const { toJSON } = await render(<Today />);
    const tree = toJSON();

    const collectTexts = (node: any, acc: string[] = []): string[] => {
      if (!node || typeof node !== "object") return acc;
      const c = node.children;
      if (typeof c === "string") {
        acc.push(c);
      } else if (Array.isArray(c)) {
        for (const child of c) {
          if (typeof child === "string") acc.push(child);
          else collectTexts(child, acc);
        }
      }
      return acc;
    };

    const texts = collectTexts(tree);
    const greetingIdx = texts.findIndex((t) =>
      /Good (morning|afternoon|evening)/.test(t),
    );
    const recIdx = texts.indexOf("Work on Motion 1");
    const progressIdx = texts.indexOf("Progress");
    const streakIdx = texts.indexOf("Momentum");

    expect(greetingIdx).toBeGreaterThanOrEqual(0);
    expect(recIdx).toBeGreaterThan(greetingIdx);
    expect(progressIdx).toBeGreaterThan(recIdx);
    expect(streakIdx).toBeGreaterThan(recIdx);
  });

  it("passes isTopPriority when session matches top prioritized backlog", async () => {
    setDashboard({ data: makeDashboard(), isLoading: false });

    await render(<Today />);

    // Top item reason shown when applicable (priority 3 + top → top reason path)
    // Title still comes from session.reason
    expect(screen.getByText("Work on Motion 1")).toBeTruthy();
    expect(
      screen.getByText("Top of your prioritized backlog — best next match."),
    ).toBeTruthy();
  });
});

describe("Today empty states", () => {
  it("empty backlog shows Add Work CTA, not No more sessions", async () => {
    const dash = makeDashboard();
    dash.plan.plan.sessions = [];
    dash.planning.prioritized_backlog = [];
    dash.planning.backlog_health = {
      total_items: 0,
      completed_items: 0,
      overdue_items: 0,
      pending_items: 0,
      clear_rate_7d: 0,
      health_score: "good",
      estimated_completion_date: null,
    };
    setDashboard({ data: dash, isLoading: false });

    await render(<Today />);

    expect(screen.getByText("Add your first task")).toBeTruthy();
    expect(screen.getByText("Add Work")).toBeTruthy();
    expect(screen.queryByText("No more sessions today")).toBeNull();
    expect(screen.queryByText("No study time left today")).toBeNull();

    await fireEvent.press(screen.getByText("Add Work"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/(work)");
  });

  it("backlog exists but no window left shows honest no-time state", async () => {
    const dash = makeDashboard();
    dash.plan.plan.sessions = [];
    dash.planning.prioritized_backlog = [makeBacklogItem("item-1")];
    dash.planning.backlog_health.total_items = 3;
    dash.planning.backlog_health.pending_items = 3;
    setDashboard({ data: dash, isLoading: false });

    await render(<Today />);

    expect(screen.getByText("No study time left today")).toBeTruthy();
    expect(screen.getByText(/3 tasks waiting/)).toBeTruthy();
    expect(screen.queryByText("No more sessions today")).toBeNull();
    expect(screen.queryByText("Add your first task")).toBeNull();

    await fireEvent.press(screen.getByText("View schedule"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/(plan)");
  });

  it("all sessions completed shows All caught up", async () => {
    const dash = makeDashboard();
    dash.planning.prioritized_backlog = [];
    dash.planning.backlog_health.total_items = 1;
    dash.planning.backlog_health.completed_items = 1;
    setDashboard({ data: dash, isLoading: false });

    await render(<Today />);

    expect(screen.getByText("All caught up!")).toBeTruthy();
    expect(screen.queryByText("No more sessions today")).toBeNull();
  });
});

describe("Today loading and error", () => {
  it("shows spinner only while loading (no prefetched data)", async () => {
    setDashboard({ data: null, isLoading: true });

    const { toJSON } = await render(<Today />);
    expect(JSON.stringify(toJSON())).toContain("ActivityIndicator");
    expect(screen.queryByText("Could not load dashboard")).toBeNull();
  });

  it("shows retry when data missing and not loading", async () => {
    setDashboard({ data: null, isLoading: false });

    await render(<Today />);

    expect(screen.getByText(/Could not load dashboard/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Retry"));
    expect(mockRefetch).toHaveBeenCalled();
  });
});
