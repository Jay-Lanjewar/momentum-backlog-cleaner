/**
 * Login-time 2-step authentication (Stage 2A):
 * - login() outcome routing (ok / mfa-required / fail-closed)
 * - restoreSession() cold-start detection
 * - AuthGate routing with the REAL useAuth + store
 *
 * RNTL v14: render/fireEvent return promises and must be awaited.
 */

import React from "react";
import { render, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
let mockSegments: string[] = ["(app)", "(today)"];

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
  useSegments: () => mockSegments,
  Slot: () => null,
}));

const mockGetSession = jest.fn();
const mockSetSession = jest.fn();
const mockSignOut = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockGetAal = jest.fn();
const mockListFactors = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: (...args: any[]) => mockGetSession(...args),
      setSession: (...args: any[]) => mockSetSession(...args),
      signOut: (...args: any[]) => mockSignOut(...args),
      onAuthStateChange: (...args: any[]) => mockOnAuthStateChange(...args),
      mfa: {
        getAuthenticatorAssuranceLevel: (...args: any[]) =>
          mockGetAal(...args),
        listFactors: (...args: any[]) => mockListFactors(...args),
      },
    },
  },
}));

const mockPost = jest.fn();
const mockGet = jest.fn();

jest.mock("@/lib/api", () => ({
  api: {
    post: (...args: any[]) => mockPost(...args),
    get: (...args: any[]) => mockGet(...args),
  },
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

import { login, restoreSession } from "@/hooks/useAuth";
import { useAuthStore } from "@/store/useAuthStore";
import RootLayout from "@/app/_layout";

const TOKENS = { access_token: "at-1", refresh_token: "rt-1" };
const FACTOR = {
  id: "factor-1",
  factor_type: "totp",
  status: "verified",
  friendly_name: "Momentum",
};

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

function sessionPresent() {
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: "stored-at" } },
  });
}

function aalSays(large: boolean) {
  mockGetAal.mockResolvedValue({
    data: large
      ? { currentLevel: 1, nextLevel: 2 }
      : { currentLevel: 1, nextLevel: 1 },
    error: null,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSegments = ["(app)", "(today)"];
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mockSetSession.mockResolvedValue({ data: { session: {} }, error: null });
  mockSignOut.mockResolvedValue({ error: null });
  mockOnAuthStateChange.mockImplementation(() => ({
    data: { subscription: { unsubscribe: jest.fn() } },
  }));
  mockGetAal.mockResolvedValue({
    data: { currentLevel: 1, nextLevel: 1 },
    error: null,
  });
  mockListFactors.mockResolvedValue({
    data: { all: [], totp: [] },
    error: null,
  });
  useAuthStore.setState({
    isAuthenticated: false,
    isLoading: true,
    confirming: false,
    meError: null,
    user: null,
    mfaRequired: false,
    mfaFactorId: null,
    mfaAal: null,
  });
});

// ─── login() outcomes ───

describe("login outcomes", () => {
  it("password ok, no challenge → loads profile, returns ok", async () => {
    mockPost.mockResolvedValue({ data: TOKENS, error: null, errorCode: null });
    aalSays(false);
    mockGet.mockResolvedValue({
      data: makeProfileUser(),
      error: null,
      errorCode: null,
    });

    const outcome = await login("a@b.com", "password123");

    expect(outcome).toBe("ok");
    expect(mockSetSession).toHaveBeenCalledWith(TOKENS);
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual(makeProfileUser());
    expect(state.mfaRequired).toBe(false);
  });

  it("password ok, challenge pending → mfa-required, no profile load", async () => {
    mockPost.mockResolvedValue({ data: TOKENS, error: null, errorCode: null });
    aalSays(true);
    mockListFactors.mockResolvedValue({
      data: { all: [FACTOR], totp: [FACTOR] },
      error: null,
    });

    const outcome = await login("a@b.com", "password123");

    expect(outcome).toBe("mfa-required");
    expect(mockGet).not.toHaveBeenCalled();
    const state = useAuthStore.getState();
    expect(state.mfaRequired).toBe(true);
    expect(state.mfaFactorId).toBe("factor-1");
    expect(state.mfaAal).toBe("aal1");
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.isLoading).toBe(false);
  });

  it("challenge indicated but factor unlistable → signs out, throws generic copy", async () => {
    mockPost.mockResolvedValue({ data: TOKENS, error: null, errorCode: null });
    aalSays(true);
    mockListFactors.mockResolvedValue({
      data: null,
      error: { code: "unexpected_failure" },
    });

    await expect(login("a@b.com", "password123")).rejects.toThrow(
      "Something went wrong. Please try again.",
    );

    expect(mockSignOut).toHaveBeenCalled();
    const state = useAuthStore.getState();
    expect(state.mfaRequired).toBe(false);
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("API login failure keeps the existing error contract", async () => {
    mockPost.mockResolvedValue({
      data: null,
      error: "Invalid login credentials",
      errorCode: "invalid_credentials",
    });

    await expect(login("a@b.com", "wrong")).rejects.toThrow(
      "invalid_credentials",
    );
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it("AAL read failure fails open to the profile path", async () => {
    mockPost.mockResolvedValue({ data: TOKENS, error: null, errorCode: null });
    mockGetAal.mockResolvedValue({
      data: null,
      error: { code: "unexpected_failure" },
    });
    mockGet.mockResolvedValue({
      data: makeProfileUser(),
      error: null,
      errorCode: null,
    });

    const outcome = await login("a@b.com", "password123");

    expect(outcome).toBe("ok");
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});

// ─── restoreSession() outcomes ───

describe("restoreSession outcomes", () => {
  it("no session → no-session and loading ends", async () => {
    const outcome = await restoreSession();

    expect(outcome).toBe("no-session");
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockGetAal).not.toHaveBeenCalled();
  });

  it("session without challenge → profile loaded", async () => {
    sessionPresent();
    aalSays(false);
    mockGet.mockResolvedValue({
      data: makeProfileUser(),
      error: null,
      errorCode: null,
    });

    const outcome = await restoreSession();

    expect(outcome).toBe("ok");
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.mfaRequired).toBe(false);
  });

  it("session with pending challenge → mfa-required, /me untouched", async () => {
    sessionPresent();
    aalSays(true);
    mockListFactors.mockResolvedValue({
      data: { all: [FACTOR], totp: [FACTOR] },
      error: null,
    });

    const outcome = await restoreSession();

    expect(outcome).toBe("mfa-required");
    expect(mockGet).not.toHaveBeenCalled();
    const state = useAuthStore.getState();
    expect(state.mfaRequired).toBe(true);
    expect(state.mfaFactorId).toBe("factor-1");
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  it("challenge indicated but factor unlistable → fail closed, signs out", async () => {
    sessionPresent();
    aalSays(true);
    mockListFactors.mockResolvedValue({
      data: null,
      error: { code: "unexpected_failure" },
    });

    const outcome = await restoreSession();

    expect(outcome).toBe("error");
    expect(mockSignOut).toHaveBeenCalled();
    const state = useAuthStore.getState();
    expect(state.mfaRequired).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("AAL read failure fails open to the profile path", async () => {
    sessionPresent();
    mockGetAal.mockResolvedValue({
      data: null,
      error: { code: "unexpected_failure" },
    });
    mockGet.mockResolvedValue({
      data: makeProfileUser(),
      error: null,
      errorCode: null,
    });

    const outcome = await restoreSession();

    expect(outcome).toBe("ok");
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it("/me failure keeps the session and surfaces meError", async () => {
    sessionPresent();
    aalSays(false);
    mockGet.mockResolvedValue({
      data: null,
      error: "Network error",
      errorCode: null,
    });

    const outcome = await restoreSession();

    expect(outcome).toBe("error");
    expect(mockSignOut).not.toHaveBeenCalled();
    const state = useAuthStore.getState();
    expect(state.meError).toContain("Network error");
    expect(state.isLoading).toBe(false);
    expect(state.isAuthenticated).toBe(false);
  });

  it("getSession rejection → error and loading ends", async () => {
    mockGetSession.mockRejectedValue(new Error("storage unavailable"));

    const outcome = await restoreSession();

    expect(outcome).toBe("error");
    expect(useAuthStore.getState().isLoading).toBe(false);
  });
});

// ─── AuthGate cold start (real useAuth + real store) ───

describe("AuthGate cold start routing", () => {
  it("restore detects a challenge → routes to two-factor, no /me", async () => {
    sessionPresent();
    aalSays(true);
    mockListFactors.mockResolvedValue({
      data: { all: [FACTOR], totp: [FACTOR] },
      error: null,
    });

    await render(<RootLayout />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(auth)/two-factor");
    });
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalledWith("/(auth)/login");
  });

  it("restore with no session → routes to login", async () => {
    await render(<RootLayout />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(auth)/login");
    });
  });

  it("restore with a healthy session → stays in app", async () => {
    sessionPresent();
    aalSays(false);
    mockGet.mockResolvedValue({
      data: makeProfileUser(),
      error: null,
      errorCode: null,
    });

    await render(<RootLayout />);

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("already on two-factor with a pending challenge → no navigation", async () => {
    sessionPresent();
    aalSays(true);
    mockListFactors.mockResolvedValue({
      data: { all: [FACTOR], totp: [FACTOR] },
      error: null,
    });
    mockSegments = ["(auth)", "two-factor"];

    await render(<RootLayout />);

    await waitFor(() => {
      expect(useAuthStore.getState().mfaRequired).toBe(true);
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
