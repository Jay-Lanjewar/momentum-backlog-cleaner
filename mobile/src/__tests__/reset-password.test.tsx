/**
 * Tests for the reset-password screen.
 *
 * Covers session gating, password validation, updateUser outcomes,
 * and confirming-flag lifecycle.
 *
 * RNTL v14: render() and fireEvent.* return promises and must be awaited.
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

const mockGetSession = jest.fn();
const mockUpdateUser = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: (...args: any[]) => mockGetSession(...args),
      updateUser: (...args: any[]) => mockUpdateUser(...args),
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
    setUser: jest.fn(),
  });
  useAuthStore.setState = jest.fn();
  return { useAuthStore };
});

const ResetPasswordScreen = require("@/app/(auth)/reset-password").default;

function mockSessionExists() {
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: "tok" } },
  });
}

async function renderWithSession() {
  await render(<ResetPasswordScreen />);
  await waitFor(() => {
    expect(screen.getByText("Set New Password")).toBeTruthy();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSessionExists();
});

describe("ResetPasswordScreen - session requirement", () => {
  it("redirects to login when no session exists", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });

    await render(<ResetPasswordScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(auth)/login");
    });
    expect(mockSetConfirming).toHaveBeenCalledWith(false);
  });

  it("redirects to login when session has no access token", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { refresh_token: "ref" } },
    });

    await render(<ResetPasswordScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(auth)/login");
    });
  });

  it("redirects to login when getSession throws", async () => {
    mockGetSession.mockRejectedValue(new Error("storage error"));

    await render(<ResetPasswordScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(auth)/login");
    });
  });

  it("renders the form when a valid session exists", async () => {
    await renderWithSession();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("clears confirming once session is confirmed", async () => {
    await renderWithSession();
    expect(mockSetConfirming).toHaveBeenCalledWith(false);
  });

  it("shows a loading indicator before the session check resolves", async () => {
    let resolveSession!: (value: any) => void;
    mockGetSession.mockImplementation(
      () => new Promise((r) => { resolveSession = r; }),
    );

    await render(<ResetPasswordScreen />);

    expect(screen.queryByText("Set New Password")).toBeNull();

    await act(async () => {
      resolveSession({ data: { session: { access_token: "tok" } } });
    });

    await waitFor(() => {
      expect(screen.getByText("Set New Password")).toBeTruthy();
    });
  });
});

describe("ResetPasswordScreen - validation", () => {
  it("shows password mismatch warning", async () => {
    await renderWithSession();

    const inputs = screen.getAllByPlaceholderText(/character|Re-enter/i);
    await fireEvent.changeText(inputs[0], "Password1!");
    await fireEvent.changeText(inputs[1], "Password2!");

    expect(screen.getByText("Passwords do not match")).toBeTruthy();
  });

  it("does not call updateUser on password mismatch", async () => {
    await renderWithSession();

    const inputs = screen.getAllByPlaceholderText(/character|Re-enter/i);
    await fireEvent.changeText(inputs[0], "Password1!");
    await fireEvent.changeText(inputs[1], "Password2!");

    await fireEvent.press(screen.getByText("Update Password"));

    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("does not call updateUser for weak/short password", async () => {
    await renderWithSession();

    const inputs = screen.getAllByPlaceholderText(/character|Re-enter/i);
    await fireEvent.changeText(inputs[0], "abc");
    await fireEvent.changeText(inputs[1], "abc");

    await fireEvent.press(screen.getByText("Update Password"));

    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("does not call updateUser when password fields are empty", async () => {
    await renderWithSession();

    await fireEvent.press(screen.getByText("Update Password"));

    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("shows strength label for entered password", async () => {
    await renderWithSession();

    const inputs = screen.getAllByPlaceholderText(/character|Re-enter/i);
    await fireEvent.changeText(inputs[0], "Password1!");

    expect(screen.getByText("Strong")).toBeTruthy();
  });
});

describe("ResetPasswordScreen - updateUser", () => {
  async function fillValidPasswords() {
    await renderWithSession();

    const inputs = screen.getAllByPlaceholderText(/character|Re-enter/i);
    await fireEvent.changeText(inputs[0], "Password1!");
    await fireEvent.changeText(inputs[1], "Password1!");
  }

  it("calls updateUser with the new password on valid submit", async () => {
    mockUpdateUser.mockResolvedValue({ error: null });
    await fillValidPasswords();

    await fireEvent.press(screen.getByText("Update Password"));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({
        password: "Password1!",
      });
    });
  });

  it("routes to /(app) after successful password update", async () => {
    mockUpdateUser.mockResolvedValue({ error: null });
    await fillValidPasswords();

    await fireEvent.press(screen.getByText("Update Password"));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(app)");
    });
  });

  it("clears confirming after successful update", async () => {
    mockUpdateUser.mockResolvedValue({ error: null });
    await fillValidPasswords();

    await fireEvent.press(screen.getByText("Update Password"));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(app)");
    });
    expect(mockSetConfirming).toHaveBeenCalledWith(false);
  });

  it("shows inline error when updateUser returns an error", async () => {
    mockUpdateUser.mockResolvedValue({
      error: { message: "New password should be different from the old one." },
    });
    await fillValidPasswords();

    await fireEvent.press(screen.getByText("Update Password"));

    await waitFor(() => {
      expect(
        screen.getByText(
          "New password should be different from the old one.",
        ),
      ).toBeTruthy();
    });
    expect(mockReplace).not.toHaveBeenCalledWith("/(app)");
  });

  it("shows generic error when updateUser throws", async () => {
    mockUpdateUser.mockRejectedValue(new Error("Network error"));
    await fillValidPasswords();

    await fireEvent.press(screen.getByText("Update Password"));

    await waitFor(() => {
      expect(
        screen.getByText("Something went wrong. Please try again."),
      ).toBeTruthy();
    });
    expect(mockReplace).not.toHaveBeenCalledWith("/(app)");
  });
});

describe("ResetPasswordScreen - back to sign in", () => {
  it("clears confirming and navigates to login on Back to Sign In", async () => {
    await renderWithSession();

    await fireEvent.press(screen.getByText("Back to Sign In"));

    expect(mockSetConfirming).toHaveBeenCalledWith(false);
    expect(mockReplace).toHaveBeenCalledWith("/(auth)/login");
  });
});
