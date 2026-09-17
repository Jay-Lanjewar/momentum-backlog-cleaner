/**
 * Tests for focus screen deep-link behavior.
 *
 * When a notification is tapped, focus opens with only sessionId/backlogItemId
 * in the URL query params. The screen must resolve full session data from
 * the dashboard cache and display the focus timer.
 */

import { render, screen, cleanup } from "@testing-library/react-native";

const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useLocalSearchParams: jest.fn(),
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    back: jest.fn(),
  }),
}));

jest.mock("expo-keep-awake", () => ({
  useKeepAwake: jest.fn(),
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children, ...props }: any) =>
    require("react").createElement("SafeAreaView", props, children),
}));

jest.mock("react-native-svg", () => {
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: View,
    Circle: View,
  };
});

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  NotificationFeedbackType: {
    Success: "success",
    Error: "error",
    Warning: "warning",
  },
}));

jest.mock("@/hooks/useFocusLock", () => ({
  useFocusLock: () => ({
    phase: "focusing",
    focusedElapsedMs: 0,
    remainingMs: 25 * 60 * 1000,
    pause: jest.fn(),
    resume: jest.fn(),
    complete: jest.fn(),
  }),
}));

const mockMutate = jest.fn();
jest.mock("@/services/hooks", () => ({
  useCompleteSession: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
  useDashboard: jest.fn(),
}));

jest.mock("@/services/notifications", () => ({
  cancelSessionNotifications: jest.fn(),
  showPlanChangedNotification: jest.fn(),
}));

jest.mock("@/lib/coaching", () => ({
  formatHourMinute: (time: string) => (time ? time : "--:--"),
  formatTimeRange: (s: string, e: string) => `${s}–${e}`,
  formatMinutes: (m: number) => `${m} min`,
  focusCoachMessage: () => "Keep going!",
  topicFromSession: (s: any) => s.reason?.replace(/^Work on\s+/, "") ?? "",
  nextSessionAfter: () => null,
  parseTimeToMinutes: (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  },
}));

jest.mock("@/components/adaptive/AdaptiveTimelineBar", () => ({
  AdaptiveTimelineBar: () => null,
  computeTimelineBounds: () => ({ min: 0, max: 100 }),
}));

jest.mock("@/components/adaptive/AdaptiveSessionLegend", () => ({
  AdaptiveSessionLegend: () => null,
}));

jest.mock("@/components/adaptive/AdaptiveChangeGroup", () => ({
  AdaptiveChangeGroup: () => null,
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

const mockSession = {
  session_id: "sess-deeplink",
  backlog_item_id: "bl-deeplink",
  start_time: "14:00",
  end_time: "14:30",
  reason: "Work on Chemistry",
  remaining_minutes: 30,
};

const mockDashboard = {
  plan: {
    plan: {
      sessions: [mockSession],
      daily_message: "You got this!",
    },
    snapshot_id: "snap-dl",
  },
};

describe("Focus deep-link from notification", () => {
  it("shows redirect screen when no session info provided", async () => {
    const { useLocalSearchParams } = require("expo-router");
    const { useDashboard } = require("@/services/hooks");
    useLocalSearchParams.mockReturnValue({});
    useDashboard.mockReturnValue({ data: null, isLoading: false });

    const FocusModeScreen = require("@/app/(app)/(today)/focus").default;
    await render(<FocusModeScreen />);

    expect(screen.getByText(/Session not found/)).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("resolves session from dashboard when only sessionId provided", async () => {
    const { useLocalSearchParams } = require("expo-router");
    const { useDashboard } = require("@/services/hooks");
    useLocalSearchParams.mockReturnValue({
      sessionId: "sess-deeplink",
      backlogItemId: "bl-deeplink",
    });
    useDashboard.mockReturnValue({ data: mockDashboard, isLoading: false });

    const FocusModeScreen = require("@/app/(app)/(today)/focus").default;
    await render(<FocusModeScreen />);

    expect(screen.getByText("Work on Chemistry")).toBeTruthy();
    expect(screen.getByText("14:00 – 14:30")).toBeTruthy();
  });

  it("uses direct params when all provided (normal in-app flow)", async () => {
    const { useLocalSearchParams } = require("expo-router");
    const { useDashboard } = require("@/services/hooks");
    useLocalSearchParams.mockReturnValue({
      sessionId: "sess-direct",
      backlogItemId: "bl-direct",
      startTime: "09:00",
      endTime: "09:30",
      reason: "Work on Physics",
      remainingMinutes: "25",
      sessions: "[]",
      snapshotId: "snap-1",
      dailyMessage: "Good luck!",
      userName: "Alex",
    });
    useDashboard.mockReturnValue({ data: null, isLoading: false });

    const FocusModeScreen = require("@/app/(app)/(today)/focus").default;
    await render(<FocusModeScreen />);

    expect(screen.getByText("Work on Physics")).toBeTruthy();
    expect(screen.getByText("09:00 – 09:30")).toBeTruthy();
    expect(screen.getByText(/Alex/)).toBeTruthy();
  });

  it("shows redirect when sessionId provided but session not in dashboard", async () => {
    const { useLocalSearchParams } = require("expo-router");
    const { useDashboard } = require("@/services/hooks");
    useLocalSearchParams.mockReturnValue({
      sessionId: "sess-nonexistent",
      backlogItemId: "bl-nonexistent",
    });
    useDashboard.mockReturnValue({ data: mockDashboard, isLoading: false });

    const FocusModeScreen = require("@/app/(app)/(today)/focus").default;
    await render(<FocusModeScreen />);

    expect(screen.getByText(/Session not found/)).toBeTruthy();
  });
});
