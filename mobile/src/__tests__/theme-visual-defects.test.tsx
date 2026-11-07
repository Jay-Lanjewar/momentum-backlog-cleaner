import React from "react";
import { StyleSheet } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { getThemeColors } from "@/theme/tokens";
import { usePreferencesStore } from "@/store/usePreferencesStore";
import { getCurrentDayName } from "@/lib/schedule";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children, ...props }: any) =>
    require("react").createElement("SafeAreaView", props, children),
}));

jest.mock("@/hooks/useNotificationScheduler", () => ({
  useNotificationScheduler: jest.fn(),
}));

jest.mock("@/services/dashboardPreview", () => ({
  loadDashboardPreview: jest.fn().mockReturnValue(null),
  saveDashboardPreview: jest.fn(),
}));

jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1", name: "Ada" },
    isLoading: false,
    logout: jest.fn(),
  }),
}));

jest.mock("@/store/useAuthStore", () => ({
  useAuthStore: (selector: (state: { logoutInProgress: boolean }) => unknown) =>
    selector({ logoutInProgress: false }),
}));

jest.mock("@/components/BacklogForm", () => ({
  BacklogForm: () => null,
}));

let mockDashboard: any;
let mockItems: any[];
let mockGoals: any[];
let mockSchedule: any;

jest.mock("@/services/hooks", () => ({
  useDashboard: () => ({
    data: mockDashboard,
    isLoading: false,
    isFetching: false,
    isFetchedAfterMount: true,
    isSuccess: true,
    error: null,
    dashboardScope: { userId: "user-1", localDate: "", timezone: "" },
    refetch: jest.fn(),
    isRefetching: false,
  }),
  useBacklogItems: () => ({
    data: mockItems,
    isLoading: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
  useCourses: () => ({ data: [], isLoading: false }),
  useCreateBacklogItem: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateBacklogItem: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useGoals: () => ({ data: mockGoals, isLoading: false, isRefetching: false, refetch: jest.fn() }),
  useCreateGoal: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateGoal: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeleteGoal: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useWeeklySchedule: () => ({ data: mockSchedule, isLoading: false, isError: false, refetch: jest.fn() }),
  useSaveWeeklySchedule: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

const Today = require("@/app/(app)/(today)/index").default;
const Work = require("@/app/(app)/(work)/index").default;
const Goals = require("@/app/(app)/(work)/goals").default;
const Plan = require("@/app/(app)/(plan)/schedule").default;

function resetTheme(appearance: "light" | "dark", accent: "emerald" | "rose") {
  usePreferencesStore.setState({
    appearance,
    accent,
    hydrationStatus: "ready",
  });
}

beforeEach(() => {
  mockItems = [
    {
      id: "item-1",
      title: "Physics",
      course_id: "course-1",
      status: "pending",
      priority: 2,
      due_date: null,
      estimated_minutes: 30,
    },
  ];
  mockGoals = [{ id: "goal-1", title: "Finish project", description: null, target_date: null, category: null }];
  const today = getCurrentDayName();
  mockSchedule = {
    schedule: {
      [today]: [{ type: "school", start: "09:00", end: "10:00", title: "Maths" }],
    },
  };
  mockDashboard = {
    planning: {
      prioritized_backlog: [
        {
          id: "item-1",
          title: "Physics",
          course_id: "course-1",
          course_name: "Physics",
          course_color: "#8B5CF6",
          priority: 2,
          due_date: null,
          overdue: false,
          status: "pending",
        },
      ],
      backlog_health: { health_score: "good", total_items: 1, pending_items: 1, completed_items: 0 },
      total_available_minutes: 60,
    },
    plan: {
      plan: {
        sessions: [{
          session_id: "session-1",
          backlog_item_id: "item-1",
          start_time: "18:00",
          end_time: "18:30",
          reason: "Physics",
          remaining_minutes: 30,
        }],
        daily_message: "Planned summary",
        overflow: [],
      },
      snapshot_id: "snapshot-1",
    },
    today_completed_minutes: 10,
    streaks: { momentum: { total_study_days: 1, current_streak: 1, longest_streak: 1, recovery_tokens_current: 1, recovery_tokens_used: 0 }, subjects: [] },
    balance: { score: 80, message: "", neglected_subjects: [] },
    insight: { title: "Keep going", message: "A little progress adds up." },
  };
  resetTheme("dark", "emerald");
});

it.each(["light", "dark"] as const)("themes the Today motivational card in %s mode", async (mode) => {
  resetTheme(mode, "rose");
  await render(<Today />);
  const colors = getThemeColors(mode, "rose");
  expect(StyleSheet.flatten(screen.getByTestId("today-insight-card").props.style)).toEqual(
    expect.objectContaining({ backgroundColor: colors.card, borderColor: colors.border }),
  );
  expect(StyleSheet.flatten(screen.getByText("Keep going").props.style)).toEqual(
    expect.objectContaining({ color: colors.primaryText }),
  );
  expect(StyleSheet.flatten(screen.getByText("A little progress adds up.").props.style)).toEqual(
    expect.objectContaining({ color: colors.secondaryText }),
  );
});

it.each(["dark", "light"] as const)("themes Work selected filters and border in %s mode", async (mode) => {
  resetTheme(mode, mode === "dark" ? "emerald" : "rose");
  await render(<Work />);
  const colors = getThemeColors(mode, mode === "dark" ? "emerald" : "rose");
  expect(StyleSheet.flatten(screen.getByTestId("work-filter-bar").props.style)).toEqual(
    expect.objectContaining({ borderColor: colors.tabBarBorder }),
  );
  expect(StyleSheet.flatten(screen.getByTestId("work-filter-all").props.style)).toEqual(
    expect.objectContaining({ backgroundColor: colors.accentSoft }),
  );
  expect(StyleSheet.flatten(screen.getByTestId("work-section-tab-backlog").props.style)).toEqual(
    expect.objectContaining({ backgroundColor: colors.accentSoft }),
  );
});

it.each(["light", "dark"] as const)("themes Goals active and achieved selections in %s mode", async (mode) => {
  resetTheme(mode, "rose");
  await render(<Goals />);
  const colors = getThemeColors(mode, "rose");
  expect(StyleSheet.flatten(screen.getByTestId("goals-tab-active").props.style)).toEqual(
    expect.objectContaining({ backgroundColor: colors.accentSoft }),
  );
  await fireEvent.press(screen.getByTestId("goals-tab-achieved"));
  expect(StyleSheet.flatten(screen.getByTestId("goals-tab-achieved").props.style)).toEqual(
    expect.objectContaining({ backgroundColor: colors.accentSoft }),
  );
});

it.each(["light", "dark"] as const)("themes Plan day and planned accents in %s mode", async (mode) => {
  resetTheme(mode, mode === "light" ? "rose" : "emerald");
  await render(<Plan />);
  const accent = mode === "light" ? "rose" : "emerald";
  const colors = getThemeColors(mode, accent);
  expect(StyleSheet.flatten(screen.getByTestId("schedule-day-bar").props.style)).toEqual(
    expect.objectContaining({ backgroundColor: colors.tabBar, borderColor: colors.tabBarBorder }),
  );
  expect(StyleSheet.flatten(screen.getByTestId(`schedule-day-${getCurrentDayName()}`).props.style)).toEqual(
    expect.objectContaining({ backgroundColor: colors.accentSoft }),
  );
  expect(StyleSheet.flatten(screen.getByTestId("schedule-day-title").props.style)).toEqual(
    expect.objectContaining({ color: colors.primaryText }),
  );
  expect(StyleSheet.flatten(screen.getByTestId("schedule-plan-summary").props.style)).toEqual(
    expect.objectContaining({ color: colors.accentText }),
  );
  expect(StyleSheet.flatten(screen.getByTestId("schedule-plan-time-session-1").props.style)).toEqual(
    expect.objectContaining({ color: colors.accentText }),
  );
});
