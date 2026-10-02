/**
 * Login-time two-factor challenge screen (Stage 2A):
 * - challenge/verify through Supabase with spec error copy
 * - success releases the gate and loads the profile
 * - meError recovery after a failed /me
 * - Back to sign in tears the session down
 *
 * RNTL v14: render/fireEvent return promises and must be awaited.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
    back: jest.fn(),
  }),
  router: {
    replace: (...args: any[]) => mockReplace(...args),
    push: jest.fn(),
    back: jest.fn(),
  },
  useLocalSearchParams: () => ({}),
  useSegments: () => ["(auth)", "two-factor"],
  Slot: () => null,
}));

jest.mock("react-native-safe-area-context", () => {
  const R = require("react");
  return {
    SafeAreaView: ({ children, ...props }: any) =>
      R.createElement("SafeAreaView", props, children),
  };
});

const mockChallenge = jest.fn();
const mockVerify = jest.fn();
const mockSignOut = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signOut: (...args: any[]) => mockSignOut(...args),
      getSession: jest.fn(),
      setSession: jest.fn(),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
      mfa: {
        challenge: (...args: any[]) => mockChallenge(...args),
        verify: (...args: any[]) => mockVerify(...args),
        getAuthenticatorAssuranceLevel: jest.fn(),
        listFactors: jest.fn(),
      },
    },
  },
}));

const mockGet = jest.fn();

jest.mock("@/lib/api", () => ({
  api: {
    get: (...args: any[]) => mockGet(...args),
    post: jest.fn(),
  },
}));

import TwoFactorScreen from "@/app/(auth)/two-factor";
import { useAuthStore } from "@/store/useAuthStore";

function makeProfileUser() {
  return {
    id: "user-1",
    email: "test@example.com",
    name: "Test",
    avatar_url: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    profile: { id: "p1", user_id: "user-1" },
    streak: null,
  };
}

function primeChallengeState() {
  useAuthStore.setState({
    isAuthenticated: false,
    isLoading: false,
    confirming: false,
    meError: null,
    user: null,
    mfaRequired: true,
    mfaFactorId: "factor-1",
    mfaAal: "aal1",
  });
}

async function enterCodeAndVerify(code: string) {
  await fireEvent.changeText(
    screen.getByTestId("two-factor-code-input"),
    code,
  );
  await fireEvent.press(screen.getByTestId("two-factor-verify"));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockChallenge.mockResolvedValue({ data: { id: "ch-1" }, error: null });
  mockVerify.mockResolvedValue({ data: { user: {} }, error: null });
  mockSignOut.mockResolvedValue({ error: null });
  mockGet.mockResolvedValue({
    data: makeProfileUser(),
    error: null,
    errorCode: null,
  });
  primeChallengeState();
});

describe("two-factor challenge screen", () => {
  it("renders the prompt and does not challenge until a full code", async () => {
    await render(<TwoFactorScreen />);

    expect(screen.getByText("Two-step verification")).toBeTruthy();

    await fireEvent.changeText(
      screen.getByTestId("two-factor-code-input"),
      "12345",
    );
    await fireEvent.press(screen.getByTestId("two-factor-verify"));
    expect(mockChallenge).not.toHaveBeenCalled();

    await fireEvent.changeText(
      screen.getByTestId("two-factor-code-input"),
      "123456",
    );
    await fireEvent.press(screen.getByTestId("two-factor-verify"));
    await waitFor(() => {
      expect(mockChallenge).toHaveBeenCalledWith({ factorId: "factor-1" });
    });
  });

  it("wrong code → spec copy, input cleared, no profile load", async () => {
    mockVerify.mockResolvedValue({
      data: null,
      error: { code: "mfa_verification_failed" },
    });

    await render(<TwoFactorScreen />);
    await enterCodeAndVerify("000000");

    await waitFor(() => {
      expect(
        screen.getByText("That code didn't match. Try again."),
      ).toBeTruthy();
    });
    expect(mockChallenge).toHaveBeenCalledWith({ factorId: "factor-1" });
    expect(mockVerify).toHaveBeenCalledWith({
      factorId: "factor-1",
      challengeId: "ch-1",
      code: "000000",
    });
    expect(screen.getByTestId("two-factor-code-input").props.value).toBe("");
    expect(mockGet).not.toHaveBeenCalled();
    // The gate stays closed after a failed attempt.
    expect(useAuthStore.getState().mfaRequired).toBe(true);
  });

  it("expired challenge → spec copy and the next attempt is usable", async () => {
    mockVerify.mockResolvedValue({
      data: null,
      error: { code: "mfa_challenge_expired" },
    });

    await render(<TwoFactorScreen />);
    await enterCodeAndVerify("111111");

    await waitFor(() => {
      expect(
        screen.getByText("That verification request expired. Try again."),
      ).toBeTruthy();
    });
    // Fresh challenge per attempt — a retry can never hit the dead one.
    expect(mockChallenge).toHaveBeenCalledTimes(1);

    mockVerify.mockResolvedValue({ data: { user: {} }, error: null });
    await enterCodeAndVerify("111111");

    await waitFor(() => {
      expect(mockChallenge).toHaveBeenCalledTimes(2);
    });
    expect(useAuthStore.getState().mfaRequired).toBe(false);
  });

  it("error without a known code → generic copy, never Supabase text", async () => {
    mockVerify.mockResolvedValue({
      data: null,
      error: { message: "some raw supabase detail" },
    });

    await render(<TwoFactorScreen />);
    await enterCodeAndVerify("222222");

    await waitFor(() => {
      expect(
        screen.getByText("Something went wrong. Please try again."),
      ).toBeTruthy();
    });
    expect(screen.queryByText(/raw supabase detail/)).toBeNull();
  });

  it("challenge request failure shows copy and skips verify", async () => {
    mockChallenge.mockResolvedValue({
      data: null,
      error: { code: "mfa_factor_not_found" },
    });

    await render(<TwoFactorScreen />);
    await enterCodeAndVerify("333333");

    await waitFor(() => {
      expect(
        screen.getByText(
          "We couldn't find that authenticator. Start the setup again.",
        ),
      ).toBeTruthy();
    });
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("offline challenge rejection → offline copy", async () => {
    mockChallenge.mockRejectedValue(new TypeError("Network request failed"));

    await render(<TwoFactorScreen />);
    await enterCodeAndVerify("444444");

    await waitFor(() => {
      expect(
        screen.getByText("You're offline. Check your connection and try again."),
      ).toBeTruthy();
    });
  });

  it("success → releases the gate and loads the profile", async () => {
    await render(<TwoFactorScreen />);
    await enterCodeAndVerify("555555");

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });
    const state = useAuthStore.getState();
    expect(state.mfaRequired).toBe(false);
    expect(state.mfaFactorId).toBeNull();
    expect(state.mfaAal).toBe("aal2");
    expect(state.user).toEqual(makeProfileUser());
    expect(mockGet).toHaveBeenCalledWith("/api/v1/auth/me");
    expect(screen.queryByTestId("two-factor-error")).toBeNull();
  });

  it("success but /me fails → meError box with working Retry", async () => {
    mockGet
      .mockResolvedValueOnce({ data: null, error: "Network error", errorCode: null })
      .mockResolvedValueOnce({
        data: makeProfileUser(),
        error: null,
        errorCode: null,
      });

    await render(<TwoFactorScreen />);
    await enterCodeAndVerify("666666");

    await waitFor(() => {
      expect(screen.getByTestId("two-factor-me-error")).toBeTruthy();
    });
    // Challenge is done even though the profile hasn't loaded.
    expect(useAuthStore.getState().mfaRequired).toBe(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);

    await fireEvent.press(screen.getByTestId("two-factor-me-retry"));

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });
    expect(useAuthStore.getState().meError).toBeNull();
    expect(screen.queryByTestId("two-factor-me-error")).toBeNull();
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("Back to sign in → signs out, clears auth, returns to login", async () => {
    await render(<TwoFactorScreen />);
    await fireEvent.press(screen.getByTestId("two-factor-back"));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(auth)/login");
    });
    expect(mockSignOut).toHaveBeenCalled();
    const state = useAuthStore.getState();
    expect(state.mfaRequired).toBe(false);
    expect(state.mfaFactorId).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });
});
