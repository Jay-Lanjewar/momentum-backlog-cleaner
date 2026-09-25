/**
 * Progress Retry (final Android UX audit must-fix).
 *
 * 1. Initial load failure shows a clear error + Retry action.
 * 2. Retry re-runs the failed fetch (refetch) and shows the loading state.
 * 3. Successful Retry restores the normal Progress UI.
 * 4. Duplicate Retry taps while a retry is in flight issue only one request.
 * 5. Successful initial load behavior is unchanged.
 */

import React from "react";
import { render, screen, act } from "@testing-library/react-native";

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children, ...props }: any) =>
    require("react").createElement("SafeAreaView", props, children),
}));

const mockRefetch = jest.fn();
let mockProgressResult: {
  data?: any;
  isLoading?: boolean;
  isRefetching?: boolean;
} = {};

jest.mock("@/services/hooks", () => ({
  useAnalyticsProgress: jest.fn(),
  useDashboard: jest.fn(),
}));

const ProgressScreen = require("@/app/(app)/(progress)/index").default;
const { useAnalyticsProgress, useDashboard } = require("@/services/hooks");

function makeProgress() {
  const day = (date: string, study_minutes: number, sessions: number) => ({
    date,
    study_minutes,
    sessions_completed: sessions,
  });
  return {
    today: {
      study_minutes: 90,
      sessions_completed: 3,
      estimated_minutes: 120,
    },
    week: {
      daily: [
        day("2026-09-21", 30, 1),
        day("2026-09-22", 60, 2),
        day("2026-09-23", 0, 0),
        day("2026-09-24", 45, 1),
        day("2026-09-25", 0, 0),
        day("2026-09-26", 0, 0),
        day("2026-09-27", 75, 3),
      ],
      total_study_minutes: 210,
      total_sessions: 7,
      total_estimated_minutes: 300,
    },
    subjects: [],
    streaks: {
      current: 2,
      best: 10,
      total_study_days: 5,
      milestones: [],
    },
  };
}

function setProgress(result: {
  data?: any;
  isLoading?: boolean;
  isRefetching?: boolean;
}) {
  mockProgressResult = { isRefetching: false, ...result };
}

function findOnPress(instance: any): () => void {
  let fiber = instance.unstable_fiber;
  while (fiber) {
    const props = fiber.memoizedProps;
    if (props && typeof props.onPress === "function") return props.onPress;
    fiber = fiber.return;
  }
  throw new Error("onPress handler not found");
}

beforeEach(() => {
  jest.clearAllMocks();
  mockProgressResult = { data: null, isLoading: false, isRefetching: false };

  (useAnalyticsProgress as jest.Mock).mockImplementation(() => ({
    data: mockProgressResult.data ?? null,
    isLoading: mockProgressResult.isLoading ?? false,
    isRefetching: mockProgressResult.isRefetching ?? false,
    refetch: mockRefetch,
  }));
  (useDashboard as jest.Mock).mockReturnValue({ data: null });
});

describe("Progress failure recovery (Retry)", () => {
  it("shows the error state with a Retry action on initial load failure", async () => {
    setProgress({ data: null, isLoading: false });

    await render(<ProgressScreen />);

    expect(screen.getByText("Could not load progress data.")).toBeTruthy();
    expect(screen.getByText("Retry")).toBeTruthy();
  });

  it("Retry re-runs the failed fetch and shows the loading state while in flight", async () => {
    setProgress({ data: null, isLoading: false });
    let resolveRefetch!: () => void;
    mockRefetch.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRefetch = resolve;
        }),
    );

    await render(<ProgressScreen />);
    const onPress = findOnPress(screen.getByText("Retry"));
    await act(async () => {
      void onPress();
    });

    expect(mockRefetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Could not load progress data.")).toBeNull();
    expect(screen.queryByText("Retry")).toBeNull();
    expect(screen.queryByText("Progress")).toBeNull();
    expect(JSON.stringify(screen.toJSON())).toContain("ActivityIndicator");

    await act(async () => {
      resolveRefetch();
    });
  });

  it("successful Retry restores the normal Progress UI", async () => {
    setProgress({ data: null, isLoading: false });
    let resolveRefetch!: () => void;
    mockRefetch.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRefetch = resolve;
        }),
    );

    await render(<ProgressScreen />);
    const onPress = findOnPress(screen.getByText("Retry"));
    await act(async () => {
      void onPress();
    });

    expect(mockRefetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Progress")).toBeNull();

    await act(async () => {
      setProgress({ data: makeProgress() });
      resolveRefetch();
    });

    expect(screen.queryByText("Could not load progress data.")).toBeNull();
    expect(screen.queryByText("Retry")).toBeNull();
    expect(screen.getByText("Progress")).toBeTruthy();
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByText("This Week")).toBeTruthy();
  });

  it("duplicate Retry taps while in flight issue only one request", async () => {
    setProgress({ data: null, isLoading: false });
    mockRefetch.mockImplementation(() => new Promise(() => {}));

    await render(<ProgressScreen />);
    const onPress = findOnPress(screen.getByText("Retry"));
    await act(async () => {
      void onPress();
      void onPress();
    });

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("successful initial load renders the normal Progress UI unchanged", async () => {
    setProgress({ data: makeProgress() });

    await render(<ProgressScreen />);

    expect(screen.queryByText("Could not load progress data.")).toBeNull();
    expect(screen.queryByText("Retry")).toBeNull();
    expect(screen.getByText("Progress")).toBeTruthy();
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByText("This Week")).toBeTruthy();
    expect(screen.getByText("Streaks")).toBeTruthy();
    expect(mockRefetch).not.toHaveBeenCalled();
  });
});
