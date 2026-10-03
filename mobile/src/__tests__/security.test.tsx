/**
 * Settings > Security — Stage 1 optional 2-step authentication (TOTP).
 *
 * Verifies:
 * 1. Navigation registration (Me stack + Settings row)
 * 2. Off state: explainer copy + Enable CTA
 * 3. Enrollment → QR shown, manual setup key hidden until deliberately
 *    revealed, raw otpauth URI never rendered, never marked On before verify
 * 4. Wrong code / expired challenge → friendly copy, fresh challenge retry
 * 5. Successful verification → On state with factor status
 * 6. Disable flow → Alert confirm, unenroll, session refresh
 * 7. Unverified-factor detection on open + discard cleanup
 * 8. mfa.ts helper behaviour (error copy is never raw Supabase text)
 *
 * RNTL v14: render/fireEvent return promises and must be awaited.
 */

import * as fs from "fs";
import * as path from "path";
import { Alert } from "react-native";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";

const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: jest.fn(),
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children, ...props }: any) =>
    require("react").createElement("SafeAreaView", props, children),
}));

jest.mock("react-native-svg", () => {
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: View,
    SvgXml: View,
  };
});

const mockListFactors = jest.fn();
const mockEnroll = jest.fn();
const mockChallenge = jest.fn();
const mockVerify = jest.fn();
const mockUnenroll = jest.fn();
const mockRefreshSession = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      mfa: {
        listFactors: (...args: any[]) => mockListFactors(...args),
        enroll: (...args: any[]) => mockEnroll(...args),
        challenge: (...args: any[]) => mockChallenge(...args),
        verify: (...args: any[]) => mockVerify(...args),
        unenroll: (...args: any[]) => mockUnenroll(...args),
      },
      refreshSession: (...args: any[]) => mockRefreshSession(...args),
    },
  },
}));

import SecurityScreen from "@/app/(app)/(me)/security";
import {
  formatSecret,
  friendlyMfaError,
  isValidTotpCode,
  pickUnverifiedTotpFactor,
  pickVerifiedTotpFactor,
  qrSvgFromDataUri,
} from "@/lib/mfa";

const SRC = path.resolve(__dirname, "..");
const ME = path.join(SRC, "app/(app)/(me)");

const unverifiedFactor = {
  id: "f_unverified",
  factor_type: "totp",
  status: "unverified",
  friendly_name: "Momentum",
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-01T00:00:00.000Z",
};

const verifiedFactor = {
  ...unverifiedFactor,
  id: "f_verified",
  status: "verified",
};

const noFactors = {
  data: {
    all: [],
    totp: [],
    phone: [],
    webauthn: [],
    recovery_code: [],
  },
  error: null,
};

const unverifiedOnly = {
  data: { all: [unverifiedFactor], totp: [] },
  error: null,
};

const verifiedFactors = {
  data: { all: [verifiedFactor], totp: [verifiedFactor] },
  error: null,
};

const enrollOk = {
  data: {
    id: "f_new",
    type: "totp",
    friendly_name: "Momentum",
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    totp: {
      qr_code:
        'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 33 33"><path d="M0 0h33v33H0z"/></svg>',
      secret: "JBSWY3DPEHPK3PXP",
      uri: "otpauth://totp/Momentum:test%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Momentum",
    },
  },
  error: null,
};

const challengeOk = {
  data: { id: "c_1", type: "totp", created_at: "2026-10-01T00:00:00.000Z" },
  error: null,
};

const verifyOk = {
  data: {
    access_token: "a",
    token_type: "bearer",
    expires_in: 3600,
    refresh_token: "r",
    user: { id: "u1" },
  },
  error: null,
};

async function renderScreen() {
  await act(async () => {
    render(<SecurityScreen />);
  });
}

async function startSetup() {
  await act(async () => {
    fireEvent.press(screen.getByTestId("security-enable"));
  });
  await waitFor(() => {
    expect(screen.getByTestId("security-qr")).toBeTruthy();
  });
}

async function enterAndVerify(code: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByTestId("security-code-input"), code);
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId("security-verify"));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRefreshSession.mockResolvedValue({ data: null, error: null });
});

// ─── Navigation registration ───

describe("Security screen navigation", () => {
  it("has security.tsx in (me)", () => {
    expect(fs.existsSync(path.join(ME, "security.tsx"))).toBe(true);
  });

  it("_layout.tsx registers the security screen", () => {
    const content = fs.readFileSync(path.join(ME, "_layout.tsx"), "utf-8");
    expect(content).toContain('name="security"');
  });

  it("settings.tsx links to /(me)/security", () => {
    const content = fs.readFileSync(path.join(ME, "settings.tsx"), "utf-8");
    expect(content).toContain('"/(me)/security"');
    expect(content).toContain(">Security<");
  });
});

// ─── Off state ───

describe("Security screen when no factor exists", () => {
  beforeEach(() => {
    mockListFactors.mockResolvedValue(noFactors);
  });

  it("shows the Off state with explainer copy and Enable CTA", async () => {
    await renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId("security-status")).toHaveTextContent("Off");
    });
    expect(screen.getByText("Keep your account secure")).toBeTruthy();
    expect(
      screen.getByText(/Add a second step when you sign in/),
    ).toBeTruthy();
    expect(
      screen.getByText(/6-digit code that your authenticator app/),
    ).toBeTruthy();
    expect(screen.getByTestId("security-enable")).toBeTruthy();
    expect(screen.queryByTestId("security-qr")).toBeNull();
  });
});

// ─── Enrollment ───

describe("Enrollment setup", () => {
  beforeEach(() => {
    mockListFactors.mockResolvedValue(noFactors);
    mockEnroll.mockResolvedValue(enrollOk);
  });

  it("enrolls a TOTP factor named Momentum", async () => {
    await renderScreen();
    await startSetup();

    expect(mockEnroll).toHaveBeenCalledWith({
      factorType: "totp",
      friendlyName: "Momentum",
    });
    expect(screen.queryByTestId("security-status")).toBeNull();
    expect(screen.queryByTestId("security-disable")).toBeNull();
  });

  it("shows the QR code but keeps the setup key hidden until asked", async () => {
    await renderScreen();
    await startSetup();

    expect(screen.getByTestId("security-qr")).toBeTruthy();
    expect(screen.queryByTestId("security-secret")).toBeNull();
    expect(screen.queryByText("JBSW Y3DP EHPK 3PXP")).toBeNull();
    expect(screen.queryByTestId("security-uri")).toBeNull();
    expect(screen.queryByText(/otpauth:\/\//)).toBeNull();
    expect(
      screen.getByText(/Open your authenticator app, add a new account/),
    ).toBeTruthy();
    expect(screen.getByTestId("security-code-input")).toBeTruthy();
    expect(screen.getByText("Set up 2-step authentication")).toBeTruthy();
    expect(screen.getByText("Show setup key")).toBeTruthy();
  });

  it("reveals the setup key on demand without ever rendering the raw otpauth URI", async () => {
    await renderScreen();
    await startSetup();

    expect(screen.queryByTestId("security-secret")).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId("security-show-key"));
    });

    expect(screen.getByText("JBSW Y3DP EHPK 3PXP")).toBeTruthy();
    expect(
      screen.getByText(/Keep this key private/),
    ).toBeTruthy();
    expect(screen.queryByText(/otpauth:\/\//)).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId("security-hide-key"));
    });

    expect(screen.queryByTestId("security-secret")).toBeNull();
    expect(screen.queryByText("JBSW Y3DP EHPK 3PXP")).toBeNull();
  });

  it("does not mark 2-step authentication On before verification", async () => {
    await renderScreen();
    await startSetup();

    expect(screen.queryByText("On")).toBeNull();
    expect(screen.queryByTestId("security-disable")).toBeNull();
    expect(screen.getByTestId("security-verify")).toBeTruthy();
  });
});

// ─── Verification ───

describe("Verification", () => {
  it("shows friendly copy for a wrong code and never the raw Supabase text", async () => {
    mockListFactors.mockResolvedValue(noFactors);
    mockEnroll.mockResolvedValue(enrollOk);
    mockChallenge.mockResolvedValue(challengeOk);
    mockVerify.mockResolvedValue({
      data: null,
      error: {
        name: "AuthApiError",
        message: "MFA validation failed: code is invalid",
        status: 400,
        code: "mfa_verification_failed",
      },
    });

    await renderScreen();
    await startSetup();
    await enterAndVerify("123456");

    await waitFor(() => {
      expect(
        screen.getByText(/That code didn't match\. Check the code/),
      ).toBeTruthy();
    });
    expect(screen.queryByText(/MFA validation failed/)).toBeNull();
    expect(screen.getByTestId("security-verify")).toBeTruthy();
    expect(mockVerify).toHaveBeenCalledTimes(1);
  });

  it("recovers from an expired challenge with a fresh challenge", async () => {
    mockListFactors
      .mockResolvedValueOnce(noFactors)
      .mockResolvedValue(verifiedFactors);
    mockEnroll.mockResolvedValue(enrollOk);
    mockChallenge
      .mockResolvedValueOnce({
        data: null,
        error: {
          name: "AuthApiError",
          message: "Challenge has expired",
          status: 400,
          code: "mfa_challenge_expired",
        },
      })
      .mockResolvedValueOnce(challengeOk);
    mockVerify.mockResolvedValue(verifyOk);

    await renderScreen();
    await startSetup();

    await enterAndVerify("123456");
    await waitFor(() => {
      expect(
        screen.getByText(/That code expired\. Enter the newest code/),
      ).toBeTruthy();
    });
    expect(screen.queryByText(/Challenge has expired/)).toBeNull();
    expect(mockVerify).not.toHaveBeenCalled();

    // Retry: a new challenge is created for the same factor.
    await enterAndVerify("654321");
    await waitFor(() => {
      expect(
        screen.getByText("2-step authentication is on"),
      ).toBeTruthy();
    });
    expect(mockChallenge).toHaveBeenCalledTimes(2);
    expect(mockVerify).toHaveBeenCalledTimes(1);
  });

  it("marks 2-step authentication On after successful verification", async () => {
    mockListFactors
      .mockResolvedValueOnce(noFactors)
      .mockResolvedValue(verifiedFactors);
    mockEnroll.mockResolvedValue(enrollOk);
    mockChallenge.mockResolvedValue(challengeOk);
    mockVerify.mockResolvedValue(verifyOk);

    await renderScreen();
    await startSetup();
    await enterAndVerify("123456");

    await waitFor(() => {
      expect(
        screen.getByText("2-step authentication is on"),
      ).toBeTruthy();
    });
    expect(screen.getByTestId("security-factor")).toBeTruthy();
    expect(screen.getByText("Momentum")).toBeTruthy();
    expect(screen.getByText("Verified")).toBeTruthy();
    expect(
      screen.getByText(/asks for a 6-digit code from your authenticator app/),
    ).toBeTruthy();
    expect(screen.getByTestId("security-disable")).toBeTruthy();
    expect(screen.queryByTestId("security-qr")).toBeNull();
  });

  it("never shows the QR code, setup key, or otpauth URI once On", async () => {
    mockListFactors.mockResolvedValue(verifiedFactors);

    await renderScreen();
    await waitFor(() => {
      expect(
        screen.getByText("2-step authentication is on"),
      ).toBeTruthy();
    });

    expect(screen.queryByTestId("security-qr")).toBeNull();
    expect(screen.queryByTestId("security-secret")).toBeNull();
    expect(screen.queryByTestId("security-show-key")).toBeNull();
    expect(screen.queryByTestId("security-uri")).toBeNull();
    expect(screen.queryByText(/otpauth:\/\//)).toBeNull();
    expect(screen.queryByText("JBSW Y3DP EHPK 3PXP")).toBeNull();
  });

  it("refuses to submit an incomplete code", async () => {
    mockListFactors.mockResolvedValue(noFactors);
    mockEnroll.mockResolvedValue(enrollOk);

    await renderScreen();
    await startSetup();

    expect(screen.getByTestId("security-verify")).toBeTruthy();
    expect(
      (screen.getByTestId("security-verify") as any).props.accessibilityState
        ?.disabled,
    ).toBe(true);

    await act(async () => {
      fireEvent.changeText(screen.getByTestId("security-code-input"), "123");
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("security-verify"));
    });
    expect(mockChallenge).not.toHaveBeenCalled();
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("enables Verify and turn on only once all six digits are entered", async () => {
    mockListFactors.mockResolvedValue(noFactors);
    mockEnroll.mockResolvedValue(enrollOk);

    await renderScreen();
    await startSetup();

    await act(async () => {
      fireEvent.changeText(screen.getByTestId("security-code-input"), "12345");
    });
    expect(
      (screen.getByTestId("security-verify") as any).props.accessibilityState
        ?.disabled,
    ).toBe(true);

    await act(async () => {
      fireEvent.changeText(screen.getByTestId("security-code-input"), "123456");
    });
    expect(
      (screen.getByTestId("security-verify") as any).props.accessibilityState
        ?.disabled,
    ).toBe(false);
    expect(screen.getByText("Verify and turn on")).toBeTruthy();
    expect(mockChallenge).not.toHaveBeenCalled();
    expect(mockVerify).not.toHaveBeenCalled();
  });
});

// ─── Disable ───

describe("Disable flow", () => {
  it("confirms, unenrolls, refreshes the session, and returns to Off", async () => {
    mockListFactors.mockResolvedValue(verifiedFactors);
    mockUnenroll.mockResolvedValue({ data: { id: "f_verified" }, error: null });

    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation((_title, _message, buttons) => {
        const destructive = (buttons ?? []).find(
          (button) => button.style === "destructive",
        );
        destructive?.onPress?.();
      });

    try {
      await renderScreen();
      await waitFor(() => {
        expect(
          screen.getByText("2-step authentication is on"),
        ).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(screen.getByTestId("security-disable"));
      });

      expect(alertSpy).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(mockUnenroll).toHaveBeenCalledWith({ factorId: "f_verified" });
      });
      expect(mockRefreshSession).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(screen.getByTestId("security-status")).toHaveTextContent("Off");
      });
      expect(screen.queryByTestId("security-factor")).toBeNull();
    } finally {
      alertSpy.mockRestore();
    }
  });

  it("stays On when unenrolling fails, with friendly copy", async () => {
    mockListFactors.mockResolvedValue(verifiedFactors);
    mockUnenroll.mockResolvedValue({
      data: null,
      error: {
        name: "AuthApiError",
        message: "row was deleted",
        status: 404,
        code: "mfa_factor_not_found",
      },
    });

    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation((_title, _message, buttons) => {
        const destructive = (buttons ?? []).find(
          (button) => button.style === "destructive",
        );
        destructive?.onPress?.();
      });

    try {
      await renderScreen();
      await waitFor(() => {
        expect(
          screen.getByText("2-step authentication is on"),
        ).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(screen.getByTestId("security-disable"));
      });

      await waitFor(() => {
        expect(
          screen.getByText(/We couldn't find that authenticator/),
        ).toBeTruthy();
      });
      expect(screen.queryByText(/row was deleted/)).toBeNull();
      expect(mockRefreshSession).not.toHaveBeenCalled();
      expect(
        screen.getByText("2-step authentication is on"),
      ).toBeTruthy();
    } finally {
      alertSpy.mockRestore();
    }
  });
});

// ─── Interrupted setup cleanup ───

describe("Unverified factor left by an interrupted setup", () => {
  beforeEach(() => {
    mockListFactors.mockResolvedValue(unverifiedOnly);
  });

  it("detects the unfinished factor on open", async () => {
    await renderScreen();

    await waitFor(() => {
      expect(screen.getByText("Setup in progress")).toBeTruthy();
    });
    expect(screen.getByText("Not finished")).toBeTruthy();
    expect(
      screen.getByText(/You started adding 2-step authentication/),
    ).toBeTruthy();
    expect(screen.getByTestId("security-discard")).toBeTruthy();
    expect(screen.getByTestId("security-verify")).toBeTruthy();
    expect(screen.queryByTestId("security-status")).toBeNull();
  });

  it("discards the unfinished factor and returns to Off", async () => {
    mockListFactors
      .mockResolvedValueOnce(unverifiedOnly)
      .mockResolvedValue(noFactors);
    mockUnenroll.mockResolvedValue({ data: { id: "f_unverified" }, error: null });

    await renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId("security-discard")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("security-discard"));
    });

    await waitFor(() => {
      expect(mockUnenroll).toHaveBeenCalledWith({ factorId: "f_unverified" });
    });
    await waitFor(() => {
      expect(screen.getByTestId("security-status")).toHaveTextContent("Off");
    });
    expect(screen.queryByText("Setup in progress")).toBeNull();
  });

  it("discarding during an in-session setup returns to Off", async () => {
    mockListFactors.mockResolvedValueOnce(noFactors).mockResolvedValue(noFactors);
    mockEnroll.mockResolvedValue(enrollOk);
    mockUnenroll.mockResolvedValue({ data: { id: "f_new" }, error: null });

    await renderScreen();
    await startSetup();

    await act(async () => {
      fireEvent.press(screen.getByTestId("security-cancel"));
    });

    await waitFor(() => {
      expect(mockUnenroll).toHaveBeenCalledWith({ factorId: "f_new" });
    });
    await waitFor(() => {
      expect(screen.getByTestId("security-status")).toHaveTextContent("Off");
    });
    expect(screen.queryByTestId("security-qr")).toBeNull();
  });
});

// ─── mfa.ts helpers ───

describe("mfa helpers", () => {
  it("maps MFA error codes to friendly copy", () => {
    expect(friendlyMfaError({ code: "mfa_verification_failed" })).toMatch(
      /didn't match/,
    );
    expect(friendlyMfaError({ code: "mfa_challenge_expired" })).toMatch(
      /expired/,
    );
    expect(friendlyMfaError({ code: "mfa_factor_not_found" })).toMatch(
      /couldn't find/,
    );
  });

  it("never returns raw Supabase text for unknown errors", () => {
    expect(
      friendlyMfaError({ code: "some_future_code", message: "raw server text" }),
    ).toBe("Something went wrong. Please try again.");
    expect(friendlyMfaError(null)).toBe(
      "Something went wrong. Please try again.",
    );
    expect(friendlyMfaError(new Error("raw"))).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("unwraps the enroll QR data URI to SVG source", () => {
    expect(
      qrSvgFromDataUri("data:image/svg+xml;utf-8,<svg></svg>"),
    ).toBe("<svg></svg>");
    expect(qrSvgFromDataUri("<svg></svg>")).toBe("<svg></svg>");
    expect(qrSvgFromDataUri("")).toBe("");
    expect(qrSvgFromDataUri(null)).toBe("");
  });

  it("picks verified and unverified TOTP factors", () => {
    expect(pickVerifiedTotpFactor(verifiedFactors.data)?.id).toBe("f_verified");
    expect(pickVerifiedTotpFactor(unverifiedOnly.data)).toBeNull();
    expect(pickUnverifiedTotpFactor(unverifiedOnly.data)?.id).toBe(
      "f_unverified",
    );
    expect(pickUnverifiedTotpFactor(verifiedFactors.data)).toBeNull();
    expect(pickVerifiedTotpFactor(null)).toBeNull();
  });

  it("validates and formats verification input", () => {
    expect(isValidTotpCode("123456")).toBe(true);
    expect(isValidTotpCode(" 123456 ")).toBe(true);
    expect(isValidTotpCode("12345")).toBe(false);
    expect(isValidTotpCode("1234567")).toBe(false);
    expect(isValidTotpCode("12345a")).toBe(false);
    expect(formatSecret("JBSWY3DPEHPK3PXP")).toBe("JBSW Y3DP EHPK 3PXP");
    expect(formatSecret("")).toBe("");
  });
});
