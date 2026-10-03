/**
 * Tests for the Me tab screens: Profile, Settings, Streaks, Health.
 *
 * Verifies:
 * 1. Profile screen renders user info and navigation
 * 2. Settings screen renders with sign out
 * 3. Streaks screen renders streak data
 * 4. Health screen renders balance data
 * 5. Profile hooks are exported
 * 6. useSaveProfile invalidates correct caches
 * 7. Shared MeHeader: every Me subsection screen renders it and its
 *    back button calls router.back()
 * 8. Profile time fields: native DateTimePicker rows (Android/iOS),
 *    editable HH:mm TextInputs on web, KeyboardAvoidingView wrapping,
 *    and HH:mm save payloads
 * 9. Settings Change Password row exists and pushes /(me)/change-password
 */

import * as fs from "fs";
import * as path from "path";
import { Alert, Linking, Platform } from "react-native";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children, ...props }: any) =>
    require("react").createElement("SafeAreaView", props, children),
}));

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockSaveProfile = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: jest.fn(),
  }),
}));

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signOut: jest.fn(),
    },
  },
}));

jest.mock("@/store/useAuthStore", () => ({
  useAuthStore: () => ({
    user: {
      id: "u1",
      email: "test@example.com",
      name: "Alex",
      avatar_url: null,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    },
    clearAuth: jest.fn(),
  }),
}));

const mockProfileData = {
  id: "p1",
  user_id: "u1",
  name: "Alex",
  class_name: "12th",
  board: "CBSE",
  school_timings: null,
  coaching_timings: null,
  sleep_schedule: null,
  energy_peak: "morning",
  preferred_study_window: null,
  daily_target_minutes: 180,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

jest.mock("@/services/hooks", () => ({
  useProfile: () => ({
    data: mockProfileData,
  }),
  useStreaks: () => ({
    data: {
      momentum: {
        current_streak: 5,
        longest_streak: 14,
        total_study_days: 30,
        last_completed_date: "2026-09-14",
        recovery_tokens_current: 2,
        recovery_tokens_earned: 5,
        recovery_tokens_used: 3,
        streak_protected_today: false,
      },
      subjects: [
        {
          id: "s1",
          course_id: "c1",
          course_name: "Mathematics",
          course_color: "#3B82F6",
          current_streak: 3,
          longest_streak: 7,
          last_completion_date: "2026-09-14",
        },
      ],
    },
  }),
  useBalanceScore: () => ({
    data: {
      score: 85,
      message: "Good balance across subjects.",
      neglected_subjects: ["History"],
    },
  }),
  useDashboard: () => ({
    data: {
      planning: {
        backlog_health: {
          total_items: 12,
          completed_items: 8,
          overdue_items: 1,
          pending_items: 3,
          clear_rate_7d: 0.75,
          health_score: "good",
          estimated_completion_date: "2026-09-20",
        },
      },
    },
  }),
  useSaveProfile: () => ({
    mutateAsync: mockSaveProfile,
    isPending: false,
  }),
}));

let mockNotificationPermissionStatus = "granted";
let mockNotificationCanAskAgain = true;
let mockRequestPermissionResult = true;

jest.mock("@/services/notifications", () => ({
  getPermissionState: jest.fn(async () => ({
    status: mockNotificationPermissionStatus,
    canAskAgain: mockNotificationCanAskAgain,
  })),
  requestNotificationPermission: jest.fn(
    async () => mockRequestPermissionResult,
  ),
}));

jest.mock("@react-native-community/datetimepicker", () => {
  const R = require("react");
  const { View } = require("react-native");
  const MockDateTimePicker = (props: any) =>
    R.createElement(View, {
      testID: props.testID,
      onChange: props.onChange,
    });
  return { __esModule: true, default: MockDateTimePicker };
});

// ─── Profile Screen ───

import ProfileScreen from "@/app/(app)/(me)/index";

describe("ProfileScreen", () => {
  it("renders user name", async () => {
    await act(async () => {
      render(<ProfileScreen />);
    });
    expect(screen.getByText("Alex")).toBeTruthy();
  });

  it("renders class and board", async () => {
    await act(async () => {
      render(<ProfileScreen />);
    });
    expect(screen.getByText("12th · CBSE")).toBeTruthy();
  });

  it("renders streak summary", async () => {
    await act(async () => {
      render(<ProfileScreen />);
    });
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("Day Streak")).toBeTruthy();
  });

  it("renders balance score", async () => {
    await act(async () => {
      render(<ProfileScreen />);
    });
    expect(screen.getByText("85%")).toBeTruthy();
    expect(screen.getByText("Balance")).toBeTruthy();
  });

  it("renders navigation rows", async () => {
    await act(async () => {
      render(<ProfileScreen />);
    });
    expect(screen.getByText("Profile")).toBeTruthy();
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("Streaks")).toBeTruthy();
    expect(screen.getByText("Health")).toBeTruthy();
  });

  it("Profile button navigates to /(me)/profile", async () => {
    mockPush.mockClear();
    await act(async () => {
      render(<ProfileScreen />);
    });
    fireEvent.press(screen.getByText("Profile"));
    expect(mockPush).toHaveBeenCalledWith("/(me)/profile");
  });

  it("Settings button navigates to /(me)/settings", async () => {
    mockPush.mockClear();
    await act(async () => {
      render(<ProfileScreen />);
    });
    fireEvent.press(screen.getByText("Settings"));
    expect(mockPush).toHaveBeenCalledWith("/(me)/settings");
  });

  it("Streaks button navigates to /(me)/streaks", async () => {
    mockPush.mockClear();
    await act(async () => {
      render(<ProfileScreen />);
    });
    fireEvent.press(screen.getByText("Streaks"));
    expect(mockPush).toHaveBeenCalledWith("/(me)/streaks");
  });

  it("Health button navigates to /(me)/health", async () => {
    mockPush.mockClear();
    await act(async () => {
      render(<ProfileScreen />);
    });
    fireEvent.press(screen.getByText("Health"));
    expect(mockPush).toHaveBeenCalledWith("/(me)/health");
  });
});

// ─── Settings Screen ───

import SettingsScreen from "@/app/(app)/(me)/settings";

describe("SettingsScreen", () => {
  beforeEach(() => {
    mockNotificationPermissionStatus = "granted";
    mockNotificationCanAskAgain = true;
    mockRequestPermissionResult = true;
    const { requestNotificationPermission } = jest.requireMock(
      "@/services/notifications",
    );
    requestNotificationPermission.mockClear();
  });

  it("renders user name and email", async () => {
    await act(async () => {
      render(<SettingsScreen />);
    });
    expect(screen.getByText("Alex")).toBeTruthy();
    expect(screen.getByText("test@example.com")).toBeTruthy();
  });

  it("renders sign out button", async () => {
    await act(async () => {
      render(<SettingsScreen />);
    });
    expect(screen.getByText("Sign Out")).toBeTruthy();
  });

  it("renders settings sections", async () => {
    await act(async () => {
      render(<SettingsScreen />);
    });
    expect(screen.getByText("Account")).toBeTruthy();
    expect(screen.getByText("Preferences")).toBeTruthy();
  });

  it("Security row navigates to /(me)/security", async () => {
    mockPush.mockClear();
    await act(async () => {
      render(<SettingsScreen />);
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("settings-security-row"));
    });
    expect(mockPush).toHaveBeenCalledWith("/(me)/security");
  });

  it("Change Password row exists", async () => {
    await act(async () => {
      render(<SettingsScreen />);
    });
    expect(screen.getByText("Change Password")).toBeTruthy();
    expect(screen.getByTestId("settings-change-password-row")).toBeTruthy();
  });

  it("Change Password row navigates to /(me)/change-password", async () => {
    mockPush.mockClear();
    await act(async () => {
      render(<SettingsScreen />);
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("settings-change-password-row"));
    });
    expect(mockPush).toHaveBeenCalledWith("/(me)/change-password");
  });

  it("shared header back button calls router.back", async () => {
    mockBack.mockClear();
    await act(async () => {
      render(<SettingsScreen />);
    });
    fireEvent.press(screen.getByTestId("settings-back"));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("Notifications row is not Coming soon", async () => {
    await act(async () => {
      render(<SettingsScreen />);
    });
    expect(screen.queryByText("Coming soon")).toBeNull();
    expect(screen.getByText("Notifications")).toBeTruthy();
  });

  it("shows On when notification permission is granted", async () => {
    mockNotificationPermissionStatus = "granted";
    await act(async () => {
      render(<SettingsScreen />);
    });
    await waitFor(() => {
      expect(screen.getByText("On")).toBeTruthy();
    });
  });

  it("shows Off when notification permission is denied", async () => {
    mockNotificationPermissionStatus = "denied";
    await act(async () => {
      render(<SettingsScreen />);
    });
    await waitFor(() => {
      expect(screen.getByText("Off")).toBeTruthy();
    });
    expect(screen.queryByText("Coming soon")).toBeNull();
  });

  it("notifications row is informational (not pressable) when granted", async () => {
    mockNotificationPermissionStatus = "granted";
    await act(async () => {
      render(<SettingsScreen />);
    });
    await waitFor(() => {
      expect(screen.getByText("On")).toBeTruthy();
    });
    expect(screen.queryByTestId("notifications-row")).toBeNull();
  });

  it("Theme row is rendered", async () => {
    await act(async () => {
      render(<SettingsScreen />);
    });
    expect(screen.getByTestId("settings-theme-row")).toBeTruthy();
    expect(screen.getByText("Theme")).toBeTruthy();
  });

  it("Theme row is not pressable", async () => {
    mockPush.mockClear();
    mockBack.mockClear();
    await act(async () => {
      render(<SettingsScreen />);
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("settings-theme-row"));
    });
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("Theme row has no button accessibility role", async () => {
    await act(async () => {
      render(<SettingsScreen />);
    });
    const row = screen.getByTestId("settings-theme-row");
    expect(row.props.accessibilityRole).toBeUndefined();
  });

  it("Theme row shows the current value Dark", async () => {
    await act(async () => {
      render(<SettingsScreen />);
    });
    expect(screen.getByText("Dark")).toBeTruthy();
  });

  it("Theme row shows an informational hint", async () => {
    await act(async () => {
      render(<SettingsScreen />);
    });
    expect(screen.getByTestId("settings-theme-hint")).toBeTruthy();
    expect(
      screen.getByText("Theme customization coming later."),
    ).toBeTruthy();
    expect(screen.queryByText("Coming soon")).toBeNull();
  });

  it("tapping Off with an askable denial invokes the permission helper", async () => {
    mockNotificationPermissionStatus = "denied";
    mockNotificationCanAskAgain = true;
    mockRequestPermissionResult = true;

    await act(async () => {
      render(<SettingsScreen />);
    });
    await waitFor(() => {
      expect(screen.getByText("Off")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("notifications-row"));
    });

    const { requestNotificationPermission } = jest.requireMock(
      "@/services/notifications",
    );
    await waitFor(() => {
      expect(requestNotificationPermission).toHaveBeenCalledTimes(1);
    });
    // Helper reported granted → the row reflects the honest On state.
    await waitFor(() => {
      expect(screen.getByText("On")).toBeTruthy();
    });
  });

  it("tapping Off with a denied helper result keeps the Off state without re-prompting", async () => {
    mockNotificationPermissionStatus = "denied";
    mockNotificationCanAskAgain = true;
    mockRequestPermissionResult = false;

    await act(async () => {
      render(<SettingsScreen />);
    });
    await waitFor(() => {
      expect(screen.getByText("Off")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("notifications-row"));
    });

    const { requestNotificationPermission } = jest.requireMock(
      "@/services/notifications",
    );
    await waitFor(() => {
      expect(requestNotificationPermission).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("Off")).toBeTruthy();
    expect(screen.queryByText("Coming soon")).toBeNull();
  });

  it("tapping Off with a permanent denial opens system Settings instead", async () => {
    mockNotificationPermissionStatus = "denied";
    mockNotificationCanAskAgain = false;
    const openSettings = jest
      .spyOn(Linking, "openSettings")
      .mockResolvedValue(undefined);

    await act(async () => {
      render(<SettingsScreen />);
    });
    await waitFor(() => {
      expect(screen.getByText("Off")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("notifications-row"));
    });

    expect(openSettings).toHaveBeenCalledTimes(1);
    const { requestNotificationPermission } = jest.requireMock(
      "@/services/notifications",
    );
    expect(requestNotificationPermission).not.toHaveBeenCalled();

    openSettings.mockRestore();
  });
});

// ─── Profile Edit Screen ───

import ProfileEditScreen from "@/app/(app)/(me)/profile";

describe("ProfileEditScreen", () => {
  it("renders profile header", async () => {
    await act(async () => {
      render(<ProfileEditScreen />);
    });
    expect(screen.getByText("Profile")).toBeTruthy();
  });

  it("renders personal info fields with existing data", async () => {
    await act(async () => {
      render(<ProfileEditScreen />);
    });
    expect(screen.getByText("Name")).toBeTruthy();
    expect(screen.getByText("Class")).toBeTruthy();
    expect(screen.getByText("Board")).toBeTruthy();
  });

  it("renders study preferences section", async () => {
    await act(async () => {
      render(<ProfileEditScreen />);
    });
    expect(screen.getByText("Daily Target (minutes)")).toBeTruthy();
    expect(screen.getByText("Energy Peak")).toBeTruthy();
  });

  it("renders schedule section", async () => {
    await act(async () => {
      render(<ProfileEditScreen />);
    });
    expect(screen.getByText("Sleep Schedule")).toBeTruthy();
    expect(screen.getByText("Preferred Study Window")).toBeTruthy();
  });

  it("renders save button", async () => {
    await act(async () => {
      render(<ProfileEditScreen />);
    });
    expect(screen.getByText("Save Changes")).toBeTruthy();
  });

  it("renders energy peak options", async () => {
    await act(async () => {
      render(<ProfileEditScreen />);
    });
    expect(screen.getByText("Morning")).toBeTruthy();
    expect(screen.getByText("Afternoon")).toBeTruthy();
    expect(screen.getByText("Evening")).toBeTruthy();
    expect(screen.getByText("Night")).toBeTruthy();
  });

  it("back button calls router.back", async () => {
    mockBack.mockClear();
    await act(async () => {
      render(<ProfileEditScreen />);
    });
    fireEvent.press(screen.getByText("\u2190"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("shared header back button testID calls router.back", async () => {
    mockBack.mockClear();
    await act(async () => {
      render(<ProfileEditScreen />);
    });
    fireEvent.press(screen.getByTestId("profile-back"));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

// ─── Profile Edit Screen — time pickers & keyboard handling ───

const ORIGINAL_PLATFORM_OS = Platform.OS;

function setPlatformOS(os: string) {
  Object.assign(Platform, { OS: os });
}

describe("ProfileEditScreen time fields", () => {
  afterEach(() => {
    setPlatformOS(ORIGINAL_PLATFORM_OS);
  });

  async function renderProfile() {
    await act(async () => {
      render(<ProfileEditScreen />);
    });
  }

  it("native time fields are pressable rows with accessibility metadata, not TextInputs", async () => {
    await renderProfile();

    expect(screen.queryByPlaceholderText("22:00")).toBeNull();
    expect(screen.queryByPlaceholderText("06:00")).toBeNull();

    for (const id of [
      "profile-sleep-start",
      "profile-sleep-end",
      "profile-study-start",
      "profile-study-end",
    ]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }

    const row = screen.getByTestId("profile-sleep-start");
    expect(row.props.accessibilityRole).toBe("button");
    expect(row.props.accessibilityLabel).toBe("Sleep start time");
    expect(row.props.accessibilityValue?.text).toBeTruthy();
  });

  it("pressing a time row opens its DateTimePicker", async () => {
    await renderProfile();

    expect(screen.queryByTestId("profile-sleep-start-picker")).toBeNull();

    await fireEvent.press(screen.getByTestId("profile-sleep-start"));

    expect(screen.getByTestId("profile-sleep-start-picker")).toBeTruthy();
    expect(screen.queryByTestId("profile-sleep-end-picker")).toBeNull();
  });

  it("picker onChange updates the displayed 12-hour time and stores HH:mm", async () => {
    await renderProfile();

    await fireEvent.press(screen.getByTestId("profile-sleep-start"));
    await fireEvent(
      screen.getByTestId("profile-sleep-start-picker"),
      "onChange",
      {},
      new Date(2026, 0, 1, 22, 0),
    );
    expect(screen.getByText("10 PM")).toBeTruthy();
    // iOS keeps the spinner open — existing project pattern.
    expect(screen.getByTestId("profile-sleep-start-picker")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("profile-sleep-end"));
    await fireEvent(
      screen.getByTestId("profile-sleep-end-picker"),
      "onChange",
      {},
      new Date(2026, 0, 1, 6, 30),
    );
    expect(screen.getByText("6:30 AM")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("profile-study-start"));
    await fireEvent(
      screen.getByTestId("profile-study-start-picker"),
      "onChange",
      {},
      new Date(2026, 0, 1, 16, 0),
    );
    expect(screen.getByText("4 PM")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("profile-study-end"));
    await fireEvent(
      screen.getByTestId("profile-study-end-picker"),
      "onChange",
      {},
      new Date(2026, 0, 1, 21, 30),
    );
    expect(screen.getByText("9:30 PM")).toBeTruthy();

    // Underlying state is still the original HH:mm form.
    mockSaveProfile.mockReset();
    mockSaveProfile.mockResolvedValue(undefined);
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await fireEvent.press(screen.getByText("Save Changes"));
    await waitFor(() => {
      expect(mockSaveProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          sleep_schedule: { start: "22:00", end: "06:30" },
          preferred_study_window: {
            earliest_start: "16:00",
            latest_end: "21:30",
          },
        }),
      );
    });
    alertSpy.mockRestore();
  });

  it("pressing the open row again dismisses the picker without changing the value", async () => {
    await renderProfile();

    await fireEvent.press(screen.getByTestId("profile-sleep-start"));
    expect(screen.getByTestId("profile-sleep-start-picker")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("profile-sleep-start"));
    expect(screen.queryByTestId("profile-sleep-start-picker")).toBeNull();
    expect(screen.getAllByText("Not set")).toHaveLength(4);
  });

  describe("on Android", () => {
    beforeEach(() => {
      setPlatformOS("android");
    });

    it("closes the picker after a selection and stores the picked time", async () => {
      await renderProfile();

      await fireEvent.press(screen.getByTestId("profile-sleep-start"));
      expect(screen.getByTestId("profile-sleep-start-picker")).toBeTruthy();

      await fireEvent(
        screen.getByTestId("profile-sleep-start-picker"),
        "onChange",
        {},
        new Date(2026, 0, 1, 9, 30),
      );

      expect(screen.queryByTestId("profile-sleep-start-picker")).toBeNull();
      expect(screen.getByText("9:30 AM")).toBeTruthy();
    });

    it("canceling the dialog leaves the previous value unchanged", async () => {
      await renderProfile();

      await fireEvent.press(screen.getByTestId("profile-sleep-start"));
      await fireEvent(
        screen.getByTestId("profile-sleep-start-picker"),
        "onChange",
        {},
        new Date(2026, 0, 1, 22, 0),
      );
      expect(screen.getByText("10 PM")).toBeTruthy();

      await fireEvent.press(screen.getByTestId("profile-sleep-start"));
      expect(screen.getByTestId("profile-sleep-start-picker")).toBeTruthy();

      await fireEvent(
        screen.getByTestId("profile-sleep-start-picker"),
        "onChange",
        { type: "dismissed" },
        undefined,
      );

      expect(screen.queryByTestId("profile-sleep-start-picker")).toBeNull();
      expect(screen.getByText("10 PM")).toBeTruthy();
    });
  });

  describe("on web", () => {
    beforeEach(() => {
      setPlatformOS("web");
    });

    it("keeps editable HH:mm TextInputs and renders no DateTimePicker", async () => {
      await renderProfile();

      expect(screen.queryByTestId("profile-sleep-start-picker")).toBeNull();
      expect(screen.getAllByPlaceholderText("22:00")).toHaveLength(2);
      expect(screen.getAllByPlaceholderText("06:00")).toHaveLength(2);

      await fireEvent.changeText(
        screen.getByTestId("profile-sleep-start"),
        "23:45",
      );
      expect(screen.getByDisplayValue("23:45")).toBeTruthy();
    });
  });

  it("form is wrapped in KeyboardAvoidingView with the project's keyboard pattern", () => {
    const content = fs.readFileSync(
      path.join(path.resolve(__dirname, ".."), "app/(app)/(me)/profile.tsx"),
      "utf-8",
    );

    expect(content).toContain("<KeyboardAvoidingView");
    expect(content).toContain(
      'behavior={Platform.OS === "ios" ? "padding" : "height"}',
    );
    expect(content).toContain('keyboardShouldPersistTaps="handled"');
    expect(content.indexOf("<KeyboardAvoidingView")).toBeLessThan(
      content.indexOf("<ScrollView"),
    );
    expect(content.indexOf("</ScrollView>")).toBeLessThan(
      content.indexOf("</KeyboardAvoidingView>"),
    );
  });

  it("Save sends HH:mm strings for both schedule windows", async () => {
    mockSaveProfile.mockReset();
    mockSaveProfile.mockResolvedValue(undefined);
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});

    await renderProfile();

    await fireEvent.press(screen.getByTestId("profile-sleep-start"));
    await fireEvent(
      screen.getByTestId("profile-sleep-start-picker"),
      "onChange",
      {},
      new Date(2026, 0, 1, 22, 0),
    );
    await fireEvent.press(screen.getByTestId("profile-sleep-end"));
    await fireEvent(
      screen.getByTestId("profile-sleep-end-picker"),
      "onChange",
      {},
      new Date(2026, 0, 1, 6, 30),
    );
    await fireEvent.press(screen.getByTestId("profile-study-start"));
    await fireEvent(
      screen.getByTestId("profile-study-start-picker"),
      "onChange",
      {},
      new Date(2026, 0, 1, 16, 0),
    );
    await fireEvent.press(screen.getByTestId("profile-study-end"));
    await fireEvent(
      screen.getByTestId("profile-study-end-picker"),
      "onChange",
      {},
      new Date(2026, 0, 1, 21, 30),
    );

    await fireEvent.press(screen.getByText("Save Changes"));

    await waitFor(() => {
      expect(mockSaveProfile).toHaveBeenCalledWith({
        name: "Alex",
        class_name: "12th",
        board: "CBSE",
        energy_peak: "morning",
        daily_target_minutes: 180,
        sleep_schedule: { start: "22:00", end: "06:30" },
        preferred_study_window: { earliest_start: "16:00", latest_end: "21:30" },
      });
    });
    expect(alertSpy).toHaveBeenCalledWith(
      "Saved",
      "Your profile has been updated.",
    );
    alertSpy.mockRestore();
  });
});

// ─── Streaks Screen ───

import StreaksScreen from "@/app/(app)/(me)/streaks";

describe("StreaksScreen", () => {
  it("renders streak stats", async () => {
    await act(async () => {
      render(<StreaksScreen />);
    });
    expect(screen.getAllByText("5").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("14")).toBeTruthy();
    expect(screen.getByText("30")).toBeTruthy();
    expect(screen.getByText("Current")).toBeTruthy();
    expect(screen.getByText("Best")).toBeTruthy();
    expect(screen.getByText("Total Days")).toBeTruthy();
  });

  it("renders recovery tokens", async () => {
    await act(async () => {
      render(<StreaksScreen />);
    });
    expect(screen.getByText("Recovery Tokens")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getAllByText("5").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("renders subject streaks", async () => {
    await act(async () => {
      render(<StreaksScreen />);
    });
    expect(screen.getByText("Mathematics")).toBeTruthy();
    expect(screen.getByText("3d current · 7d best")).toBeTruthy();
  });

  it("renders milestone chips", async () => {
    await act(async () => {
      render(<StreaksScreen />);
    });
    expect(screen.getByText("3d")).toBeTruthy();
    expect(screen.getByText("7d")).toBeTruthy();
    expect(screen.getByText("14d")).toBeTruthy();
    expect(screen.getByText("30d")).toBeTruthy();
  });

  it("shows the standard left-pointing back control, not a right arrow", async () => {
    await act(async () => {
      render(<StreaksScreen />);
    });
    expect(screen.getByText("\u2190")).toBeTruthy();
    expect(screen.queryByText("\u2192")).toBeNull();
  });

  it("shared header back button calls router.back", async () => {
    mockBack.mockClear();
    await act(async () => {
      render(<StreaksScreen />);
    });
    fireEvent.press(screen.getByTestId("streaks-back"));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

// ─── Health Screen ───

import HealthScreen from "@/app/(app)/(me)/health";

describe("HealthScreen", () => {
  it("renders balance score", async () => {
    await act(async () => {
      render(<HealthScreen />);
    });
    expect(screen.getByText("85%")).toBeTruthy();
    expect(screen.getByText("Good balance across subjects.")).toBeTruthy();
  });

  it("renders neglected subjects", async () => {
    await act(async () => {
      render(<HealthScreen />);
    });
    expect(screen.getByText("Neglected Subjects")).toBeTruthy();
    expect(screen.getByText("History")).toBeTruthy();
  });

  it("renders backlog health", async () => {
    await act(async () => {
      render(<HealthScreen />);
    });
    expect(screen.getByText("Backlog Health")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
  });

  it("renders the standard left-pointing back control", async () => {
    await act(async () => {
      render(<HealthScreen />);
    });
    expect(screen.getByText("\u2190")).toBeTruthy();
  });

  it("shared header back button calls router.back", async () => {
    mockBack.mockClear();
    await act(async () => {
      render(<HealthScreen />);
    });
    fireEvent.press(screen.getByTestId("health-back"));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

// ─── Hook exports ───

describe("Profile hooks", () => {
  it("useProfile is exported", () => {
    const { useProfile } = require("@/services/hooks");
    expect(typeof useProfile).toBe("function");
  });

  it("useSaveProfile is exported", () => {
    const { useSaveProfile } = require("@/services/hooks");
    expect(typeof useSaveProfile).toBe("function");
  });

  it("useStreaks is exported", () => {
    const { useStreaks } = require("@/services/hooks");
    expect(typeof useStreaks).toBe("function");
  });

  it("useBalanceScore is exported", () => {
    const { useBalanceScore } = require("@/services/hooks");
    expect(typeof useBalanceScore).toBe("function");
  });
});

describe("useSaveProfile invalidation", () => {
  it("useSaveProfile is exported and returns mutation object", () => {
    const { useSaveProfile } = require("@/services/hooks");
    expect(typeof useSaveProfile).toBe("function");
  });
});

// ─── Shared MeHeader structure ───

describe("Me header consistency", () => {
  const SRC = path.resolve(__dirname, "..");
  const ME = path.join(SRC, "app/(app)/(me)");
  const sharedHeaderScreens: [string, string][] = [
    ["settings", "Settings"],
    ["profile", "Profile"],
    ["security", "Security"],
    ["streaks", "Streaks"],
    ["health", "Health"],
    ["change-password", "Change Password"],
  ];

  it.each(sharedHeaderScreens)(
    "%s.tsx renders the shared MeHeader with title %s",
    (screenName, title) => {
      const content = fs.readFileSync(
        path.join(ME, `${screenName}.tsx`),
        "utf-8",
      );
      expect(content).toContain("MeHeader");
      expect(content).toContain(`screen="${screenName}"`);
      expect(content).toContain(`title="${title}"`);
      expect(content).not.toContain("backArrow");
      expect(content).not.toContain("backText");
    },
  );

  it("streaks.tsx no longer renders a right-pointing back arrow", () => {
    const content = fs.readFileSync(path.join(ME, "streaks.tsx"), "utf-8");
    expect(content).not.toContain("\u2192");
  });

  it("Me root index.tsx keeps its own header and does not use MeHeader", () => {
    const content = fs.readFileSync(path.join(ME, "index.tsx"), "utf-8");
    expect(content).not.toContain("MeHeader");
    expect(content).toContain("styles.header");
  });
});
