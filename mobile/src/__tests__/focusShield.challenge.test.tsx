import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { FocusShieldChallenge } from "@/components/focus/FocusShieldChallenge";
import { EMPTY_PROGRESS, masteryKey } from "@/focusShield/adaptive";
import { getThemeColors } from "@/theme/tokens";
import { useFocusShieldStore } from "@/store/useFocusShieldStore";

const mockThemeValue = { mode: "light" as "light" | "dark", colors: {
  background: "#fff", surface: "#fff", elevatedSurface: "#fff", card: "#fff", dialog: "#fff", inputBackground: "#fff",
  primaryText: "#111", secondaryText: "#333", mutedText: "#666", placeholder: "#888", border: "#ddd", divider: "#ddd",
  accent: "#2563eb", accentForeground: "#fff", accentText: "#1d4ed8", accentSoftForeground: "#1d4ed8", accentSoft: "#eff6ff",
  accentPressed: "#1d4ed8", selected: "#eff6ff", pressed: "#f1f5f9", tabBar: "#fff", tabBarBorder: "#ddd", success: "#047857",
  warning: "#b45309", error: "#b91c1c", info: "#1d4ed8",
} };
const mockBacklogState = { data: { id: "task-1", title: "Motion practice", description: "Speed and distance-time", course_id: "course-1" } as { id: string; title: string; description: string; course_id: string } | null, isLoading: false, error: null as Error | null, refetch: jest.fn() };

jest.mock("@/theme/ThemeProvider", () => ({ useTheme: () => mockThemeValue }));
jest.mock("@/services/hooks", () => ({
  useBacklogItem: () => mockBacklogState,
}));

const baseProps = { visible: true, onClose: jest.fn(), userId: "student-1", backlogItemId: "task-1", taskTitle: "Motion practice", courseName: "Physics", className: "Class 9", boardName: "CBSE" };
const themeCases = (["light", "dark"] as const).flatMap((mode) =>
  (["blue", "violet", "emerald", "rose", "amber"] as const).map((accent) => [mode, accent] as const),
);

describe("Focus Shield mobile challenge", () => {
  beforeEach(() => {
    useFocusShieldStore.setState({ userId: null, progress: EMPTY_PROGRESS, storageError: false });
    mockBacklogState.data = { id: "task-1", title: "Motion practice", description: "Speed and distance-time", course_id: "course-1" };
    mockBacklogState.isLoading = false;
    mockBacklogState.error = null;
    mockBacklogState.refetch.mockClear();
  });

  it.each(themeCases)("renders with semantic tokens in %s mode and %s accent", async (mode, accent) => {
    mockThemeValue.mode = mode;
    mockThemeValue.colors = getThemeColors(mode, accent);
    const screen = await render(<FocusShieldChallenge {...baseProps} />);
    expect(screen.getByText("MOMENTUM · FOCUS SHIELD")).toBeTruthy();
    expect(screen.getByText("This preview does not block or monitor other apps.")).toBeTruthy();
    expect(screen.getAllByText(/Class 9/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("focus-shield-root").props.style).toContainEqual(expect.objectContaining({ backgroundColor: mockThemeValue.colors.background }));
    expect(screen.getByText("MOMENTUM · FOCUS SHIELD").props.style).toContainEqual(expect.objectContaining({ color: mockThemeValue.colors.accentText }));
  }, 15000);

  it("confirms active-session context and completes an answer with explanation", async () => {
    mockThemeValue.mode = "light";
    const screen = await render(<FocusShieldChallenge {...baseProps} />);
    expect(screen.getByText("Motion practice")).toBeTruthy();
    expect(screen.getByText("Motion")).toBeTruthy();
    await fireEvent.press(screen.getByText("Confirm topic and begin check-in"));
    await waitFor(() => expect(screen.getByText(/A cyclist travels 120 m/)).toBeTruthy());
    await fireEvent.press(screen.getByText("Show a hint"));
    expect(screen.getByText(/Average speed = distance ÷ time/)).toBeTruthy();
    await fireEvent.press(screen.getAllByRole("radio")[0]);
    await fireEvent.press(screen.getByText("Check answer"));
    await waitFor(() => expect(screen.getByText("That’s right")).toBeTruthy());
    expect(screen.getByText(/120 ÷ 20 = 6 m\/s/)).toBeTruthy();
    const speed = useFocusShieldStore.getState().progress.skills[masteryKey("physics", "physics-motion", "speed")];
    expect(speed.attempts).toBe(1);
    expect(speed.hinted).toBe(1);
    expect(speed.mastery).toBe(50);
  });

  it("shows non-shaming feedback for a wrong answer and closes without completing Focus", async () => {
    const onClose = jest.fn();
    const screen = await render(<FocusShieldChallenge {...baseProps} onClose={onClose} />);
    await fireEvent.press(screen.getByText("Confirm topic and begin check-in"));
    await waitFor(() => expect(screen.getByText(/A cyclist travels 120 m/)).toBeTruthy());
    await fireEvent.press(screen.getAllByRole("radio")[1]);
    await fireEvent.press(screen.getByText("Check answer"));
    await waitFor(() => expect(screen.getByText("Good practice")).toBeTruthy());
    expect(screen.getByText(/Every attempt helps us find a useful level/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Close challenge"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("offers a clear unsupported curriculum fallback", async () => {
    const screen = await render(<FocusShieldChallenge {...baseProps} className="Class 12" />);
    expect(screen.getByText("This curriculum isn’t available yet")).toBeTruthy();
    expect(screen.getByText(/Your Focus session is unaffected/)).toBeTruthy();
  });

  it("shows recoverable task loading and error states", async () => {
    mockBacklogState.isLoading = true;
    const loading = await render(<FocusShieldChallenge {...baseProps} />);
    expect(loading.getByText(/continue with the study context above/i)).toBeTruthy();
    await fireEvent.press(loading.getByText("Confirm topic and begin check-in"));
    await waitFor(() => expect(loading.getByText(/A cyclist travels 120 m/)).toBeTruthy());
    await loading.unmount();

    mockBacklogState.isLoading = false;
    mockBacklogState.data = null;
    mockBacklogState.error = new Error("offline");
    const failed = await render(<FocusShieldChallenge {...baseProps} />);
    expect(failed.getByText(/Task details are temporarily unavailable/)).toBeTruthy();
    await fireEvent.press(failed.getByText("Retry"));
    expect(mockBacklogState.refetch).toHaveBeenCalled();
  });
});
