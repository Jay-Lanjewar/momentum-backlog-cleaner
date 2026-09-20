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
const mockAddEventListener = jest.fn();
const mockRemoveFn = jest.fn();
let urlCallback: ((event: { url: string }) => void) | null = null;

jest.mock("expo-linking", () => ({
  getInitialURL: (...args: any[]) => mockGetInitialURL(...args),
  addEventListener: (...args: any[]) => mockAddEventListener(...args),
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

beforeEach(() => {
  urlCallback = null;
  mockGetInitialURL.mockReset();
  mockSetSession.mockReset();
  mockAddEventListener.mockReset();
  mockAddEventListener.mockReturnValue({ remove: mockRemoveFn });
  mockRemoveFn.mockReset();
  mockSetConfirming.mockReset();
  mockReplace.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("ConfirmScreen - cold start (getInitialURL)", () => {
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

  it("sets confirming=true before processing", async () => {
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

  it("keeps confirming=true on success (not reset to false)", async () => {
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

describe("ConfirmScreen - warm start (addEventListener)", () => {
  it("processes URL delivered via addEventListener when getInitialURL is pending", async () => {
    mockAddEventListener.mockImplementation((event: string, cb: any) => {
      if (event === "url") urlCallback = cb;
      return { remove: mockRemoveFn };
    });
    mockGetInitialURL.mockReturnValue(new Promise(() => {}));
    mockSetSession.mockResolvedValue({ error: null });

    await act(async () => {
      render(<ConfirmScreen />);
    });

    await act(async () => {
      urlCallback?.({
        url: "momentum://confirm#access_token=warm&refresh_token=start&type=signup",
      });
    });

    await waitFor(() => {
      expect(mockSetSession).toHaveBeenCalledWith({
        access_token: "warm",
        refresh_token: "start",
      });
    });
  });

  it("shows success for warm-start URL", async () => {
    mockAddEventListener.mockImplementation((event: string, cb: any) => {
      if (event === "url") urlCallback = cb;
      return { remove: mockRemoveFn };
    });
    mockGetInitialURL.mockReturnValue(new Promise(() => {}));
    mockSetSession.mockResolvedValue({ error: null });

    await act(async () => {
      render(<ConfirmScreen />);
    });

    await act(async () => {
      urlCallback?.({
        url: "momentum://confirm#access_token=tok&refresh_token=ref",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Email verified!")).toBeTruthy();
    });
  });

  it("shows error for invalid warm-start URL", async () => {
    mockAddEventListener.mockImplementation((event: string, cb: any) => {
      if (event === "url") urlCallback = cb;
      return { remove: mockRemoveFn };
    });
    mockGetInitialURL.mockReturnValue(new Promise(() => {}));

    await act(async () => {
      render(<ConfirmScreen />);
    });

    await act(async () => {
      urlCallback?.({
        url: "momentum://confirm#bad",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Invalid or expired confirmation link.")).toBeTruthy();
    });
  });
});

describe("ConfirmScreen - dual delivery (both paths fire)", () => {
  it("processes getInitialURL URL first, ignores addEventListener", async () => {
    mockAddEventListener.mockImplementation((event: string, cb: any) => {
      if (event === "url") urlCallback = cb;
      return { remove: mockRemoveFn };
    });
    mockGetInitialURL.mockResolvedValue(
      "momentum://confirm#access_token=cold&refresh_token=start"
    );
    mockSetSession.mockResolvedValue({ error: null });

    await act(async () => {
      render(<ConfirmScreen />);
    });

    await waitFor(() => {
      expect(mockSetSession).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      urlCallback?.({
        url: "momentum://confirm#access_token=warm&refresh_token=event",
      });
    });

    expect(mockSetSession).toHaveBeenCalledTimes(1);
    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: "cold",
      refresh_token: "start",
    });
  });

  it("processes addEventListener URL when getInitialURL is pending", async () => {
    mockAddEventListener.mockImplementation((event: string, cb: any) => {
      if (event === "url") urlCallback = cb;
      return { remove: mockRemoveFn };
    });
    mockGetInitialURL.mockReturnValue(new Promise(() => {}));
    mockSetSession.mockResolvedValue({ error: null });

    await act(async () => {
      render(<ConfirmScreen />);
    });

    await act(async () => {
      urlCallback?.({
        url: "momentum://confirm#access_token=warm&refresh_token=event",
      });
    });

    await waitFor(() => {
      expect(mockSetSession).toHaveBeenCalledTimes(1);
    });

    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: "warm",
      refresh_token: "event",
    });
  });
});

describe("ConfirmScreen - error states", () => {
  it("shows error when getInitialURL returns null", async () => {
    mockGetInitialURL.mockResolvedValue(null);

    render(<ConfirmScreen />);

    await waitFor(() => {
      expect(screen.getByText("Confirmation failed")).toBeTruthy();
    });
    expect(screen.getByText("No confirmation data found.")).toBeTruthy();
  });

  it("sets confirming=false on null URL error", async () => {
    mockGetInitialURL.mockResolvedValue(null);

    render(<ConfirmScreen />);

    await waitFor(() => {
      expect(mockSetConfirming).toHaveBeenCalledWith(false);
    });
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

describe("ConfirmScreen - cleanup and unmount", () => {
  it("renders without crashing when getInitialURL hangs", async () => {
    mockGetInitialURL.mockReturnValue(new Promise(() => {}));

    await act(async () => {
      render(<ConfirmScreen />);
    });

    expect(screen.getByText(/Verifying your email/)).toBeTruthy();
  });

  it("does not call setSession when URL never arrives", async () => {
    mockGetInitialURL.mockReturnValue(new Promise(() => {}));

    await act(async () => {
      render(<ConfirmScreen />);
    });

    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it("has addEventListener registered for URL events", async () => {
    mockGetInitialURL.mockReturnValue(new Promise(() => {}));

    await act(async () => {
      render(<ConfirmScreen />);
    });

    expect(mockAddEventListener).toHaveBeenCalledWith("url", expect.any(Function));
  });
});
