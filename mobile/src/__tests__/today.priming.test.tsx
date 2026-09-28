/**
 * Today notification priming card:
 * - appears once on first authenticated Today when permission is not granted
 * - the system prompt is triggered only from the "Enable notifications" CTA
 * - "Not now" dismisses without invoking the helper
 * - dismissal persists per install (localStorage) and never nags again
 */

import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
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

const mockGetPermissionState = jest.fn();
const mockRequestPermission = jest.fn();

jest.mock("@/services/notifications", () => ({
  getPermissionState: (...args: unknown[]) => mockGetPermissionState(...args),
  requestNotificationPermission: (...args: unknown[]) =>
    mockRequestPermission(...args),
}));

const Today = require("@/app/(app)/(today)/index").default;
const { useDashboard } = require("@/services/hooks");

const DISMISS_KEY = "momentum:notifications-priming-dismissed";

let storage: Record<string, string>;

function makeBacklogItem(id: string) {
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
  };
}

function makeDashboard() {
  const item = makeBacklogItem("item-1");
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = Math.max(nowMin - 10, 0);
  const fmt = (m: number) =>
    `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

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
        sessions: [
          {
            backlog_item_id: item.id,
            session_id: `${item.id}:s1`,
            start_time: fmt(startMin),
            end_time: fmt(Math.min(startMin + 60, 1439)),
            reason: "Work on Motion 1",
            remaining_minutes: 60,
          },
        ],
        daily_message: "Planned 1 of 1 items. All tasks scheduled!",
        overflow: [],
      },
      source: "deterministic",
      snapshot_id: "snap-1",
    },
    today_completed_minutes: 0,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPermissionState.mockResolvedValue({
    status: "denied",
    canAskAgain: true,
  });
  mockRequestPermission.mockResolvedValue(true);
  mockPush.mockClear();

  (useDashboard as jest.Mock).mockReturnValue({
    data: makeDashboard(),
    isLoading: false,
    isRefetching: false,
    refetch: mockRefetch,
  });

  // Per-install dismissal flag storage (localStorage is app-wide via
  // expo-sqlite in production; stubbed here for deterministic tests).
  storage = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => {
      storage[key] = value;
    },
    removeItem: (key: string) => {
      delete storage[key];
    },
    clear: () => {
      storage = {};
    },
  };
});

afterEach(() => {
  delete (globalThis as any).localStorage;
});

describe("Today notification priming card", () => {
  it("shows the card with the explanation copy on first Today entry", async () => {
    await render(<Today />);

    const card = await screen.findByTestId("notification-priming-card");
    expect(card).toBeTruthy();
    expect(screen.getByText("Stay on track")).toBeTruthy();
    expect(
      screen.getByText(
        "Momentum will remind you 10 minutes before each session, alert you when one starts, and tell you if one was missed.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Enable notifications")).toBeTruthy();
    expect(screen.getByText("Not now")).toBeTruthy();
  });

  it("does not request permission automatically while showing the card", async () => {
    await render(<Today />);

    await screen.findByTestId("notification-priming-card");
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it("does not block Today content behind the card", async () => {
    await render(<Today />);

    await screen.findByTestId("notification-priming-card");
    expect(screen.getByText("Motion 1")).toBeTruthy();
    expect(screen.getByText("Sign Out")).toBeTruthy();
  });

  it("stays hidden when notifications are already granted", async () => {
    mockGetPermissionState.mockResolvedValue({ status: "granted" });

    await render(<Today />);

    expect(screen.queryByTestId("notification-priming-card")).toBeNull();
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it("stays hidden when the card was already dismissed for this install", async () => {
    storage[DISMISS_KEY] = "1";

    await render(<Today />);

    expect(screen.queryByTestId("notification-priming-card")).toBeNull();
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it('"Enable notifications" invokes the permission helper exactly once and hides the card', async () => {
    await render(<Today />);
    await screen.findByTestId("notification-priming-card");

    fireEvent.press(screen.getByTestId("notification-priming-enable"));

    await waitFor(() => {
      expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByTestId("notification-priming-card")).toBeNull();
    });
    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  });

  it("a denied prompt is not re-attempted automatically after Enable", async () => {
    mockRequestPermission.mockResolvedValue(false);
    mockGetPermissionState.mockResolvedValue({
      status: "denied",
      canAskAgain: true,
    });

    await render(<Today />);
    await screen.findByTestId("notification-priming-card");

    fireEvent.press(screen.getByTestId("notification-priming-enable"));

    await waitFor(() => {
      expect(screen.queryByTestId("notification-priming-card")).toBeNull();
    });
    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  });

  it('"Not now" hides the card without invoking the permission helper', async () => {
    await render(<Today />);
    await screen.findByTestId("notification-priming-card");

    fireEvent.press(screen.getByTestId("notification-priming-dismiss"));

    await waitFor(() => {
      expect(screen.queryByTestId("notification-priming-card")).toBeNull();
    });
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it("dismissal persists per install so the card never returns on remount", async () => {
    const first = await render(<Today />);
    await screen.findByTestId("notification-priming-card");

    fireEvent.press(screen.getByTestId("notification-priming-dismiss"));
    await waitFor(() => {
      expect(screen.queryByTestId("notification-priming-card")).toBeNull();
    });
    expect(storage[DISMISS_KEY]).toBe("1");
    first.unmount();

    await render(<Today />);
    expect(screen.queryByTestId("notification-priming-card")).toBeNull();
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });
});
