/**
 * Tests for the confirm deep-link screen.
 *
 * Uses useLinkingURL() from expo-linking which provides the URL synchronously
 * from the native module cache (cold start) and via native events (warm start).
 *
 * RNTL v14: render() is async and must be awaited. The useLinkingURL mock
 * uses React state so that calling the setter triggers a proper re-render
 * (warm start) instead of creating a new component instance.
 */

import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react-native";

const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
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

const mockSetSession = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      setSession: (...args: any[]) => mockSetSession(...args),
    },
  },
}));

const mockGetMe = jest.fn();

jest.mock("@/lib/api", () => ({
  api: {
    get: (...args: any[]) => mockGetMe(...args),
  },
}));

const mockSetConfirming = jest.fn();
const mockSetUser = jest.fn();

jest.mock("@/store/useAuthStore", () => {
  const useAuthStore = (selector: any) =>
    selector({ setConfirming: mockSetConfirming, setUser: mockSetUser });
  useAuthStore.getState = () => ({
    confirming: false,
    setConfirming: mockSetConfirming,
    setUser: mockSetUser,
  });
  useAuthStore.setState = jest.fn();
  return { useAuthStore };
});

let mockInitialURL: string | null = null;
let mockLinkingURLSetter: ((url: string | null) => void) | null = null;

jest.mock("expo-linking", () => ({
  useLinkingURL: () => {
    const { useState, useEffect } = require("react") as typeof import("react");
    const [url, setUrl] = useState<string | null>(mockInitialURL);
    useEffect(() => {
      mockLinkingURLSetter = setUrl;
    });
    return url;
  },
}));

const ConfirmScreen = require("@/app/confirm").default;

const mockProfile = { id: "user-1", email: "test@example.com" };

beforeEach(() => {
  jest.useRealTimers();
  mockInitialURL = null;
  mockLinkingURLSetter = null;
  mockSetSession.mockReset();
  mockGetMe.mockReset();
  mockSetConfirming.mockReset();
  mockSetUser.mockReset();
  mockReplace.mockReset();
});

describe("ConfirmScreen - cold start (initial URL available)", () => {
  it("shows loading state initially when URL is null", async () => {
    await render(<ConfirmScreen />);
    expect(screen.getByText(/Verifying your email/)).toBeTruthy();
  });

  it("extracts tokens and calls setSession", async () => {
    mockInitialURL =
      "momentum://confirm#access_token=tok123&refresh_token=ref456&type=signup";
    mockSetSession.mockResolvedValue({ error: null });
    mockGetMe.mockResolvedValue({ data: mockProfile, error: null, errorCode: null });

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(mockSetSession).toHaveBeenCalledWith({
        access_token: "tok123",
        refresh_token: "ref456",
      });
    });
  });

  it("sets confirming=true on mount", async () => {
    mockInitialURL =
      "momentum://confirm#access_token=tok&refresh_token=ref";
    mockSetSession.mockResolvedValue({ error: null });
    mockGetMe.mockResolvedValue({ data: mockProfile, error: null, errorCode: null });

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(mockSetConfirming).toHaveBeenCalledWith(true);
    });
  });

  it("shows success after valid exchange", async () => {
    mockInitialURL =
      "momentum://confirm#access_token=tok&refresh_token=ref";
    mockSetSession.mockResolvedValue({ error: null });
    mockGetMe.mockResolvedValue({ data: mockProfile, error: null, errorCode: null });

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(screen.getByText("Email verified!")).toBeTruthy();
    });
    expect(screen.getByText(/Taking you to Momentum/)).toBeTruthy();
  });

  it("handles URL with extra hash params", async () => {
    mockInitialURL =
      "momentum://confirm#access_token=tok&refresh_token=ref&expires_in=3600&token_type=bearer&type=signup";
    mockSetSession.mockResolvedValue({ error: null });
    mockGetMe.mockResolvedValue({ data: mockProfile, error: null, errorCode: null });

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(screen.getByText("Email verified!")).toBeTruthy();
    });
    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: "tok",
      refresh_token: "ref",
    });
  });

  it("handles URL-encoded characters in tokens", async () => {
    mockInitialURL =
      "momentum://confirm#access_token=tok%3D%3D&refresh_token=ref%2Babc";
    mockSetSession.mockResolvedValue({ error: null });
    mockGetMe.mockResolvedValue({ data: mockProfile, error: null, errorCode: null });

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(mockSetSession).toHaveBeenCalledWith({
        access_token: "tok==",
        refresh_token: "ref+abc",
      });
    });
  });
});

describe("ConfirmScreen - warm start (URL arrives later)", () => {
  it("processes URL when it becomes available after mount", async () => {
    mockSetSession.mockResolvedValue({ error: null });
    mockGetMe.mockResolvedValue({ data: mockProfile, error: null, errorCode: null });

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(screen.getByText(/Verifying your email/)).toBeTruthy();
    });
    expect(mockSetSession).not.toHaveBeenCalled();

    await act(async () => {
      mockLinkingURLSetter!(
        "momentum://confirm#access_token=warm&refresh_token=start&type=signup",
      );
    });

    await waitFor(() => {
      expect(mockSetSession).toHaveBeenCalledWith({
        access_token: "warm",
        refresh_token: "start",
      });
    });
  });

  it("shows success for warm-start URL", async () => {
    mockSetSession.mockResolvedValue({ error: null });
    mockGetMe.mockResolvedValue({ data: mockProfile, error: null, errorCode: null });

    await render(<ConfirmScreen />);

    await act(async () => {
      mockLinkingURLSetter!(
        "momentum://confirm#access_token=tok&refresh_token=ref",
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Email verified!")).toBeTruthy();
    });
  });

  it("shows error for invalid warm-start URL", async () => {
    await render(<ConfirmScreen />);

    await act(async () => {
      mockLinkingURLSetter!("momentum://confirm#bad");
    });

    await waitFor(() => {
      expect(
        screen.getByText("Invalid or expired confirmation link."),
      ).toBeTruthy();
    });
  });
});

describe("ConfirmScreen - duplicate URL processing", () => {
  it("processes the same URL only once", async () => {
    mockInitialURL =
      "momentum://confirm#access_token=tok&refresh_token=ref";
    mockSetSession.mockResolvedValue({ error: null });
    mockGetMe.mockResolvedValue({ data: mockProfile, error: null, errorCode: null });

    const result = await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(mockSetSession).toHaveBeenCalledTimes(1);
    });

    await result.rerender(<ConfirmScreen />);

    expect(mockSetSession).toHaveBeenCalledTimes(1);
  });
});

describe("ConfirmScreen - success flow", () => {
  it("calls GET /api/v1/auth/me after successful setSession", async () => {
    mockInitialURL =
      "momentum://confirm#access_token=tok&refresh_token=ref";
    mockSetSession.mockResolvedValue({ error: null });
    mockGetMe.mockResolvedValue({ data: mockProfile, error: null, errorCode: null });

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(mockGetMe).toHaveBeenCalledWith("/api/v1/auth/me");
    });
  });

  it("calls setUser with profile data after successful /auth/me", async () => {
    mockInitialURL =
      "momentum://confirm#access_token=tok&refresh_token=ref";
    mockSetSession.mockResolvedValue({ error: null });
    mockGetMe.mockResolvedValue({ data: mockProfile, error: null, errorCode: null });

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(mockSetUser).toHaveBeenCalledWith(mockProfile);
    });
  });

  it("calls setConfirming(false) on success", async () => {
    mockInitialURL =
      "momentum://confirm#access_token=tok&refresh_token=ref";
    mockSetSession.mockResolvedValue({ error: null });
    mockGetMe.mockResolvedValue({ data: mockProfile, error: null, errorCode: null });

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(mockSetConfirming).toHaveBeenCalledWith(false);
    });
  });

  it("navigates to root after 1500ms delay", async () => {
    jest.useFakeTimers();
    try {
      mockInitialURL =
        "momentum://confirm#access_token=tok&refresh_token=ref";
      mockSetSession.mockResolvedValue({ error: null });
      mockGetMe.mockResolvedValue({ data: mockProfile, error: null, errorCode: null });

      await render(<ConfirmScreen />);

      await waitFor(() => {
        expect(screen.getByText("Email verified!")).toBeTruthy();
      });

      expect(mockReplace).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(1500);
      });

      expect(mockReplace).toHaveBeenCalledWith("/");
    } finally {
      jest.useRealTimers();
    }
  });

  it("does not call setUser when /auth/me returns no data", async () => {
    mockInitialURL =
      "momentum://confirm#access_token=tok&refresh_token=ref";
    mockSetSession.mockResolvedValue({ error: null });
    mockGetMe.mockResolvedValue({ data: null, error: "Not found", errorCode: null });

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(screen.getByText("Email verified!")).toBeTruthy();
    });
    expect(mockSetUser).not.toHaveBeenCalled();
  });

  it("/auth/me failure does not turn successful confirmation into an error", async () => {
    mockInitialURL =
      "momentum://confirm#access_token=tok&refresh_token=ref";
    mockSetSession.mockResolvedValue({ error: null });
    mockGetMe.mockResolvedValue({ data: null, error: "Not found", errorCode: null });

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(screen.getByText("Email verified!")).toBeTruthy();
    });
    expect(mockSetConfirming).toHaveBeenCalledWith(false);
  });

  it("/auth/me network error does not turn successful confirmation into an error", async () => {
    mockInitialURL =
      "momentum://confirm#access_token=tok&refresh_token=ref";
    mockSetSession.mockResolvedValue({ error: null });
    mockGetMe.mockRejectedValue(new Error("Network error"));

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(screen.getByText("Email verified!")).toBeTruthy();
    });
    expect(mockSetConfirming).toHaveBeenCalledWith(false);
    expect(mockSetUser).not.toHaveBeenCalled();
  });

  it("does not navigate immediately before delay elapses", async () => {
    jest.useFakeTimers();
    try {
      mockInitialURL =
        "momentum://confirm#access_token=tok&refresh_token=ref";
      mockSetSession.mockResolvedValue({ error: null });
      mockGetMe.mockResolvedValue({ data: mockProfile, error: null, errorCode: null });

      await render(<ConfirmScreen />);

      await waitFor(() => {
        expect(screen.getByText("Email verified!")).toBeTruthy();
      });

      expect(mockReplace).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(1499);
      });

      expect(mockReplace).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("ConfirmScreen - error states", () => {
  it("shows error when URL has no hash", async () => {
    mockInitialURL = "momentum://confirm";

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(
        screen.getByText("Invalid or expired confirmation link."),
      ).toBeTruthy();
    });
  });

  it("shows error when hash lacks access_token", async () => {
    mockInitialURL = "momentum://confirm#refresh_token=abc";

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(
        screen.getByText("Invalid or expired confirmation link."),
      ).toBeTruthy();
    });
  });

  it("shows error when hash lacks refresh_token", async () => {
    mockInitialURL = "momentum://confirm#access_token=abc";

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(
        screen.getByText("Invalid or expired confirmation link."),
      ).toBeTruthy();
    });
  });

  it("shows error when setSession fails", async () => {
    mockInitialURL =
      "momentum://confirm#access_token=tok&refresh_token=ref";
    mockSetSession.mockResolvedValue({ error: { message: "Invalid token" } });

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(screen.getByText("Confirmation failed")).toBeTruthy();
    });
    expect(screen.getByText("Invalid token")).toBeTruthy();
  });

  it("handles setSession throwing", async () => {
    mockInitialURL =
      "momentum://confirm#access_token=tok&refresh_token=ref";
    mockSetSession.mockRejectedValue(new Error("Network error"));

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(
        screen.getByText("Something went wrong. Please try again."),
      ).toBeTruthy();
    });
    expect(mockSetConfirming).toHaveBeenCalledWith(false);
  });

  it("sets confirming=false on error", async () => {
    mockInitialURL = "momentum://confirm";

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(mockSetConfirming).toHaveBeenCalledWith(false);
    });
  });

  it("does not call getMe when setSession fails", async () => {
    mockInitialURL =
      "momentum://confirm#access_token=tok&refresh_token=ref";
    mockSetSession.mockResolvedValue({ error: { message: "Invalid token" } });

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(screen.getByText("Confirmation failed")).toBeTruthy();
    });
    expect(mockGetMe).not.toHaveBeenCalled();
  });

  it("does not call getMe when tokens are invalid", async () => {
    mockInitialURL = "momentum://confirm#bad";

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(
        screen.getByText("Invalid or expired confirmation link."),
      ).toBeTruthy();
    });
    expect(mockGetMe).not.toHaveBeenCalled();
  });
});

describe("ConfirmScreen - error recovery", () => {
  it("navigates to login on Back to Sign In", async () => {
    mockInitialURL = "momentum://confirm";

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(screen.getByText("Back to Sign In")).toBeTruthy();
    });
    fireEvent.press(screen.getByText("Back to Sign In"));
    expect(mockReplace).toHaveBeenCalledWith("/(auth)/login");
  });

  it("navigates to register on Create a new account", async () => {
    mockInitialURL = "momentum://confirm";

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(screen.getByText("Create a new account")).toBeTruthy();
    });
    fireEvent.press(screen.getByText("Create a new account"));
    expect(mockReplace).toHaveBeenCalledWith("/(auth)/register");
  });
});

describe("ConfirmScreen - password recovery (type=recovery)", () => {
  it("recognizes type=recovery and calls setSession", async () => {
    mockInitialURL =
      "momentum://confirm#access_token=tok&refresh_token=ref&type=recovery";
    mockSetSession.mockResolvedValue({ error: null });
    mockGetMe.mockResolvedValue({ data: mockProfile, error: null, errorCode: null });

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(mockSetSession).toHaveBeenCalledWith({
        access_token: "tok",
        refresh_token: "ref",
      });
    });
  });

  it("calls GET /api/v1/auth/me after successful setSession", async () => {
    mockInitialURL =
      "momentum://confirm#access_token=tok&refresh_token=ref&type=recovery";
    mockSetSession.mockResolvedValue({ error: null });
    mockGetMe.mockResolvedValue({ data: mockProfile, error: null, errorCode: null });

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(mockGetMe).toHaveBeenCalledWith("/api/v1/auth/me");
    });
  });

  it("populates Zustand auth state via setUser", async () => {
    mockInitialURL =
      "momentum://confirm#access_token=tok&refresh_token=ref&type=recovery";
    mockSetSession.mockResolvedValue({ error: null });
    mockGetMe.mockResolvedValue({ data: mockProfile, error: null, errorCode: null });

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(mockSetUser).toHaveBeenCalledWith(mockProfile);
    });
  });

  it("routes to /(auth)/reset-password", async () => {
    mockInitialURL =
      "momentum://confirm#access_token=tok&refresh_token=ref&type=recovery";
    mockSetSession.mockResolvedValue({ error: null });
    mockGetMe.mockResolvedValue({ data: mockProfile, error: null, errorCode: null });

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(auth)/reset-password");
    });
  });

  it("keeps confirming=true while transitioning", async () => {
    mockInitialURL =
      "momentum://confirm#access_token=tok&refresh_token=ref&type=recovery";
    mockSetSession.mockResolvedValue({ error: null });
    mockGetMe.mockResolvedValue({ data: mockProfile, error: null, errorCode: null });

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(auth)/reset-password");
    });
    expect(mockSetConfirming).toHaveBeenCalledWith(true);
    expect(mockSetConfirming).not.toHaveBeenCalledWith(false);
  });

  it("does not show the verified-email success screen for recovery", async () => {
    mockInitialURL =
      "momentum://confirm#access_token=tok&refresh_token=ref&type=recovery";
    mockSetSession.mockResolvedValue({ error: null });
    mockGetMe.mockResolvedValue({ data: mockProfile, error: null, errorCode: null });

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(auth)/reset-password");
    });
    expect(screen.queryByText("Email verified!")).toBeNull();
  });

  it("does not navigate to root for recovery", async () => {
    jest.useFakeTimers();
    try {
      mockInitialURL =
        "momentum://confirm#access_token=tok&refresh_token=ref&type=recovery";
      mockSetSession.mockResolvedValue({ error: null });
      mockGetMe.mockResolvedValue({ data: mockProfile, error: null, errorCode: null });

      await render(<ConfirmScreen />);

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith("/(auth)/reset-password");
      });

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      expect(mockReplace).not.toHaveBeenCalledWith("/");
    } finally {
      jest.useRealTimers();
    }
  });

  it("shows error for malformed recovery link (no tokens)", async () => {
    mockInitialURL = "momentum://confirm#type=recovery";

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(
        screen.getByText("Invalid or expired confirmation link."),
      ).toBeTruthy();
    });
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it("shows error when setSession fails for recovery", async () => {
    mockInitialURL =
      "momentum://confirm#access_token=tok&refresh_token=ref&type=recovery";
    mockSetSession.mockResolvedValue({ error: { message: "Invalid token" } });

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(screen.getByText("Confirmation failed")).toBeTruthy();
    });
    expect(screen.getByText("Invalid token")).toBeTruthy();
    expect(mockGetMe).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalledWith("/(auth)/reset-password");
  });

  it("still routes to reset-password when /auth/me fails after successful setSession", async () => {
    mockInitialURL =
      "momentum://confirm#access_token=tok&refresh_token=ref&type=recovery";
    mockSetSession.mockResolvedValue({ error: null });
    mockGetMe.mockResolvedValue({ data: null, error: "Not found", errorCode: null });

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(auth)/reset-password");
    });
    expect(mockSetUser).not.toHaveBeenCalled();
    expect(screen.queryByText("Confirmation failed")).toBeNull();
  });

  it("still routes to reset-password when /auth/me rejects for recovery", async () => {
    mockInitialURL =
      "momentum://confirm#access_token=tok&refresh_token=ref&type=recovery";
    mockSetSession.mockResolvedValue({ error: null });
    mockGetMe.mockRejectedValue(new Error("Network error"));

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(auth)/reset-password");
    });
    expect(mockSetUser).not.toHaveBeenCalled();
  });

  it("preserves signup flow: type=signup still routes to root after delay", async () => {
    jest.useFakeTimers();
    try {
      mockInitialURL =
        "momentum://confirm#access_token=tok&refresh_token=ref&type=signup";
      mockSetSession.mockResolvedValue({ error: null });
      mockGetMe.mockResolvedValue({ data: mockProfile, error: null, errorCode: null });

      await render(<ConfirmScreen />);

      await waitFor(() => {
        expect(screen.getByText("Email verified!")).toBeTruthy();
      });
      expect(mockReplace).not.toHaveBeenCalledWith("/(auth)/reset-password");

      await act(async () => {
        jest.advanceTimersByTime(1500);
      });

      expect(mockReplace).toHaveBeenCalledWith("/");
      expect(mockSetConfirming).toHaveBeenCalledWith(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("preserves signup flow: no type still routes to root after delay", async () => {
    jest.useFakeTimers();
    try {
      mockInitialURL =
        "momentum://confirm#access_token=tok&refresh_token=ref";
      mockSetSession.mockResolvedValue({ error: null });
      mockGetMe.mockResolvedValue({ data: mockProfile, error: null, errorCode: null });

      await render(<ConfirmScreen />);

      await waitFor(() => {
        expect(screen.getByText("Email verified!")).toBeTruthy();
      });

      await act(async () => {
        jest.advanceTimersByTime(1500);
      });

      expect(mockReplace).toHaveBeenCalledWith("/");
      expect(mockReplace).not.toHaveBeenCalledWith("/(auth)/reset-password");
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("ConfirmScreen - cleanup and unmount", () => {
  it("renders without crashing when URL is null", async () => {
    await render(<ConfirmScreen />);
    expect(screen.getByText(/Verifying your email/)).toBeTruthy();
  });

  it("does not call setSession when URL never arrives", async () => {
    await render(<ConfirmScreen />);

    expect(screen.getByText(/Verifying your email/)).toBeTruthy();
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it("cancels async processing on unmount", async () => {
    let resolveSetSession!: (value: { error: null }) => void;
    mockSetSession.mockImplementation(
      () => new Promise((r) => { resolveSetSession = r; }),
    );

    mockInitialURL =
      "momentum://confirm#access_token=tok&refresh_token=ref";

    await render(<ConfirmScreen />);

    expect(mockSetSession).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Verifying your email/)).toBeTruthy();

    const { unmount } = screen;

    unmount();

    await act(async () => {
      resolveSetSession({ error: null });
    });

    expect(mockSetUser).not.toHaveBeenCalled();
    expect(mockSetConfirming).not.toHaveBeenCalledWith(false);
  });
});
