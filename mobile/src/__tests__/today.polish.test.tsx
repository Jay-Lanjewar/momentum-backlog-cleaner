/**
 * V1.1 Batch 1 — Today polish.
 *
 * 1. Greeting uses the first name only and stays collision-free.
 * 2. Plan status is student-facing and derived from dashboard counts.
 * 3. Recommended-next copy never leaks planner-internal language.
 * 4. Durations come from end_time - start_time (never backlog remainder).
 * 5. Overdue / empty / completed / no-session states answer "what now?".
 * 6. Start Focus Session still routes to the exact session.
 *
 * The clock is pinned to 15:30 so "NOW / NEXT UP / upcoming" and the
 * greeting are deterministic. Only `Date` is faked — timers stay real.
 */

import React from "react";
import {
  render,
  screen,
  fireEvent,
} from "@testing-library/react-native";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
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

let mockUserName: string | null = "Ravindra Kumar";
const mockLogout = jest.fn();

jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockUserName
      ? { name: mockUserName, email: "student@example.com" }
      : null,
    isAuthenticated: true,
    isLoading: false,
    logout: mockLogout,
  }),
}));

jest.mock("@/hooks/useNotificationScheduler", () => ({
  useNotificationScheduler: jest.fn(),
}));

jest.mock("@/services/notifications", () => ({
  getPermissionState: jest.fn().mockResolvedValue({ status: "granted" }),
  requestNotificationPermission: jest.fn().mockResolvedValue(true),
  rescheduleTodayNotifications: jest.fn(),
  sessionScheduleKey: jest.fn(),
}));

const Today = require("@/app/(app)/(today)/index").default;
const { useDashboard } = require("@/services/hooks");
const { useNotificationScheduler } = require("@/hooks/useNotificationScheduler");

// Pinned clock: 15:30 local → "Good afternoon", nowMin = 930.
const CLOCK = new Date(2026, 8, 29, 15, 30, 0);

function makeItem(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Chapter ${id} questions`,
    course_id: "c1",
    course_name: "Physics",
    course_color: "#6366f1",
    priority: 3,
    score: 50,
    estimated_minutes: 40,
    due_date: null,
    overdue: false,
    status: "pending",
    ...overrides,
  };
}

function makeSession(
  itemId: string,
  start: string,
  end: string,
  remainingMinutes: number,
  index = 1,
) {
  return {
    backlog_item_id: itemId,
    session_id: `${itemId}:s${index}`,
    start_time: start,
    end_time: end,
    reason: `Work on Chapter ${itemId} questions`,
    remaining_minutes: remainingMinutes,
  };
}

interface DashboardOptions {
  items?: Record<string, unknown>[];
  sessions?: Record<string, unknown>[];
  pendingItems?: number;
  totalItems?: number;
  completedItems?: number;
  dailyMessage?: string;
  studyDays?: number;
  completedMinutes?: number;
}

function makeDashboard(options: DashboardOptions = {}) {
  const items = options.items ?? [makeItem("item-1")];
  const sessions = options.sessions ?? [];
  const pendingItems = options.pendingItems ?? items.length;
  const totalItems = options.totalItems ?? pendingItems;

  return {
    profile: null,
    streaks: {
      momentum: {
        current_streak: options.studyDays ?? 0,
        longest_streak: 0,
        total_study_days: options.studyDays ?? 0,
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
      prioritized_backlog: items,
      total_available_minutes: 0,
      total_required_minutes: 40,
      estimated_days_to_clear: 1,
      backlog_health: {
        total_items: totalItems,
        completed_items: options.completedItems ?? 0,
        overdue_items: 0,
        pending_items: pendingItems,
        clear_rate_7d: 0,
        health_score: "fair",
        estimated_completion_date: null,
      },
    },
    plan: {
      plan: {
        sessions,
        daily_message:
          options.dailyMessage ?? "Planned 1 of 1 items. All tasks scheduled!",
        overflow: [],
      },
      source: "deterministic",
      snapshot_id: "snap-1",
    },
    today_completed_minutes: options.completedMinutes ?? 0,
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

function collectTexts(node: any, acc: string[] = []): string[] {
  if (!node || typeof node !== "object") return acc;
  const children = node.children;
  if (typeof children === "string") {
    acc.push(children);
  } else if (Array.isArray(children)) {
    for (const child of children) {
      if (typeof child === "string") acc.push(child);
      else collectTexts(child, acc);
    }
  }
  return acc;
}

beforeAll(() => {
  jest.useFakeTimers({ doNotFake: [
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "setImmediate",
    "clearImmediate",
    "queueMicrotask",
    "nextTick",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "requestIdleCallback",
    "cancelIdleCallback",
    "performance",
    "hrtime",
  ] });
  jest.setSystemTime(CLOCK);
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUserName = "Ravindra Kumar";
  mockRefetch.mockReset();
});

// ─── A. Header ───

describe("Today header", () => {
  it("greets with the first name only", async () => {
    setDashboard({
      data: makeDashboard({
        sessions: [makeSession("item-1", "15:20", "16:00", 0)],
      }),
    });

    await render(<Today />);

    expect(screen.getByText("Good afternoon, Ravindra")).toBeTruthy();
    expect(screen.queryByText(/Ravindra Kumar/)).toBeNull();
    expect(screen.queryByText(/, Ravindra Kumar/)).toBeNull();
  });

  it("keeps the greeting bounded so Sign Out cannot collide", async () => {
    setDashboard({
      data: makeDashboard({
        sessions: [makeSession("item-1", "15:20", "16:00", 0)],
      }),
    });

    await render(<Today />);

    const greeting = screen.getByText("Good afternoon, Ravindra");
    expect(greeting.props.numberOfLines).toBe(2);
    expect(greeting.props.accessibilityRole).toBe("header");
    expect(screen.getByLabelText("Sign Out")).toBeTruthy();
    expect(screen.getByText("Sign Out")).toBeTruthy();
  });

  it("falls back to a generic greeting without a name", async () => {
    mockUserName = null;
    setDashboard({
      data: makeDashboard({
        sessions: [makeSession("item-1", "15:20", "16:00", 0)],
      }),
    });

    await render(<Today />);

    expect(screen.getByText("Good afternoon")).toBeTruthy();
    expect(screen.queryByText(/Good afternoon,/)).toBeNull();
  });
});

// ─── B. Plan status copy ───

describe("Today plan status wording", () => {
  it("says a single task is planned for today", async () => {
    setDashboard({
      data: makeDashboard({
        sessions: [makeSession("item-1", "15:20", "16:00", 0)],
      }),
    });

    await render(<Today />);

    expect(screen.getByText("1 task planned for today.")).toBeTruthy();
    expect(screen.queryByText(/Planned \d+ of \d+ items/)).toBeNull();
  });

  it("says every task is scheduled when nothing overflows", async () => {
    setDashboard({
      data: makeDashboard({
        items: [makeItem("a"), makeItem("b"), makeItem("c")],
        sessions: [
          makeSession("a", "15:20", "16:00", 0),
          makeSession("b", "16:15", "16:55", 0),
          makeSession("c", "17:10", "17:40", 0),
        ],
        pendingItems: 3,
      }),
    });

    await render(<Today />);

    expect(screen.getByText("All 3 tasks are scheduled.")).toBeTruthy();
    expect(screen.queryByText(/Planned \d+ of \d+ items/)).toBeNull();
  });

  it("is honest when tasks continue later", async () => {
    setDashboard({
      data: makeDashboard({
        items: [makeItem("a"), makeItem("b"), makeItem("c"), makeItem("d")],
        sessions: [
          makeSession("a", "15:20", "16:00", 0),
          makeSession("b", "16:15", "16:55", 0),
        ],
        pendingItems: 4,
      }),
    });

    await render(<Today />);

    expect(
      screen.getByText(
        "2 of 4 tasks planned today. The rest will continue later.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/^All 4 tasks are scheduled\./)).toBeNull();
  });

  it("keeps a human adaptive daily message but drops the planner tally", async () => {
    setDashboard({
      data: makeDashboard({
        sessions: [makeSession("item-1", "15:20", "16:00", 0)],
        dailyMessage: "Steady pace today — one session at a time.",
      }),
    });

    await render(<Today />);

    expect(
      screen.getByText("Steady pace today — one session at a time."),
    ).toBeTruthy();
    expect(screen.queryByText(/Planned \d+ of \d+ items/)).toBeNull();
  });
});

// ─── C + 4. Recommended-next copy ───

describe("Recommended next card copy", () => {
  it("explains the pick in student language", async () => {
    setDashboard({
      data: makeDashboard({
        sessions: [makeSession("item-1", "16:15", "16:55", 0)],
      }),
    });

    await render(<Today />);

    expect(screen.getByText("Chapter item-1 questions")).toBeTruthy();
    expect(
      screen.getByText("Highest priority from your current work."),
    ).toBeTruthy();
    expect(screen.getByText("Physics")).toBeTruthy();
    expect(screen.getByText("4:15 PM – 4:55 PM")).toBeTruthy();
    expect(screen.getByText("Start Next Session")).toBeTruthy();
  });

  it("never shows planner-internal terminology on Today", async () => {
    setDashboard({
      data: makeDashboard({
        items: [makeItem("item-1"), makeItem("item-2")],
        sessions: [
          makeSession("item-1", "15:20", "16:00", 0),
          makeSession("item-2", "16:15", "16:55", 0),
        ],
        pendingItems: 2,
        studyDays: 3,
        completedMinutes: 25,
      }),
    });

    const { toJSON } = await render(<Today />);

    const text = collectTexts(toJSON()).join(" | ");
    expect(text).not.toMatch(
      /prioritized backlog|best next match|Planned \d+ of \d+ items|remaining_minutes|snapshot_id|overflow/i,
    );
    // Student-facing replacements are present instead.
    expect(text).toContain("All 2 tasks are scheduled.");
  });

  it("uses a supportive overdue message with the OVERDUE badge", async () => {
    setDashboard({
      data: makeDashboard({
        items: [makeItem("item-1", { overdue: true, priority: 1 })],
        sessions: [makeSession("item-1", "15:20", "16:00", 0)],
      }),
    });

    await render(<Today />);

    expect(screen.getByText("OVERDUE")).toBeTruthy();
    expect(
      screen.getByText(
        "You're behind on this one. It's now the most important next step.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/This task is overdue/)).toBeNull();
    expect(screen.queryByText(/highest priority\.?$/i)).toBeNull();
  });
});

// ─── D. Duration display ───

describe("Today duration display", () => {
  it("shows 40m for a 40-minute upcoming session whose remainder is 0", async () => {
    setDashboard({
      data: makeDashboard({
        items: [makeItem("item-1"), makeItem("item-2")],
        sessions: [
          // Last session of the task → backend remainder is 0.
          makeSession("item-1", "16:15", "16:55", 0),
          makeSession("item-2", "17:10", "17:40", 0),
        ],
        pendingItems: 2,
      }),
    });

    await render(<Today />);

    expect(screen.getByText("~40m")).toBeTruthy(); // recommended card
    expect(screen.getByText("~30m")).toBeTruthy(); // upcoming row
    expect(screen.queryByText("~0m")).toBeNull();
  });

  it("shows time left in the running session instead of a duration", async () => {
    setDashboard({
      data: makeDashboard({
        sessions: [makeSession("item-1", "15:20", "16:00", 0)],
      }),
    });

    await render(<Today />);

    expect(screen.getByText(/NOW/)).toBeTruthy();
    expect(screen.getByText("30m left")).toBeTruthy();
    expect(screen.queryByText("~40m")).toBeNull();
    expect(screen.queryByText("~0m")).toBeNull();
  });

  it("keeps the upcoming row duration independent of the backlog remainder", async () => {
    setDashboard({
      data: makeDashboard({
        items: [makeItem("item-1"), makeItem("item-2")],
        sessions: [
          // Running now: shows time left, never the 45-minute remainder.
          makeSession("item-1", "15:20", "16:00", 45),
          // 25-minute upcoming session with a large leftover estimate.
          makeSession("item-2", "16:15", "16:40", 95),
        ],
        pendingItems: 2,
      }),
    });

    await render(<Today />);

    expect(screen.getByText("30m left")).toBeTruthy(); // 16:00 - 15:30
    expect(screen.getByText("~25m")).toBeTruthy(); // 16:40 - 16:15
    expect(screen.queryByText("~95m")).toBeNull();
    expect(screen.queryByText("~45m")).toBeNull();
  });
});

// ─── E. Upcoming section ───

describe("Today upcoming section", () => {
  it("renders compact rows with time, title and duration", async () => {
    setDashboard({
      data: makeDashboard({
        items: [makeItem("item-1"), makeItem("item-2")],
        sessions: [
          makeSession("item-1", "15:20", "16:00", 0),
          makeSession("item-2", "16:15", "16:55", 0),
        ],
        pendingItems: 2,
        studyDays: 3,
        completedMinutes: 25,
      }),
    });

    await render(<Today />);

    expect(screen.getByText("Upcoming Today")).toBeTruthy();
    expect(screen.getByTestId("today-upcoming-item-2:s1")).toBeTruthy();
    expect(screen.getByText("4:15 PM")).toBeTruthy();
    expect(screen.getByText("Chapter item-2 questions")).toBeTruthy();
    expect(screen.getByText("~40m")).toBeTruthy();
  });

  it("does not list the recommended session twice", async () => {
    setDashboard({
      data: makeDashboard({
        sessions: [makeSession("item-1", "16:15", "16:55", 0)],
      }),
    });

    await render(<Today />);

    expect(screen.queryByText("Upcoming Today")).toBeNull();
  });
});

// ─── G. Empty states ───

describe("Today empty states", () => {
  it("empty backlog tells the student what to do and offers Add Work", async () => {
    setDashboard({
      data: makeDashboard({
        items: [],
        sessions: [],
        pendingItems: 0,
        totalItems: 0,
      }),
    });

    await render(<Today />);

    expect(screen.getByText("No work yet.")).toBeTruthy();
    expect(
      screen.getByText(
        "Add your first task and Momentum will build your study plan.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("No more sessions today")).toBeNull();

    await fireEvent.press(screen.getByText("Add Work"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/(work)");
  });

  it("all completed celebrates without guilt or extra work", async () => {
    setDashboard({
      data: makeDashboard({
        items: [],
        sessions: [makeSession("item-1", "15:20", "16:00", 0)],
        pendingItems: 0,
        totalItems: 1,
        completedItems: 1,
        studyDays: 3,
        completedMinutes: 40,
      }),
    });

    await render(<Today />);

    expect(screen.getByText("All caught up!")).toBeTruthy();
    expect(
      screen.getByText(
        "You've finished everything planned for today. Nothing else needs you right now.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("No more sessions today")).toBeNull();
  });

  it("work but no session today explains where it continues", async () => {
    setDashboard({
      data: makeDashboard({
        items: [makeItem("a"), makeItem("b"), makeItem("c")],
        sessions: [],
        pendingItems: 3,
        totalItems: 3,
      }),
    });

    await render(<Today />);

    expect(screen.getByText("No study time left today")).toBeTruthy();
    expect(
      screen.getByText(
        "3 tasks waiting, but no free window remains today. They'll continue in your next available study period.",
      ),
    ).toBeTruthy();

    await fireEvent.press(screen.getByText("View schedule"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/(plan)");
  });

  it("sessions already passed keeps unfinished work moving forward", async () => {
    setDashboard({
      data: makeDashboard({
        items: [makeItem("item-1")],
        sessions: [makeSession("item-1", "09:00", "09:40", 0)],
        pendingItems: 1,
        totalItems: 1,
        studyDays: 3,
        completedMinutes: 25,
      }),
    });

    await render(<Today />);

    expect(screen.getByText("No more sessions today")).toBeTruthy();
    expect(
      screen.getByText(
        "1 task still waiting. Unfinished work continues in your next available study period.",
      ),
    ).toBeTruthy();

    await fireEvent.press(screen.getByText("View schedule"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/(plan)");
  });
});

// ─── K11. Loading and error ───

describe("Today loading and error", () => {
  it("shows the spinner while loading", async () => {
    setDashboard({ data: null, isLoading: true });

    const { toJSON } = await render(<Today />);

    expect(JSON.stringify(toJSON())).toContain("ActivityIndicator");
    expect(screen.queryByText("Could not load dashboard")).toBeNull();
  });

  it("offers a retry when the dashboard is missing", async () => {
    setDashboard({ data: null, isLoading: false });

    await render(<Today />);

    expect(screen.getByText("Could not load dashboard.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Retry"));
    expect(mockRefetch).toHaveBeenCalled();
  });
});

// ─── K12. Routing ───

describe("Today routing", () => {
  it("Start Focus Session routes to the exact session", async () => {
    const dashboard = makeDashboard({
      sessions: [makeSession("item-1", "15:20", "16:00", 12)],
    });
    setDashboard({ data: dashboard });

    await render(<Today />);

    expect(screen.getByText("Start Focus Session")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("recommended-next-start"));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/(app)/(today)/focus",
      params: expect.objectContaining({
        sessionId: "item-1:s1",
        backlogItemId: "item-1",
        startTime: "15:20",
        endTime: "16:00",
      }),
    });
  });
});

// ─── K13. Notification scheduler ───

describe("Today notification scheduler", () => {
  it("mounts the scheduler exactly once per Today mount", async () => {
    setDashboard({
      data: makeDashboard({
        sessions: [makeSession("item-1", "15:20", "16:00", 0)],
      }),
    });

    await render(<Today />);

    expect(useNotificationScheduler).toHaveBeenCalledTimes(1);
  });
});

// ─── K14. First-run simplified mode ───

describe("Today first-run mode", () => {
  it("keeps the recommendation and defers secondary analytics", async () => {
    setDashboard({
      data: makeDashboard({
        sessions: [makeSession("item-1", "15:20", "16:00", 0)],
        studyDays: 0,
        completedMinutes: 0,
      }),
    });

    await render(<Today />);

    expect(screen.getByText("Chapter item-1 questions")).toBeTruthy();
    expect(screen.getByText(/Start (Focus|Next) Session/)).toBeTruthy();
    expect(screen.queryByText("Progress")).toBeNull();
    expect(screen.queryByText("Momentum")).toBeNull();
    expect(screen.queryByText("Backlog Health")).toBeNull();
    expect(screen.queryByText("Study Balance")).toBeNull();
  });

  it("still shows secondary analytics for an established student", async () => {
    setDashboard({
      data: makeDashboard({
        sessions: [makeSession("item-1", "15:20", "16:00", 0)],
        studyDays: 3,
        completedMinutes: 25,
      }),
    });

    await render(<Today />);

    expect(screen.getByText("Progress")).toBeTruthy();
    expect(screen.getByText("Momentum")).toBeTruthy();
    expect(screen.getByText("Backlog Health")).toBeTruthy();
    expect(screen.getByText("Study Balance")).toBeTruthy();
  });
});
