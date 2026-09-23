/**
 * First-run flow tests: onboarding final submit + AuthGate routing.
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

const mockSetUser = jest.fn();
const mockSetConfirming = jest.fn();

jest.mock("@/store/useAuthStore", () => {
  // mockConfirmingRef is hoisted-safe: accessed lazily inside selectors.
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

async function advanceToFinalStep() {
  await fireEvent.press(screen.getByText("Get Started"));

  await fireEvent.changeText(screen.getByPlaceholderText("Your name"), "Ada");
  await fireEvent.press(screen.getByText("Continue"));

  await fireEvent.changeText(
    screen.getByPlaceholderText(/Physics/),
    "Physics\nMotion",
  );
  await fireEvent.press(screen.getByText("Build My Plan"));
  await fireEvent.press(screen.getByText("Looks correct"));

  await fireEvent.press(screen.getByText("Continue"));

  await fireEvent.press(screen.getByText("School only"));
}

function mockAlertSpy() {
  return jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSegments = ["(app)", "(today)"];
  mockIsAuthenticated = true;
  mockIsLoading = false;
  mockConfirmingRef.value = false;
  mockUser = null;
});

describe("Onboarding final action (handleFinish)", () => {
  it("final weekday Continue calls onboarding POST (handleFinish)", async () => {
    mockPost.mockResolvedValue({ data: { ok: true }, error: null, errorCode: null });
    mockGet.mockResolvedValue({ data: makeProfileUser(), error: null, errorCode: null });

    await render(<OnboardingScreen />);
    await advanceToFinalStep();

    await fireEvent.press(screen.getByText("Continue"));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/api/v1/onboarding",
        expect.objectContaining({
          courses: expect.any(Array),
          backlog: expect.any(Array),
          goals: expect.any(Array),
          profile: expect.objectContaining({ name: "Ada" }),
          schedule: expect.any(Object),
        }),
      );
    });
  });

  it("successful onboarding POST routes to authenticated app", async () => {
    mockPost.mockResolvedValue({ data: { ok: true }, error: null, errorCode: null });
    mockGet.mockResolvedValue({ data: makeProfileUser(), error: null, errorCode: null });

    await render(<OnboardingScreen />);
    await advanceToFinalStep();

    await fireEvent.press(screen.getByText("Continue"));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(app)");
    });
    expect(mockSetUser).toHaveBeenCalledWith(makeProfileUser());
  });

  it("prevents duplicate final submission while request is in progress", async () => {
    let resolvePost!: (value: any) => void;
    mockPost.mockImplementation(
      () => new Promise((r) => { resolvePost = r; }),
    );
    mockGet.mockResolvedValue({ data: makeProfileUser(), error: null, errorCode: null });

    await render(<OnboardingScreen />);
    await advanceToFinalStep();

    const continueBtn = screen.getByText("Continue");
    await fireEvent.press(continueBtn);
    await fireEvent.press(continueBtn);
    await fireEvent.press(continueBtn);

    expect(mockPost).toHaveBeenCalledTimes(1);

    resolvePost({ data: { ok: true }, error: null, errorCode: null });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(app)");
    });
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it("handles onboarding POST failure with Alert and returns to editable step", async () => {
    const alertSpy = mockAlertSpy();
    mockPost.mockResolvedValue({
      data: null,
      error: "Something went wrong",
      errorCode: null,
    });

    await render(<OnboardingScreen />);
    await advanceToFinalStep();

    await fireEvent.press(screen.getByText("Continue"));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith("Error", "Something went wrong");
    });

    expect(mockReplace).not.toHaveBeenCalledWith("/(app)");

    await waitFor(() => {
      expect(screen.getByText("What does your weekday look like?")).toBeTruthy();
    });
    expect(screen.queryByText(/Understanding your work/)).toBeNull();

    alertSpy.mockRestore();
  });

  it("handles thrown network error with Alert and returns to editable step", async () => {
    const alertSpy = mockAlertSpy();
    mockPost.mockRejectedValue(new Error("Network error"));

    await render(<OnboardingScreen />);
    await advanceToFinalStep();

    await fireEvent.press(screen.getByText("Continue"));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        "Error",
        "Something went wrong. Please try again.",
      );
    });
    expect(mockReplace).not.toHaveBeenCalledWith("/(app)");

    await waitFor(() => {
      expect(screen.getByText("What does your weekday look like?")).toBeTruthy();
    });

    alertSpy.mockRestore();
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
      // allow effects to run
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
    // once in app with profile, no further redirects would fire — covered by profile-in-app test
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
