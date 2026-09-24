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

async function enterBacklogAndConfirm() {
  await fireEvent.changeText(
    screen.getByPlaceholderText(/Physics/),
    "Physics\nMotion",
  );
  await fireEvent.press(screen.getByText("Build My Plan"));
}

async function enterMultiGroupBacklogAndConfirm() {
  await fireEvent.changeText(
    screen.getByPlaceholderText(/Physics/),
    "Physics\nMotion\n\nMaths\nTriangles",
  );
  await fireEvent.press(screen.getByText("Build My Plan"));
}

async function reachConfirmation() {
  await enterBacklogAndConfirm();
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

    expect(screen.getByText("What are you studying?")).toBeTruthy();
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

  it("parses backlog and shows confirmation on Build My Plan", async () => {
    await render(<OnboardingScreen />);

    await fireEvent.changeText(
      screen.getByPlaceholderText(/Physics/),
      "Physics\nMotion\n\nMaths\nTriangles",
    );
    await fireEvent.press(screen.getByText("Build My Plan"));

    expect(screen.getByText("Here's what I understood")).toBeTruthy();
    expect(screen.getByText("Physics")).toBeTruthy();
    expect(screen.getByText("Maths")).toBeTruthy();
    expect(screen.getAllByText("1 topic")).toHaveLength(2);
    expect(screen.getByText("Looks correct")).toBeTruthy();
    expect(screen.getByText("Edit")).toBeTruthy();
  });

  it("Edit returns to backlog input", async () => {
    await render(<OnboardingScreen />);
    await reachConfirmation();

    await fireEvent.press(screen.getByText("Edit"));

    expect(screen.getByText("What are you studying?")).toBeTruthy();
    expect(screen.queryByText("Here's what I understood")).toBeNull();
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
    await enterMultiGroupBacklogAndConfirm();
    expect(screen.getByText("Here's what I understood")).toBeTruthy();
    await fireEvent.press(screen.getByText("Looks correct"));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    const [, payload] = mockPost.mock.calls[0];

    // courses + backlog derived from parser
    expect(payload.courses).toEqual([
      { name: "Physics", color: expect.stringMatching(/^#[0-9a-fA-F]{6}$/) },
      { name: "Maths", color: expect.stringMatching(/^#[0-9a-fA-F]{6}$/) },
    ]);
    expect(payload.backlog).toEqual([
      { title: "Motion", course_index: 0 },
      { title: "Triangles", course_index: 1 },
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

  it("Build My Plan is disabled when backlog is empty", async () => {
    await render(<OnboardingScreen />);

    const btn = screen.getByText("Build My Plan");
    const touchable = btn.parent ?? btn;
    expect(
      touchable.props?.accessibilityState?.disabled ??
        touchable.props?.disabled,
    ).toBe(true);

    await fireEvent.press(btn);
    expect(screen.queryByText("Here's what I understood")).toBeNull();
    expect(screen.getByText("What are you studying?")).toBeTruthy();
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
