/**
 * First-run flow tests: simplified onboarding (backlog → confirm → submit)
 * + AuthGate routing.
 *
 * RNTL v14: render() and fireEvent.* return promises and must be awaited.
 */

import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { Alert } from "react-native";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    back: mockBack,
  }),
  useSegments: () => mockSegments,
  Slot: () => null,
}));

jest.mock("react-native-safe-area-context", () => {
  const R = require("react");
  return {
    SafeAreaView: ({ children, ...props }: any) =>
      R.createElement("SafeAreaView", props, children),
  };
});

const mockPost = jest.fn();
const mockGet = jest.fn();

jest.mock("@/lib/api", () => ({
  api: {
    post: (...args: any[]) => mockPost(...args),
    get: (...args: any[]) => mockGet(...args),
  },
}));

const mockPrefetchQuery = jest.fn().mockResolvedValue(undefined);

jest.mock("@tanstack/react-query", () => {
  const actual = jest.requireActual("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: () => ({
      prefetchQuery: (...args: any[]) => mockPrefetchQuery(...args),
      invalidateQueries: jest.fn(),
      getQueryData: jest.fn(),
      setQueryData: jest.fn(),
    }),
  };
});

const mockSetUser = jest.fn();
const mockSetConfirming = jest.fn();

jest.mock("@/store/useAuthStore", () => {
  const useAuthStore = (selector: any) =>
    selector({
      setUser: mockSetUser,
      setConfirming: mockSetConfirming,
      confirming: (globalThis as any).__mockConfirmingRef?.value ?? false,
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  useAuthStore.getState = () => ({
    setUser: mockSetUser,
    setConfirming: mockSetConfirming,
    confirming: (globalThis as any).__mockConfirmingRef?.value ?? false,
    user: null,
    isAuthenticated: false,
    isLoading: false,
  });
  useAuthStore.setState = jest.fn();
  return { useAuthStore };
});

const mockConfirmingRef = { value: false };
(globalThis as any).__mockConfirmingRef = mockConfirmingRef;

let mockSegments: string[] = ["(app)", "(today)"];
let mockIsAuthenticated = true;
let mockIsLoading = false;
let mockUser: any = null;

jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
    isAuthenticated: mockIsAuthenticated,
    isLoading: mockIsLoading,
    login: jest.fn(),
    logout: jest.fn(),
    setConfirming: mockSetConfirming,
  }),
}));

jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}));

jest.mock("expo-notifications", () => ({
  getLastNotificationResponse: () => null,
  addNotificationResponseReceivedListener: () => ({ remove: jest.fn() }),
}));

jest.mock("expo-status-bar", () => ({
  StatusBar: () => null,
}));

jest.mock("@/services/notifications", () => ({
  setNotificationHandler: jest.fn(),
  createNotificationChannels: jest.fn(),
}));

jest.mock("@react-native-community/datetimepicker", () => {
  const R = require("react");
  const { View } = require("react-native");
  const MockDateTimePicker = (props: any) =>
    R.createElement(View, {
      testID: props.testID,
      onChange: props.onChange,
      onValueChange: props.onValueChange,
    });
  return { __esModule: true, default: MockDateTimePicker };
});

const OnboardingScreen = require("@/app/(onboarding)/index").default;
const RootLayout = require("@/app/_layout").default;

function makeProfileUser() {
  return {
    id: "user-1",
    email: "test@example.com",
    name: "Test",
    avatar_url: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    profile: {
      id: "p1",
      user_id: "user-1",
      name: "Test",
      class_name: "Student",
      board: null,
      school_timings: null,
      coaching_timings: null,
      sleep_schedule: null,
      energy_peak: null,
      preferred_study_window: null,
      daily_target_minutes: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    streak: null,
  };
}

function makeNoProfileUser() {
  return {
    id: "user-2",
    email: "new@example.com",
    name: null,
    avatar_url: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    profile: null,
    streak: null,
  };
}

async function interpretBacklog(text: string) {
  await fireEvent.changeText(screen.getByTestId("backlog-input"), text);
  await fireEvent.press(screen.getByText("Interpret tasks"));
}

async function enterBacklog() {
  await interpretBacklog("Physics\nMotion");
}

async function enterMultiGroupBacklog() {
  await interpretBacklog("Physics\nMotion\n\nMaths\nTriangles");
}

async function continueToAvailability() {
  await fireEvent.press(screen.getByTestId("review-continue"));
}

async function reachAvailability() {
  await enterBacklog();
  await continueToAvailability();
  expect(screen.getByText("When are you busy?")).toBeTruthy();
}

async function reachConfirmation() {
  await reachAvailability();
  await fireEvent.press(screen.getByText("Continue"));
  expect(screen.getByText("Here's what I understood")).toBeTruthy();
}

function mockAlertSpy() {
  return jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrefetchQuery.mockResolvedValue(undefined);
  mockSegments = ["(app)", "(today)"];
  mockIsAuthenticated = true;
  mockIsLoading = false;
  mockConfirmingRef.value = false;
  mockUser = null;
});

describe("Onboarding simplified first-run flow", () => {
  it("shows backlog input on launch (no Welcome step)", async () => {
    await render(<OnboardingScreen />);

    expect(screen.getByText("What do you need to get done?")).toBeTruthy();
    expect(screen.queryByText("Welcome to Momentum")).toBeNull();
    expect(screen.queryByText("Get Started")).toBeNull();
  });

  it("does not ask for name, exams, or weekday type", async () => {
    await render(<OnboardingScreen />);

    expect(screen.queryByText("What's your name?")).toBeNull();
    expect(screen.queryByText("Any exam deadlines?")).toBeNull();
    expect(screen.queryByText("What does your weekday look like?")).toBeNull();
    expect(screen.queryByText("School only")).toBeNull();
    expect(screen.queryByPlaceholderText("Your name")).toBeNull();
    expect(screen.queryByText("Your name")).toBeNull();
  });

  it("interprets backlog, asks availability, then shows confirmation", async () => {
    await render(<OnboardingScreen />);

    await enterMultiGroupBacklog();

    expect(screen.getByText("Here's what Momentum understood")).toBeTruthy();
    expect(screen.queryByText("When are you busy?")).toBeNull();

    await continueToAvailability();

    expect(screen.getByText("When are you busy?")).toBeTruthy();
    expect(screen.queryByText("Here's what I understood")).toBeNull();

    await fireEvent.press(screen.getByText("Continue"));

    expect(screen.getByText("Here's what I understood")).toBeTruthy();
    expect(screen.getByText("Physics")).toBeTruthy();
    expect(screen.getByText("Maths")).toBeTruthy();
    expect(screen.getAllByText("1 topic")).toHaveLength(2);
    expect(screen.getByText("Looks correct")).toBeTruthy();
    expect(screen.getByText("Edit")).toBeTruthy();
  });

  it("Edit returns to task review", async () => {
    await render(<OnboardingScreen />);
    await reachConfirmation();

    await fireEvent.press(screen.getByText("Edit"));

    expect(screen.getByText("Here's what Momentum understood")).toBeTruthy();
    expect(screen.queryByText("Here's what I understood")).toBeNull();

    await fireEvent.press(screen.getByTestId("review-back"));

    expect(screen.getByText("What do you need to get done?")).toBeTruthy();
  });

  it("confirmation triggers onboarding POST exactly once", async () => {
    mockPost.mockResolvedValue({ data: { ok: true }, error: null, errorCode: null });
    mockGet.mockResolvedValue({ data: makeProfileUser(), error: null, errorCode: null });

    await render(<OnboardingScreen />);
    await reachConfirmation();

    await fireEvent.press(screen.getByText("Looks correct"));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledTimes(1);
    });
    expect(mockPost).toHaveBeenCalledWith(
      "/api/v1/onboarding",
      expect.any(Object),
    );
  });

  it("prevents duplicate submission while request is in progress", async () => {
    let resolvePost!: (value: any) => void;
    mockPost.mockImplementation(
      () => new Promise((r) => { resolvePost = r; }),
    );
    mockGet.mockResolvedValue({ data: makeProfileUser(), error: null, errorCode: null });

    await render(<OnboardingScreen />);
    await reachConfirmation();

    const confirmBtn = screen.getByText("Looks correct");
    await fireEvent.press(confirmBtn);
    await fireEvent.press(confirmBtn);
    await fireEvent.press(confirmBtn);

    expect(mockPost).toHaveBeenCalledTimes(1);

    resolvePost({ data: { ok: true }, error: null, errorCode: null });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(app)");
    });
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it("payload satisfies backend OnboardingRequest contract", async () => {
    mockPost.mockResolvedValue({ data: { ok: true }, error: null, errorCode: null });
    mockGet.mockResolvedValue({ data: makeProfileUser(), error: null, errorCode: null });

    await render(<OnboardingScreen />);
    await enterMultiGroupBacklog();
    await continueToAvailability();
    await fireEvent.press(screen.getByText("Continue"));
    expect(screen.getByText("Here's what I understood")).toBeTruthy();
    await fireEvent.press(screen.getByText("Looks correct"));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    const [, payload] = mockPost.mock.calls[0];

    // courses + backlog derived from the interpreted drafts
    expect(payload.courses).toEqual([
      { name: "Physics", color: expect.stringMatching(/^#[0-9a-fA-F]{6}$/) },
      { name: "Maths", color: expect.stringMatching(/^#[0-9a-fA-F]{6}$/) },
    ]);
    expect(payload.backlog).toEqual([
      {
        title: "Motion",
        course_index: 0,
        priority: 3,
        estimated_minutes: null,
      },
      {
        title: "Triangles",
        course_index: 1,
        priority: 3,
        estimated_minutes: null,
      },
    ]);

    // first-run: no exam goals
    expect(payload.goals).toEqual([]);

    // default profile (no user-specific commitments)
    expect(payload.profile).toEqual({
      sleep_schedule: { start: "22:00", end: "06:00" },
      energy_peak: "morning",
      preferred_study_window: { earliest_start: "16:00", latest_end: "22:00" },
      daily_target_minutes: 120,
      class_name: "Student",
    });

    // default Mon–Fri school schedule
    expect(payload.schedule).toEqual({
      schedule: {
        monday: [{ type: "school", start: "08:00", end: "15:00" }],
        tuesday: [{ type: "school", start: "08:00", end: "15:00" }],
        wednesday: [{ type: "school", start: "08:00", end: "15:00" }],
        thursday: [{ type: "school", start: "08:00", end: "15:00" }],
        friday: [{ type: "school", start: "08:00", end: "15:00" }],
      },
    });

    // course_index must reference an existing course (backend 400 guard)
    const courseCount = payload.courses.length;
    for (const item of payload.backlog) {
      expect(item.course_index).toBeGreaterThanOrEqual(0);
      expect(item.course_index).toBeLessThan(courseCount);
      expect(item.title.length).toBeGreaterThan(0);
    }
  });

  it("successful onboarding reaches authenticated app (Today flow)", async () => {
    mockPost.mockResolvedValue({ data: { ok: true }, error: null, errorCode: null });
    mockGet.mockResolvedValue({ data: makeProfileUser(), error: null, errorCode: null });

    await render(<OnboardingScreen />);
    await reachConfirmation();
    await fireEvent.press(screen.getByText("Looks correct"));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(app)");
    });
    expect(mockSetUser).toHaveBeenCalledWith(makeProfileUser());
    expect(mockGet).toHaveBeenCalledWith("/api/v1/auth/me");
  });

  it("successful onboarding prefetches dashboard after authenticated POST", async () => {
    mockPost.mockResolvedValue({ data: { ok: true }, error: null, errorCode: null });
    mockGet.mockResolvedValue({ data: makeProfileUser(), error: null, errorCode: null });

    await render(<OnboardingScreen />);
    await reachConfirmation();
    await fireEvent.press(screen.getByText("Looks correct"));

    await waitFor(() => {
      expect(mockPrefetchQuery).toHaveBeenCalledTimes(1);
    });

    const prefetchArgs = mockPrefetchQuery.mock.calls[0][0];
    expect(prefetchArgs.queryKey).toEqual(["dashboard"]);
    expect(typeof prefetchArgs.queryFn).toBe("function");

    // Prefetch only after onboarding POST (authenticated session ready)
    expect(mockPost).toHaveBeenCalledTimes(1);
    const postOrder = mockPost.mock.invocationCallOrder[0];
    const prefetchOrder = mockPrefetchQuery.mock.invocationCallOrder[0];
    expect(prefetchOrder).toBeGreaterThan(postOrder);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(app)");
    });
  });

  it("does not prefetch dashboard before onboarding POST succeeds", async () => {
    let resolvePost!: (value: any) => void;
    mockPost.mockImplementation(
      () => new Promise((r) => { resolvePost = r; }),
    );
    mockGet.mockResolvedValue({ data: makeProfileUser(), error: null, errorCode: null });

    await render(<OnboardingScreen />);
    await reachConfirmation();
    await fireEvent.press(screen.getByText("Looks correct"));

    await waitFor(() => {
      expect(screen.getByText("Saving your work...")).toBeTruthy();
    });
    expect(mockPrefetchQuery).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();

    resolvePost({ data: { ok: true }, error: null, errorCode: null });

    await waitFor(() => {
      expect(mockPrefetchQuery).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("Building your plan...")).toBeTruthy();
  });

  it("overlaps auth/me with dashboard prefetch after POST success", async () => {
    mockPost.mockResolvedValue({ data: { ok: true }, error: null, errorCode: null });

    let resolveMe!: (value: any) => void;
    let resolvePrefetch!: (value: any) => void;
    mockGet.mockImplementation(
      () => new Promise((r) => { resolveMe = r; }),
    );
    mockPrefetchQuery.mockImplementation(
      () => new Promise((r) => { resolvePrefetch = r; }),
    );

    await render(<OnboardingScreen />);
    await reachConfirmation();
    await fireEvent.press(screen.getByText("Looks correct"));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith("/api/v1/auth/me");
      expect(mockPrefetchQuery).toHaveBeenCalledTimes(1);
    });

    // Both in flight before either finishes → overlapped
    expect(mockReplace).not.toHaveBeenCalled();

    resolvePrefetch(undefined);
    resolveMe({ data: makeProfileUser(), error: null, errorCode: null });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(app)");
    });
  });

  it("does not prefetch dashboard when onboarding POST fails", async () => {
    mockPost.mockResolvedValue({
      data: null,
      error: "Something went wrong",
      errorCode: null,
    });

    await render(<OnboardingScreen />);
    await reachConfirmation();
    await fireEvent.press(screen.getByText("Looks correct"));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    expect(mockPrefetchQuery).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalledWith("/(app)");
  });

  it("uses honest loading copy only", async () => {
    mockPost.mockResolvedValue({ data: { ok: true }, error: null, errorCode: null });
    mockGet.mockResolvedValue({ data: makeProfileUser(), error: null, errorCode: null });

    await render(<OnboardingScreen />);
    await reachConfirmation();

    const fs = require("fs");
    const path = require("path");
    const content = fs.readFileSync(
      path.resolve(__dirname, "../app/(onboarding)/index.tsx"),
      "utf-8",
    );
    expect(content).toContain("Saving your work...");
    expect(content).toContain("Building your plan...");
    expect(content).not.toContain("Understanding your work");
    expect(content).not.toContain("Organizing subjects");
    expect(content).not.toContain("Planning your study time");
    expect(content).not.toContain("Almost there...");

    await fireEvent.press(screen.getByText("Looks correct"));
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(app)");
    });
  });

  it("handles onboarding POST failure with Alert and returns to confirmation", async () => {
    const alertSpy = mockAlertSpy();
    mockPost.mockResolvedValue({
      data: null,
      error: "Something went wrong",
      errorCode: null,
    });

    await render(<OnboardingScreen />);
    await reachConfirmation();
    await fireEvent.press(screen.getByText("Looks correct"));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith("Error", "Something went wrong");
    });

    expect(mockReplace).not.toHaveBeenCalledWith("/(app)");
    expect(mockPrefetchQuery).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByText("Here's what I understood")).toBeTruthy();
    });
    expect(screen.queryByText(/Saving your work/)).toBeNull();

    alertSpy.mockRestore();
  });

  it("handles thrown network error with Alert and returns to confirmation", async () => {
    const alertSpy = mockAlertSpy();
    mockPost.mockRejectedValue(new Error("Network error"));

    await render(<OnboardingScreen />);
    await reachConfirmation();
    await fireEvent.press(screen.getByText("Looks correct"));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        "Error",
        "Something went wrong. Please try again.",
      );
    });
    expect(mockReplace).not.toHaveBeenCalledWith("/(app)");

    await waitFor(() => {
      expect(screen.getByText("Here's what I understood")).toBeTruthy();
    });

    alertSpy.mockRestore();
  });

  it("onboarding POST succeeds + /me fails → no navigation to empty app", async () => {
    mockPost.mockResolvedValue({ data: { ok: true }, error: null, errorCode: null });
    mockGet.mockResolvedValue({
      data: null,
      error: "Network error",
      errorCode: null,
    });

    await render(<OnboardingScreen />);
    await reachConfirmation();
    await fireEvent.press(screen.getByText("Looks correct"));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByText("Almost there")).toBeTruthy();
    });

    expect(mockReplace).not.toHaveBeenCalledWith("/(app)");
    expect(mockSetUser).not.toHaveBeenCalled();
  });

  it("onboarding retry after /me failure does not duplicate POST", async () => {
    mockPost.mockResolvedValue({ data: { ok: true }, error: null, errorCode: null });
    mockGet
      .mockResolvedValueOnce({
        data: null,
        error: "Network error",
        errorCode: null,
      })
      .mockResolvedValueOnce({
        data: makeProfileUser(),
        error: null,
        errorCode: null,
      });

    await render(<OnboardingScreen />);
    await reachConfirmation();
    await fireEvent.press(screen.getByText("Looks correct"));

    await waitFor(() => {
      expect(screen.getByText("Almost there")).toBeTruthy();
    });
    expect(mockPost).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByText("Retry"));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(app)");
    });
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockSetUser).toHaveBeenCalledWith(makeProfileUser());
  });

  it("onboarding /me failure surface keeps plan saved messaging", async () => {
    mockPost.mockResolvedValue({ data: { ok: true }, error: null, errorCode: null });
    mockGet.mockResolvedValue({
      data: null,
      error: "Network error",
      errorCode: null,
    });

    await render(<OnboardingScreen />);
    await reachConfirmation();
    await fireEvent.press(screen.getByText("Looks correct"));

    await waitFor(() => {
      expect(screen.getByText("Almost there")).toBeTruthy();
    });
    expect(screen.getByText(/Network error/)).toBeTruthy();
    expect(screen.queryByText(/Saving your work/)).toBeNull();
    expect(screen.queryByText("Here's what I understood")).toBeNull();
  });

  it("Interpret tasks is disabled when backlog is empty", async () => {
    await render(<OnboardingScreen />);

    const btn = screen.getByText("Interpret tasks");
    const touchable = btn.parent ?? btn;
    expect(
      touchable.props?.accessibilityState?.disabled ??
        touchable.props?.disabled,
    ).toBe(true);

    await fireEvent.press(btn);
    expect(screen.queryByText("Here's what Momentum understood")).toBeNull();
    expect(screen.getByText("What do you need to get done?")).toBeTruthy();
  });
});

describe("Availability step", () => {
  beforeEach(() => {
    mockPost.mockResolvedValue({
      data: { ok: true },
      error: null,
      errorCode: null,
    });
    mockGet.mockResolvedValue({
      data: makeProfileUser(),
      error: null,
      errorCode: null,
    });
  });

  async function openAvailability() {
    await render(<OnboardingScreen />);
    await interpretBacklog("Physics\nMotion\n\nMaths\nTriangles");
    await continueToAvailability();
    expect(screen.getByText("When are you busy?")).toBeTruthy();
  }

  async function confirmAndSubmit() {
    await fireEvent.press(screen.getByText("Continue"));
    await fireEvent.press(screen.getByText("Looks correct"));
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledTimes(1);
    });
    return mockPost.mock.calls[0][1];
  }

  it("shows the default school block, daily target, and add commitment", async () => {
    await openAvailability();

    expect(
      screen.getByText(
        "Add only what's fixed. Momentum plans study time around it.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("School")).toBeTruthy();
    expect(screen.getByText("8 AM")).toBeTruthy();
    expect(screen.getByText("3 PM")).toBeTruthy();
    expect(screen.getByText("120 min")).toBeTruthy();
    expect(screen.getByTestId("onboarding-add-commitment")).toBeTruthy();

    for (const day of [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
    ]) {
      expect(
        screen.getByTestId(`school-day-${day}`).props.accessibilityState
          ?.selected,
      ).toBe(true);
    }
    expect(
      screen.getByTestId("school-day-saturday").props.accessibilityState
        ?.selected,
    ).toBe(false);
  });

  it("school start and end changes reach the payload", async () => {
    await openAvailability();

    await fireEvent.press(screen.getByTestId("onboarding-school-start"));
    await fireEvent(
      screen.getByTestId("onboarding-school-start-picker"),
      "onChange",
      {},
      new Date(2026, 0, 5, 9, 30),
    );
    await fireEvent.press(screen.getByTestId("onboarding-school-end"));
    await fireEvent(
      screen.getByTestId("onboarding-school-end-picker"),
      "onChange",
      {},
      new Date(2026, 0, 5, 14, 0),
    );

    expect(screen.getByText("9:30 AM")).toBeTruthy();
    expect(screen.getByText("2 PM")).toBeTruthy();

    const payload = await confirmAndSubmit();

    expect(payload.schedule.schedule.monday).toEqual([
      { type: "school", start: "09:30", end: "14:00" },
    ]);
    expect(payload.schedule.schedule.thursday).toEqual([
      { type: "school", start: "09:30", end: "14:00" },
    ]);
    expect(Object.keys(payload.schedule.schedule)).toHaveLength(5);
  });

  it("extra commitment reaches the schedule payload", async () => {
    await openAvailability();

    await fireEvent.press(screen.getByTestId("onboarding-add-commitment"));
    await fireEvent.press(screen.getByText("Sports"));
    await fireEvent.changeText(
      screen.getByPlaceholderText("e.g. Football practice"),
      "Cricket",
    );
    await fireEvent.press(screen.getByText("Save"));

    expect(screen.getByText("Cricket")).toBeTruthy();

    const payload = await confirmAndSubmit();

    expect(payload.schedule.schedule.monday).toEqual([
      { type: "school", start: "08:00", end: "15:00" },
      { type: "sports", start: "16:00", end: "18:00", title: "Cricket" },
    ]);
    expect(payload.schedule.schedule.saturday).toBeUndefined();
    expect(payload.schedule.schedule.friday).toHaveLength(2);
  });

  it("daily target reaches profile.daily_target_minutes", async () => {
    await openAvailability();

    await fireEvent.press(screen.getByTestId("daily-target-increase"));
    expect(screen.getByText("150 min")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("daily-target-decrease"));
    await fireEvent.press(screen.getByTestId("daily-target-decrease"));
    expect(screen.getByText("90 min")).toBeTruthy();

    const payload = await confirmAndSubmit();

    expect(payload.profile.daily_target_minutes).toBe(90);
    expect(payload.profile.sleep_schedule).toEqual({
      start: "22:00",
      end: "06:00",
    });
  });

  it("still submits a valid schedule when every default is accepted", async () => {
    await openAvailability();

    const payload = await confirmAndSubmit();

    expect(Object.keys(payload.schedule.schedule)).toEqual([
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
    ]);
    for (const day of Object.keys(payload.schedule.schedule)) {
      const blocks = payload.schedule.schedule[day];
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toEqual({
        type: "school",
        start: "08:00",
        end: "15:00",
      });
      expect(blocks[0].start < blocks[0].end).toBe(true);
    }
    expect(payload.courses).toEqual([
      {
        name: "Physics",
        color: expect.stringMatching(/^#[0-9a-fA-F]{6}$/),
      },
      {
        name: "Maths",
        color: expect.stringMatching(/^#[0-9a-fA-F]{6}$/),
      },
    ]);
    expect(payload.backlog).toEqual([
      {
        title: "Motion",
        course_index: 0,
        priority: 3,
        estimated_minutes: null,
      },
      {
        title: "Triangles",
        course_index: 1,
        priority: 3,
        estimated_minutes: null,
      },
    ]);
    expect(payload.goals).toEqual([]);
  });

  it("schedule follows only the days left selected", async () => {
    await openAvailability();

    await fireEvent.press(screen.getByTestId("school-day-friday"));
    expect(
      screen.getByTestId("school-day-friday").props.accessibilityState
        ?.selected,
    ).toBe(false);

    const payload = await confirmAndSubmit();

    expect(payload.schedule.schedule.friday).toBeUndefined();
    expect(payload.schedule.schedule.monday).toEqual([
      { type: "school", start: "08:00", end: "15:00" },
    ]);
    expect(Object.keys(payload.schedule.schedule)).toEqual([
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
    ]);
  });

  it("blocks Continue when no fixed commitment remains", async () => {
    await openAvailability();

    for (const day of [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
    ]) {
      await fireEvent.press(screen.getByTestId(`school-day-${day}`));
    }

    expect(
      screen.getByText(
        "Add at least one fixed commitment so Momentum can plan around it.",
      ),
    ).toBeTruthy();

    const btn = screen.getByText("Continue");
    const touchable = btn.parent ?? btn;
    expect(
      touchable.props?.accessibilityState?.disabled ??
        touchable.props?.disabled,
    ).toBe(true);

    await fireEvent.press(btn);
    expect(screen.queryByText("Here's what I understood")).toBeNull();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("availability step has no old weekday-questionnaire UI", async () => {
    await openAvailability();

    expect(screen.queryByText("What does your weekday look like?")).toBeNull();
    expect(screen.queryByText("School only")).toBeNull();
    expect(screen.queryByText("Any exam deadlines?")).toBeNull();
    expect(screen.queryByText("What's your name?")).toBeNull();
    expect(screen.queryByPlaceholderText("Your name")).toBeNull();
    expect(screen.queryByText("Get Started")).toBeNull();
  });

  it("Back returns to task review without losing availability edits", async () => {
    await openAvailability();

    await fireEvent.press(screen.getByTestId("daily-target-increase"));
    await fireEvent.press(screen.getByText("Back"));

    expect(screen.getByText("Here's what Momentum understood")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("review-back"));

    expect(screen.getByText("What do you need to get done?")).toBeTruthy();

    await fireEvent.press(screen.getByText("Interpret tasks"));
    await continueToAvailability();

    expect(screen.getByText("When are you busy?")).toBeTruthy();
    expect(screen.getByText("150 min")).toBeTruthy();
  });
});

describe("Task review step", () => {
  beforeEach(() => {
    mockPost.mockResolvedValue({
      data: { ok: true },
      error: null,
      errorCode: null,
    });
    mockGet.mockResolvedValue({
      data: makeProfileUser(),
      error: null,
      errorCode: null,
    });
  });

  function tomorrowKey(): string {
    const now = new Date(Date.now() + 86_400_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  async function openReview(backlog: string) {
    await render(<OnboardingScreen />);
    await interpretBacklog(backlog);
    expect(screen.getByText("Here's what Momentum understood")).toBeTruthy();
  }

  type OnboardingPayload = {
    courses: { name: string; color: string }[];
    backlog: {
      title: string;
      course_index: number;
      priority: number;
      estimated_minutes: number | null;
      due_date?: string;
      description?: string;
    }[];
  };

  async function finishFromReview(): Promise<OnboardingPayload> {
    await continueToAvailability();
    await fireEvent.press(screen.getByText("Continue"));
    await fireEvent.press(screen.getByText("Looks correct"));
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledTimes(1);
    });
    return mockPost.mock.calls[0][1];
  }

  it("shows one card per task with the interpreted values", async () => {
    await openReview("Physics\nMotion\nGravitation");

    expect(screen.getByTestId("review-card-0")).toBeTruthy();
    expect(screen.getByTestId("review-card-1")).toBeTruthy();
    expect(screen.getByTestId("task-subject-0").props.value).toBe("Physics");
    expect(screen.getByTestId("task-title-0").props.value).toBe("Motion");
    expect(screen.getByTestId("task-title-1").props.value).toBe(
      "Gravitation",
    );
    expect(
      screen.getByTestId("task-est-0-auto").props.accessibilityState
        ?.selected,
    ).toBe(true);
  });

  it("title edits reach the payload", async () => {
    await openReview("Physics\nMotion");
    await fireEvent.changeText(
      screen.getByTestId("task-title-0"),
      "Motion essay",
    );

    const payload = await finishFromReview();

    expect(payload.backlog[0].title).toBe("Motion essay");
  });

  it("due, difficulty and estimate chips reach the payload", async () => {
    await openReview("Physics\nMotion");

    await fireEvent.press(screen.getByTestId("task-due-0-tomorrow"));
    await fireEvent.press(screen.getByTestId("task-difficulty-0-hard"));
    await fireEvent.press(screen.getByTestId("task-est-0-45"));

    expect(
      screen.getByTestId("task-difficulty-0-hard").props.accessibilityState
        ?.selected,
    ).toBe(true);

    const payload = await finishFromReview();

    expect(payload.backlog[0].due_date).toBe(`${tomorrowKey()}T00:00:00`);
    expect(payload.backlog[0].priority).toBe(1);
    expect(payload.backlog[0].estimated_minutes).toBe(45);
  });

  it("keeps the estimate empty when no duration was given", async () => {
    await openReview("Physics read chapter");

    expect(
      screen.getByTestId("task-est-0-auto").props.accessibilityState
        ?.selected,
    ).toBe(true);

    const payload = await finishFromReview();

    expect(payload.backlog[0].estimated_minutes).toBeNull();
  });

  it("notes reach the payload as description", async () => {
    await openReview("Physics worksheet");
    await fireEvent.changeText(
      screen.getByTestId("task-notes-0"),
      "20 questions",
    );

    const payload = await finishFromReview();

    expect(payload.backlog[0].description).toBe("20 questions");
  });

  it("renaming a card subject renames the course", async () => {
    await openReview("Physics\nMotion");
    await fireEvent.changeText(
      screen.getByTestId("task-subject-0"),
      "Mechanics",
    );

    const payload = await finishFromReview();

    expect(payload.courses[0].name).toBe("Mechanics");
  });

  it("clearing the subject falls back to General", async () => {
    await openReview("Physics\nMotion");
    await fireEvent.changeText(screen.getByTestId("task-subject-0"), "");

    const payload = await finishFromReview();

    expect(payload.courses[0].name).toBe("General");
  });

  it("moves a task into another subject", async () => {
    await openReview("Physics\nMotion\n\nMaths\nTriangles");

    await fireEvent.press(screen.getByTestId("task-move-0-Maths"));

    const payload = await finishFromReview();

    expect(payload.courses.map((course) => course.name)).toEqual(["Maths"]);
    expect(payload.backlog.map((item) => item.title)).toEqual([
      "Triangles",
      "Motion",
    ]);
    expect(payload.backlog.map((item) => item.course_index)).toEqual([0, 0]);
  });

  it("blocks continue when a title is blank", async () => {
    await openReview("Physics\nMotion");
    await fireEvent.changeText(screen.getByTestId("task-title-0"), " ");

    expect(
      screen.getByText("Give every task a name to continue."),
    ).toBeTruthy();
    expect(
      screen.getByTestId("review-continue").props.accessibilityState?.disabled,
    ).toBe(true);
  });

  it("blocks continue when every task is deleted", async () => {
    await openReview("Physics\nMotion");

    await fireEvent.press(screen.getByTestId("task-delete-0"));

    expect(
      screen.getByText("Add at least one task to continue."),
    ).toBeTruthy();
    expect(
      screen.getByTestId("review-continue").props.accessibilityState?.disabled,
    ).toBe(true);
  });

  it("adds a new task that must be named before continuing", async () => {
    await openReview("Physics\nMotion");

    await fireEvent.press(screen.getByTestId("add-task"));
    expect(screen.getByTestId("review-card-1")).toBeTruthy();
    expect(
      screen.getByTestId("review-continue").props.accessibilityState?.disabled,
    ).toBe(true);

    await fireEvent.changeText(
      screen.getByTestId("task-title-1"),
      "Lab report",
    );
    expect(
      screen.queryByText("Give every task a name to continue."),
    ).toBeNull();

    const payload = await finishFromReview();

    expect(payload.backlog.map((item) => item.title)).toEqual([
      "Motion",
      "Lab report",
    ]);
  });

  it("keeps review edits when returning from backlog unchanged", async () => {
    await openReview("Physics\nMotion");
    await fireEvent.changeText(
      screen.getByTestId("task-title-0"),
      "Motion essay",
    );

    await fireEvent.press(screen.getByTestId("review-back"));
    await fireEvent.press(screen.getByText("Interpret tasks"));

    expect(screen.getByTestId("task-title-0").props.value).toBe(
      "Motion essay",
    );
  });
});

describe("No references to removed first-run steps", () => {
  const fs = require("fs");
  const path = require("path");
  const content = fs.readFileSync(
    path.resolve(__dirname, "../app/(onboarding)/index.tsx"),
    "utf-8",
  );

  it("does not contain Welcome step copy", () => {
    expect(content).not.toContain("Welcome to Momentum");
    expect(content).not.toContain("Get Started");
  });

  it("does not contain Name step", () => {
    expect(content).not.toContain("What's your name?");
    expect(content).not.toContain("Your name");
    expect(content).not.toContain("charCount");
  });

  it("does not contain Exam deadlines step", () => {
    expect(content).not.toContain("Any exam deadlines?");
    expect(content).not.toContain("examTitle");
    expect(content).not.toContain("examDate");
    expect(content).not.toContain("setExams");
  });

  it("does not contain Weekday type step", () => {
    expect(content).not.toContain("What does your weekday look like?");
    expect(content).not.toContain("WEEKDAY_TYPES");
    expect(content).not.toContain("weekdayType");
    expect(content).not.toContain("School only");
    expect(content).not.toContain("coachingEnd");
  });

  it("does not reference multi-step progress counters", () => {
    expect(content).not.toContain("/ 4");
    expect(content).not.toContain("totalSteps");
    expect(content).not.toContain("displayStep");
  });
});

describe("AuthGate first-run routing", () => {
  it("confirmed user with no profile in app → onboarding", async () => {
    mockSegments = ["(app)", "(today)"];
    mockIsAuthenticated = true;
    mockIsLoading = false;
    mockConfirmingRef.value = false;
    mockUser = makeNoProfileUser();

    await render(<RootLayout />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(onboarding)");
    });
    expect(mockReplace).not.toHaveBeenCalledWith("/(app)");
    expect(mockReplace).not.toHaveBeenCalledWith("/(auth)/login");
  });

  it("confirmed user with profile in app → stays in app (no onboarding redirect)", async () => {
    mockSegments = ["(app)", "(today)"];
    mockIsAuthenticated = true;
    mockIsLoading = false;
    mockConfirmingRef.value = false;
    mockUser = makeProfileUser();

    await render(<RootLayout />);

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it("confirmed user with profile on login → authenticated app", async () => {
    mockSegments = ["(auth)", "login"];
    mockIsAuthenticated = true;
    mockIsLoading = false;
    mockConfirmingRef.value = false;
    mockUser = makeProfileUser();

    await render(<RootLayout />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(app)");
    });
  });

  it("confirmed user with no profile on login → onboarding", async () => {
    mockSegments = ["(auth)", "login"];
    mockIsAuthenticated = true;
    mockIsLoading = false;
    mockConfirmingRef.value = false;
    mockUser = makeNoProfileUser();

    await render(<RootLayout />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(onboarding)");
    });
  });

  it("unauthenticated user on login → no redirect (login flow unchanged)", async () => {
    mockSegments = ["(auth)", "login"];
    mockIsAuthenticated = false;
    mockIsLoading = false;
    mockConfirmingRef.value = false;
    mockUser = null;

    await render(<RootLayout />);

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it("unauthenticated user outside auth → login", async () => {
    mockSegments = ["(app)", "(today)"];
    mockIsAuthenticated = false;
    mockIsLoading = false;
    mockConfirmingRef.value = false;
    mockUser = null;

    await render(<RootLayout />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(auth)/login");
    });
  });

  it("password recovery on reset-password → no redirect", async () => {
    mockSegments = ["(auth)", "reset-password"];
    mockIsAuthenticated = true;
    mockIsLoading = false;
    mockConfirmingRef.value = false;
    mockUser = makeProfileUser();

    await render(<RootLayout />);

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it("password recovery session with confirming=true → no redirect", async () => {
    mockSegments = ["(auth)", "login"];
    mockIsAuthenticated = true;
    mockIsLoading = false;
    mockConfirmingRef.value = true;
    mockUser = makeProfileUser();

    await render(<RootLayout />);

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it("confirm route is never redirected", async () => {
    mockSegments = ["confirm"];
    mockIsAuthenticated = true;
    mockIsLoading = false;
    mockConfirmingRef.value = false;
    mockUser = makeNoProfileUser();

    await render(<RootLayout />);

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it("profile-less user in onboarding stays (no redirect loop)", async () => {
    mockSegments = ["(onboarding)"];
    mockIsAuthenticated = true;
    mockIsLoading = false;
    mockConfirmingRef.value = false;
    mockUser = makeNoProfileUser();

    await render(<RootLayout />);

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it("profile user in onboarding → app (no loop)", async () => {
    mockSegments = ["(onboarding)"];
    mockIsAuthenticated = true;
    mockIsLoading = false;
    mockConfirmingRef.value = false;
    mockUser = makeProfileUser();

    await render(<RootLayout />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(app)");
    });
    expect(mockReplace).not.toHaveBeenCalledWith("/(onboarding)");
    expect(mockReplace).not.toHaveBeenCalledWith("/(auth)/login");
  });

  it("does not redirect while session is still loading", async () => {
    mockSegments = ["(app)", "(today)"];
    mockIsAuthenticated = false;
    mockIsLoading = true;
    mockConfirmingRef.value = false;
    mockUser = null;

    await render(<RootLayout />);

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it("no redirect loop: profile-less app → onboarding is terminal", async () => {
    mockSegments = ["(app)", "(today)"];
    mockIsAuthenticated = true;
    mockIsLoading = false;
    mockConfirmingRef.value = false;
    mockUser = makeNoProfileUser();

    const first = await render(<RootLayout />);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(onboarding)");
    });
    expect(mockReplace).toHaveBeenCalledTimes(1);

    mockReplace.mockClear();
    mockSegments = ["(onboarding)"];
    await first.rerender(<RootLayout />);
    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });
});
