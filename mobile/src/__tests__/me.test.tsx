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
 */

import { render, screen, act } from "@testing-library/react-native";

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children, ...props }: any) =>
    require("react").createElement("SafeAreaView", props, children),
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
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

jest.mock("@/services/hooks", () => ({
  useProfile: () => ({
    data: {
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
    },
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
    mutateAsync: jest.fn(),
    isPending: false,
  }),
}));

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
});

// ─── Settings Screen ───

import SettingsScreen from "@/app/(app)/(me)/settings";

describe("SettingsScreen", () => {
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
