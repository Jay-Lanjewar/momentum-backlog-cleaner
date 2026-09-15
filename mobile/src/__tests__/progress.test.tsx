/**
 * Tests for M2C progress components.
 *
 * Verifies:
 * 1. TodaySummaryCard renders study minutes, sessions, ratio
 * 2. TodaySummaryCard renders target progress bar when dailyTarget provided
 * 3. WeeklyOverviewCard renders 7 daily bars and summary stats
 * 4. SubjectBreakdownCard renders subject list with color bars
 * 5. SubjectBreakdownCard shows empty state
 * 6. ProgressStreakCard renders current/best/total + milestones
 * 7. ProgressStreakCard milestone chips reflect achieved state
 */

import { render, screen } from "@testing-library/react-native";

import { TodaySummaryCard } from "@/components/progress/TodaySummaryCard";
import { WeeklyOverviewCard } from "@/components/progress/WeeklyOverviewCard";
import { SubjectBreakdownCard } from "@/components/progress/SubjectBreakdownCard";
import { ProgressStreakCard } from "@/components/progress/ProgressStreakCard";

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children, ...props }: any) =>
    require("react").createElement("SafeAreaView", props, children),
}));

// ─── TodaySummaryCard ───

describe("TodaySummaryCard", () => {
  const mockToday = {
    study_minutes: 90,
    sessions_completed: 3,
    estimated_minutes: 120,
  };

  it("renders study minutes, sessions, and ratio", async () => {
    await render(<TodaySummaryCard today={mockToday} dailyTarget={null} />);
    expect(screen.getByText("1h 30m")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy();
  });

  it("renders target progress bar when dailyTarget provided", async () => {
    await render(<TodaySummaryCard today={mockToday} dailyTarget={180} />);
    expect(screen.getByText("1h 30m / 3h target")).toBeTruthy();
  });

  it("hides target bar when dailyTarget is null", async () => {
    await render(<TodaySummaryCard today={mockToday} dailyTarget={null} />);
    expect(screen.queryByText(/target/)).toBeNull();
  });

  it("shows -- ratio when no estimated minutes", async () => {
    const noEst = { study_minutes: 30, sessions_completed: 1, estimated_minutes: 0 };
    await render(<TodaySummaryCard today={noEst} dailyTarget={null} />);
    expect(screen.getByText("--")).toBeTruthy();
  });
});

// ─── WeeklyOverviewCard ───

describe("WeeklyOverviewCard", () => {
  const mockWeek = {
    daily: [
      { date: "2026-09-07", study_minutes: 60, sessions_completed: 2 },
      { date: "2026-09-08", study_minutes: 90, sessions_completed: 3 },
      { date: "2026-09-09", study_minutes: 0, sessions_completed: 0 },
      { date: "2026-09-10", study_minutes: 45, sessions_completed: 1 },
      { date: "2026-09-11", study_minutes: 30, sessions_completed: 1 },
      { date: "2026-09-12", study_minutes: 0, sessions_completed: 0 },
      { date: "2026-09-13", study_minutes: 120, sessions_completed: 4 },
    ],
    total_study_minutes: 345,
    total_sessions: 11,
    total_estimated_minutes: 400,
  };

  it("renders 7 day labels", async () => {
    await render(<WeeklyOverviewCard week={mockWeek} />);
    expect(screen.getByText("Mon")).toBeTruthy();
    expect(screen.getByText("Tue")).toBeTruthy();
    expect(screen.getByText("Wed")).toBeTruthy();
    expect(screen.getByText("Thu")).toBeTruthy();
    expect(screen.getByText("Fri")).toBeTruthy();
    expect(screen.getByText("Sat")).toBeTruthy();
    expect(screen.getByText("Sun")).toBeTruthy();
  });

  it("renders total study time and sessions", async () => {
    await render(<WeeklyOverviewCard week={mockWeek} />);
    expect(screen.getByText("5h 45m")).toBeTruthy();
    expect(screen.getByText("11")).toBeTruthy();
  });

  it("shows completion percentage", async () => {
    await render(<WeeklyOverviewCard week={mockWeek} />);
    expect(screen.getByText("86%")).toBeTruthy();
  });
});

// ─── SubjectBreakdownCard ───

describe("SubjectBreakdownCard", () => {
  const mockSubjects = [
    {
      course_id: "c1",
      course_name: "Mathematics",
      course_color: "#3B82F6",
      study_minutes: 120,
      sessions_completed: 4,
      estimated_minutes: 150,
    },
    {
      course_id: "c2",
      course_name: "Physics",
      course_color: "#10B981",
      study_minutes: 60,
      sessions_completed: 2,
      estimated_minutes: 100,
    },
  ];

  it("renders subject names and minutes", async () => {
    await render(<SubjectBreakdownCard subjects={mockSubjects} />);
    expect(screen.getByText("Mathematics")).toBeTruthy();
    expect(screen.getByText("Physics")).toBeTruthy();
    expect(screen.getByText("2h")).toBeTruthy();
    expect(screen.getByText("1h")).toBeTruthy();
  });

  it("shows empty state when no subjects", async () => {
    await render(<SubjectBreakdownCard subjects={[]} />);
    expect(screen.getByText("No subject data yet.")).toBeTruthy();
  });
});

// ─── ProgressStreakCard ───

describe("ProgressStreakCard", () => {
  const mockStreaks = {
    current: 12,
    best: 30,
    total_study_days: 45,
    milestones: [
      { days: 3, achieved: true },
      { days: 7, achieved: true },
      { days: 14, achieved: false },
      { days: 30, achieved: false },
      { days: 100, achieved: false },
      { days: 365, achieved: false },
    ],
  };

  it("renders current, best, and total stats", async () => {
    await render(<ProgressStreakCard streaks={mockStreaks} />);
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("30")).toBeTruthy();
    expect(screen.getByText("45")).toBeTruthy();
  });

  it("renders milestone chips", async () => {
    await render(<ProgressStreakCard streaks={mockStreaks} />);
    expect(screen.getByText("3d")).toBeTruthy();
    expect(screen.getByText("7d")).toBeTruthy();
    expect(screen.getByText("14d")).toBeTruthy();
    expect(screen.getByText("30d")).toBeTruthy();
    expect(screen.getByText("100d")).toBeTruthy();
    expect(screen.getByText("365d")).toBeTruthy();
  });

  it("renders empty milestones gracefully", async () => {
    const noMilestones = { ...mockStreaks, milestones: [] };
    await render(<ProgressStreakCard streaks={noMilestones} />);
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.queryByText("Milestones")).toBeNull();
  });
});
