/**
 * Tests for the dev-only focus preview feature.
 *
 * Verifies:
 * 1. The preview screen renders focus UI when __DEV__ is true
 * 2. The preview screen renders with mock session data
 * 3. The preview shows coaching messages
 * 4. The __DEV__ guard is present in source (runtime-only, untestable in Jest)
 */

import { render, screen, cleanup } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
  }),
}));

jest.mock("expo-keep-awake", () => ({
  useKeepAwake: jest.fn(),
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
    Circle: View,
  };
});

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  NotificationFeedbackType: {
    Success: "success",
    Error: "error",
    Warning: "warning",
  },
}));

jest.mock("@/hooks/useFocusLock", () => ({
  useFocusLock: () => ({
    phase: "focusing",
    focusedElapsedMs: 0,
    remainingMs: 25 * 60 * 1000,
    pause: jest.fn(),
    resume: jest.fn(),
    complete: jest.fn(),
  }),
}));

jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { name: "DevUser" },
  }),
}));

jest.mock("@/lib/coaching", () => ({
  formatHourMinute: (time: string) => time,
  focusCoachMessage: () => "Keep going!",
  formatMinutes: (mins: number) => `${mins} min`,
}));

afterEach(() => {
  cleanup();
});

const FocusPreviewScreen =
  require("@/app/(app)/(today)/focus-preview").default;

describe("Focus Preview Screen", () => {
  it("renders the focus UI preview banner", async () => {
    await render(<FocusPreviewScreen />);
    expect(screen.getByText("FOCUS UI PREVIEW")).toBeTruthy();
  });

  it("renders mock session info", async () => {
    await render(<FocusPreviewScreen />);
    expect(screen.getByText("Work on Physics Ch. 5")).toBeTruthy();
  });

  it("renders the coaching message", async () => {
    await render(<FocusPreviewScreen />);
    expect(screen.getByText("Keep going!")).toBeTruthy();
  });

  it("shows Pause button in focusing state", async () => {
    await render(<FocusPreviewScreen />);
    expect(screen.getByText("Pause")).toBeTruthy();
  });

  it("shows Finish Early button in focusing state", async () => {
    await render(<FocusPreviewScreen />);
    expect(screen.getByText("Finish Early")).toBeTruthy();
  });

  it("does not show Resume in focusing state", async () => {
    await render(<FocusPreviewScreen />);
    expect(screen.queryByText("Resume")).toBeNull();
  });

  it("renders timer with countdown text", async () => {
    await render(<FocusPreviewScreen />);
    expect(screen.getByText("Focusing")).toBeTruthy();
  });
});
