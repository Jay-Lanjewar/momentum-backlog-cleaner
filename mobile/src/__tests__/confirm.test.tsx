/**
 * Tests for the confirm deep-link screen.
 */

import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react-native";

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
const mockGetInitialURL = jest.fn();

jest.mock("expo-linking", () => ({
  getInitialURL: (...args: any[]) => mockGetInitialURL(...args),
}));

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      setSession: (...args: any[]) => mockSetSession(...args),
    },
  },
}));

const mockSetConfirming = jest.fn();

jest.mock("@/store/useAuthStore", () => {
  const useAuthStore = (selector: any) => selector({ setConfirming: mockSetConfirming });
  useAuthStore.getState = () => ({ confirming: false, setConfirming: mockSetConfirming });
  useAuthStore.setState = jest.fn();
  return { useAuthStore };
});

const ConfirmScreen = require("@/app/confirm").default;

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

describe("ConfirmScreen - valid confirmation deep link", () => {
  it("shows loading state initially", async () => {
    mockGetInitialURL.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      render(<ConfirmScreen />);
    });
    expect(screen.getByText(/Verifying your email/)).toBeTruthy();
  });

  it("extracts tokens and calls setSession", async () => {
    mockGetInitialURL.mockResolvedValue(
      "momentum://confirm#access_token=tok123&refresh_token=ref456&type=signup"
    );
    mockSetSession.mockResolvedValue({ error: null });

    render(<ConfirmScreen />);

    await waitFor(() => {
      expect(mockSetSession).toHaveBeenCalledWith({
        access_token: "tok123",
        refresh_token: "ref456",
      });
    });
  });

  it("sets confirming=true to block AuthGate redirect", async () => {
    mockGetInitialURL.mockResolvedValue(
      "momentum://confirm#access_token=tok&refresh_token=ref"
    );
    mockSetSession.mockResolvedValue({ error: null });

    render(<ConfirmScreen />);

    await waitFor(() => {
      expect(mockSetConfirming).toHaveBeenCalledWith(true);
    });
  });

  it("shows success after valid exchange", async () => {
    mockGetInitialURL.mockResolvedValue(
      "momentum://confirm#access_token=tok&refresh_token=ref"
    );
    mockSetSession.mockResolvedValue({ error: null });

    render(<ConfirmScreen />);

    await waitFor(() => {
      expect(screen.getByText("Email verified!")).toBeTruthy();
    });
    expect(screen.getByText(/Taking you to Momentum/)).toBeTruthy();
  });

  it("keeps confirming=true on success", async () => {
    mockGetInitialURL.mockResolvedValue(
      "momentum://confirm#access_token=tok&refresh_token=ref"
    );
    mockSetSession.mockResolvedValue({ error: null });

    render(<ConfirmScreen />);

    await waitFor(() => {
      expect(mockSetConfirming).toHaveBeenCalledTimes(1);
    });
    expect(mockSetConfirming).toHaveBeenCalledWith(true);
  });
});

describe("ConfirmScreen - invalid or expired link", () => {
  it("shows error when no URL returned", async () => {
    mockGetInitialURL.mockResolvedValue(null);

    render(<ConfirmScreen />);

    await waitFor(() => {
      expect(screen.getByText("Confirmation failed")).toBeTruthy();
    });
    expect(screen.getByText("No confirmation data found.")).toBeTruthy();
  });

  it("shows error when URL has no hash", async () => {
    mockGetInitialURL.mockResolvedValue("momentum://confirm");

    render(<ConfirmScreen />);

    await waitFor(() => {
      expect(screen.getByText("Invalid or expired confirmation link.")).toBeTruthy();
    });
  });

  it("shows error when hash lacks access_token", async () => {
    mockGetInitialURL.mockResolvedValue("momentum://confirm#refresh_token=abc");

    render(<ConfirmScreen />);

    await waitFor(() => {
      expect(screen.getByText("Invalid or expired confirmation link.")).toBeTruthy();
    });
  });

  it("shows error when hash lacks refresh_token", async () => {
    mockGetInitialURL.mockResolvedValue("momentum://confirm#access_token=abc");

    render(<ConfirmScreen />);

    await waitFor(() => {
      expect(screen.getByText("Invalid or expired confirmation link.")).toBeTruthy();
    });
  });

  it("shows error when setSession fails", async () => {
    mockGetInitialURL.mockResolvedValue(
      "momentum://confirm#access_token=tok&refresh_token=ref"
    );
    mockSetSession.mockResolvedValue({ error: { message: "Invalid token" } });

    render(<ConfirmScreen />);

    await waitFor(() => {
      expect(screen.getByText("Confirmation failed")).toBeTruthy();
    });
    expect(screen.getByText("Invalid token")).toBeTruthy();
  });

  it("sets confirming=false on error", async () => {
    mockGetInitialURL.mockResolvedValue(null);

    render(<ConfirmScreen />);

    await waitFor(() => {
      expect(mockSetConfirming).toHaveBeenCalledWith(false);
    });
    expect(mockSetConfirming).toHaveBeenCalledWith(true);
  });
});

describe("ConfirmScreen - error recovery", () => {
  it("navigates to login on Back to Sign In", async () => {
    mockGetInitialURL.mockResolvedValue(null);

    render(<ConfirmScreen />);

    await waitFor(() => {
      expect(screen.getByText("Back to Sign In")).toBeTruthy();
    });
    fireEvent.press(screen.getByText("Back to Sign In"));
    expect(mockReplace).toHaveBeenCalledWith("/(auth)/login");
  });

  it("navigates to register on Create a new account", async () => {
    mockGetInitialURL.mockResolvedValue(null);

    render(<ConfirmScreen />);

    await waitFor(() => {
      expect(screen.getByText("Create a new account")).toBeTruthy();
    });
    fireEvent.press(screen.getByText("Create a new account"));
    expect(mockReplace).toHaveBeenCalledWith("/(auth)/register");
  });
});

describe("ConfirmScreen - edge cases", () => {
  it("handles setSession throwing", async () => {
    mockGetInitialURL.mockResolvedValue(
      "momentum://confirm#access_token=tok&refresh_token=ref"
    );
    mockSetSession.mockRejectedValue(new Error("Network error"));

    render(<ConfirmScreen />);

    await waitFor(() => {
      expect(screen.getByText("Something went wrong. Please try again.")).toBeTruthy();
    });
    expect(mockSetConfirming).toHaveBeenCalledWith(false);
  });

  it("handles URL with extra hash params", async () => {
    mockGetInitialURL.mockResolvedValue(
      "momentum://confirm#access_token=tok&refresh_token=ref&expires_in=3600&token_type=bearer&type=signup"
    );
    mockSetSession.mockResolvedValue({ error: null });

    render(<ConfirmScreen />);

    await waitFor(() => {
      expect(screen.getByText("Email verified!")).toBeTruthy();
    });
    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: "tok",
      refresh_token: "ref",
    });
  });

  it("handles URL-encoded characters in tokens", async () => {
    mockGetInitialURL.mockResolvedValue(
      "momentum://confirm#access_token=tok%3D%3D&refresh_token=ref%2Babc"
    );
    mockSetSession.mockResolvedValue({ error: null });

    render(<ConfirmScreen />);

    await waitFor(() => {
      expect(mockSetSession).toHaveBeenCalledWith({
        access_token: "tok==",
        refresh_token: "ref+abc",
      });
    });
  });
});
