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

const mockSetConfirming = jest.fn();

jest.mock("@/store/useAuthStore", () => {
  const useAuthStore = (selector: any) =>
    selector({ setConfirming: mockSetConfirming });
  useAuthStore.getState = () => ({
    confirming: false,
    setConfirming: mockSetConfirming,
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

beforeEach(() => {
  mockInitialURL = null;
  mockLinkingURLSetter = null;
  mockSetSession.mockReset();
  mockSetConfirming.mockReset();
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

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(mockSetConfirming).toHaveBeenCalledWith(true);
    });
  });

  it("shows success after valid exchange", async () => {
    mockInitialURL =
      "momentum://confirm#access_token=tok&refresh_token=ref";
    mockSetSession.mockResolvedValue({ error: null });

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(screen.getByText("Email verified!")).toBeTruthy();
    });
    expect(screen.getByText(/Taking you to Momentum/)).toBeTruthy();
  });

  it("keeps confirming=true on success (not reset to false)", async () => {
    mockInitialURL =
      "momentum://confirm#access_token=tok&refresh_token=ref";
    mockSetSession.mockResolvedValue({ error: null });

    await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(mockSetConfirming).toHaveBeenCalledTimes(1);
    });
    expect(mockSetConfirming).toHaveBeenCalledWith(true);
  });

  it("handles URL with extra hash params", async () => {
    mockInitialURL =
      "momentum://confirm#access_token=tok&refresh_token=ref&expires_in=3600&token_type=bearer&type=signup";
    mockSetSession.mockResolvedValue({ error: null });

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

    const result = await render(<ConfirmScreen />);

    await waitFor(() => {
      expect(mockSetSession).toHaveBeenCalledTimes(1);
    });

    await result.rerender(<ConfirmScreen />);

    expect(mockSetSession).toHaveBeenCalledTimes(1);
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

    expect(mockSetConfirming).not.toHaveBeenCalledWith(false);
  });
});
