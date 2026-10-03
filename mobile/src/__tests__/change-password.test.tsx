/**
 * Tests for the authenticated Change Password screen (Settings > Account).
 *
 * Covers CTA gating, strength guidance, updateUser outcomes, friendly
 * (never raw Supabase) error copy, MFA/AAL mapping, visibility toggles,
 * success return to Settings, and Me route registration.
 *
 * RNTL v14: render() and fireEvent.* return promises and must be awaited.
 */

import * as fs from "fs";
import * as path from "path";
import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react-native";

const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn() };

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
}));

jest.mock("react-native-safe-area-context", () => {
  const R = require("react");
  return {
    SafeAreaView: ({ children, ...props }: any) =>
      R.createElement("SafeAreaView", props, children),
  };
});

const mockUpdateUser = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      updateUser: (...args: any[]) => mockUpdateUser(...args),
    },
  },
}));

const ChangePasswordScreen =
  require("@/app/(app)/(me)/change-password").default;

const SUBMIT = "change-password-submit";
const VALID_PASSWORD = "Abcd1234!";

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateUser.mockResolvedValue({ data: { user: {} }, error: null });
});

async function renderScreen() {
  await render(<ChangePasswordScreen />);
}

async function fillPasswords(
  newPassword = VALID_PASSWORD,
  confirmPassword = newPassword,
) {
  await fireEvent.changeText(
    screen.getByTestId("change-password-new"),
    newPassword,
  );
  await fireEvent.changeText(
    screen.getByTestId("change-password-confirm"),
    confirmPassword,
  );
}

// ─── Renders ───

describe("ChangePasswordScreen - rendering", () => {
  it("renders the form fields and the update CTA", async () => {
    await renderScreen();

    expect(screen.getByText("Change Password")).toBeTruthy();
    expect(screen.getByText("New Password")).toBeTruthy();
    expect(screen.getByText("Confirm New Password")).toBeTruthy();
    expect(screen.getByText("Choose a new password for your account.")).toBeTruthy();
    expect(screen.getByText("Update password")).toBeTruthy();
    expect(screen.getByTestId("change-password-new")).toBeTruthy();
    expect(screen.getByTestId("change-password-confirm")).toBeTruthy();
    expect(screen.getByTestId("change-password-back")).toBeTruthy();
  });
});

// ─── CTA gating ───

describe("ChangePasswordScreen - CTA gating", () => {
  it("keeps the CTA disabled while the password is too short", async () => {
    await renderScreen();
    await fillPasswords("Abc12", "Abc12");

    expect(
      screen.getByTestId(SUBMIT).props.accessibilityState?.disabled,
    ).toBe(true);

    await fireEvent.press(screen.getByTestId(SUBMIT));
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("keeps the CTA disabled while confirmation does not match", async () => {
    await renderScreen();
    await fillPasswords(VALID_PASSWORD, "Abcd1235!");

    expect(
      screen.getByTestId(SUBMIT).props.accessibilityState?.disabled,
    ).toBe(true);
    expect(screen.getByTestId("change-password-mismatch")).toBeTruthy();

    await fireEvent.press(screen.getByTestId(SUBMIT));
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("enables the CTA when the password is valid and matches", async () => {
    await renderScreen();
    await fillPasswords();

    expect(
      screen.getByTestId(SUBMIT).props.accessibilityState?.disabled,
    ).toBe(false);
    expect(screen.queryByTestId("change-password-mismatch")).toBeNull();
  });
});

// ─── Strength guidance ───

describe("ChangePasswordScreen - strength guidance", () => {
  it("shows shared passwordStrength labels as the password is typed", async () => {
    await renderScreen();
    expect(screen.queryByTestId("change-password-strength")).toBeNull();

    await fireEvent.changeText(
      screen.getByTestId("change-password-new"),
      "abcdefgh",
    );
    expect(screen.getByText("Weak")).toBeTruthy();

    await fireEvent.changeText(
      screen.getByTestId("change-password-new"),
      VALID_PASSWORD,
    );
    expect(screen.getByText("Strong")).toBeTruthy();
  });
});

// ─── Update outcomes ───

describe("ChangePasswordScreen - updateUser outcomes", () => {
  it("calls supabase.auth.updateUser with only the new password", async () => {
    await renderScreen();
    await fillPasswords();

    await fireEvent.press(screen.getByTestId(SUBMIT));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: VALID_PASSWORD });
    });
    expect(screen.getByTestId("change-password-success")).toBeTruthy();
  });

  it("clears the password fields after a successful update", async () => {
    await renderScreen();
    await fillPasswords();

    await fireEvent.press(screen.getByTestId(SUBMIT));

    await waitFor(() => {
      expect(screen.getByTestId("change-password-success")).toBeTruthy();
    });
    expect(screen.getByTestId("change-password-new").props.value).toBe("");
    expect(screen.getByTestId("change-password-confirm").props.value).toBe("");
  });

  it("returns to the previous screen after a successful update", async () => {
    jest.useFakeTimers();
    try {
      await renderScreen();
      await fillPasswords();
      await fireEvent.press(screen.getByTestId(SUBMIT));
      expect(screen.getByTestId("change-password-success")).toBeTruthy();

      await act(async () => {
        jest.advanceTimersByTime(1100);
      });

      expect(mockRouter.back).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("shows a friendly error and never raw Supabase text on failure", async () => {
    mockUpdateUser.mockResolvedValue({
      data: null,
      error: {
        code: "validation_failed",
        message: "Password should contain at least one symbol",
      },
    });

    await renderScreen();
    await fillPasswords();
    await fireEvent.press(screen.getByTestId(SUBMIT));

    await waitFor(() => {
      expect(screen.getByTestId("change-password-error")).toBeTruthy();
    });
    expect(
      screen.getByText("Something went wrong. Please try again."),
    ).toBeTruthy();
    expect(
      screen.queryByText("Password should contain at least one symbol"),
    ).toBeNull();
    expect(screen.queryByTestId("change-password-success")).toBeNull();
  });

  it("shows a friendly offline error when updateUser throws", async () => {
    mockUpdateUser.mockRejectedValue(
      new TypeError("Network request failed"),
    );

    await renderScreen();
    await fillPasswords();
    await fireEvent.press(screen.getByTestId(SUBMIT));

    await waitFor(() => {
      expect(
        screen.getByText("You're offline. Check your connection and try again."),
      ).toBeTruthy();
    });
    expect(screen.queryByText("Network request failed")).toBeNull();
  });

  it("maps MFA/AAL-related errors to friendly copy", async () => {
    mockUpdateUser.mockResolvedValue({
      data: null,
      error: { code: "insufficient_aal", message: "AAL claim required" },
    });

    await renderScreen();
    await fillPasswords();
    await fireEvent.press(screen.getByTestId(SUBMIT));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Sign out, then sign in again to manage 2-step authentication.",
        ),
      ).toBeTruthy();
    });
    expect(screen.queryByText("AAL claim required")).toBeNull();
  });
});

// ─── Visibility toggle ───

describe("ChangePasswordScreen - visibility toggle", () => {
  it("toggles password visibility per field", async () => {
    await renderScreen();

    expect(screen.getByTestId("change-password-new").props.secureTextEntry).toBe(true);
    expect(screen.getByTestId("change-password-confirm").props.secureTextEntry).toBe(true);
    expect(screen.getAllByText("Show")).toHaveLength(2);

    await fireEvent.press(screen.getByTestId("change-password-toggle-new"));

    expect(screen.getByTestId("change-password-new").props.secureTextEntry).toBe(false);
    expect(screen.getByTestId("change-password-confirm").props.secureTextEntry).toBe(true);
    expect(screen.getByText("Hide")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("change-password-toggle-confirm"));

    expect(screen.getByTestId("change-password-confirm").props.secureTextEntry).toBe(false);
    expect(screen.getAllByText("Hide")).toHaveLength(2);
  });
});

// ─── Navigation registration ───

describe("Change password navigation registration", () => {
  const ME = path.resolve(__dirname, "..", "app", "(app)", "(me)");

  it("has change-password.tsx in (me)", () => {
    expect(fs.existsSync(path.join(ME, "change-password.tsx"))).toBe(true);
  });

  it("_layout.tsx registers the change-password screen", () => {
    const content = fs.readFileSync(path.join(ME, "_layout.tsx"), "utf-8");
    expect(content).toContain('name="change-password"');
  });

  it("settings.tsx links to /(me)/change-password with a stable testID", () => {
    const content = fs.readFileSync(path.join(ME, "settings.tsx"), "utf-8");
    expect(content).toContain('"/(me)/change-password"');
    expect(content).toContain('testID="settings-change-password-row"');
  });

  it("uses the shared MeHeader and never logs the password", () => {
    const content = fs.readFileSync(
      path.join(ME, "change-password.tsx"),
      "utf-8",
    );
    expect(content).toContain("<MeHeader");
    expect(content).toContain('screen="change-password"');
    expect(content).not.toContain("console.");
    expect(content).not.toContain("Alert.alert");
  });
});
