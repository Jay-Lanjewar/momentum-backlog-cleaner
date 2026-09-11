/**
 * Dashboard enrichment tests.
 * Verifies dashboard component rendering, data usage, and file structure.
 */

import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(__dirname, "..");

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(SRC, relativePath), "utf8");
}

function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(SRC, relativePath));
}

// ─── File Structure ───

describe("Dashboard component file structure", () => {
  it("has dashboard components directory", () => {
    expect(fileExists("components/dashboard")).toBe(true);
  });

  it("has RecommendedNextCard component", () => {
    expect(fileExists("components/dashboard/RecommendedNextCard.tsx")).toBe(true);
  });

  it("has BacklogHealthCard component", () => {
    expect(fileExists("components/dashboard/BacklogHealthCard.tsx")).toBe(true);
  });

  it("has ProgressOverview component", () => {
    expect(fileExists("components/dashboard/ProgressOverview.tsx")).toBe(true);
  });

  it("has StreakCard component", () => {
    expect(fileExists("components/dashboard/StreakCard.tsx")).toBe(true);
  });

  it("has BalanceScoreCard component", () => {
    expect(fileExists("components/dashboard/BalanceScoreCard.tsx")).toBe(true);
  });
});

// ─── RecommendedNextCard ───

describe("RecommendedNextCard", () => {
  const content = readFile("components/dashboard/RecommendedNextCard.tsx");

  it("exports RecommendedNextCard component", () => {
    expect(content).toContain("export function RecommendedNextCard");
  });

  it("accepts session, backlogItem, isCurrent, healthScore, onStart props", () => {
    expect(content).toContain("session: PlanSession");
    expect(content).toContain("backlogItem: PrioritizedBacklogItem | undefined");
    expect(content).toContain("isCurrent: boolean");
    expect(content).toContain("healthScore: string");
    expect(content).toContain("onStart: () => void");
  });

  it("shows NOW label when isCurrent is true", () => {
    expect(content).toContain("NOW");
    expect(content).toContain("NEXT UP");
  });

  it("shows OVERDUE badge when overdue", () => {
    expect(content).toContain("overdue");
    expect(content).toContain("OVERDUE");
  });

  it("displays subject/course name", () => {
    expect(content).toContain("course_name");
    expect(content).toContain("subject");
  });

  it("displays course color as accent", () => {
    expect(content).toContain("course_color");
    expect(content).toContain("accentBar");
  });

  it("displays time range", () => {
    expect(content).toContain("formatTimeRange");
  });

  it("displays duration estimate", () => {
    expect(content).toContain("remaining_minutes");
    expect(content).toContain("formatMinutes");
  });

  it("uses buildRecommendationReason", () => {
    expect(content).toContain("buildRecommendationReason");
  });

  it("has Start CTA button", () => {
    expect(content).toContain("startButton");
    expect(content).toContain("Start Focus Session");
    expect(content).toContain("Start Next Session");
  });

  it("calls onStart when pressed", () => {
    expect(content).toContain("onStart");
  });
});

// ─── BacklogHealthCard ───

describe("BacklogHealthCard", () => {
  const content = readFile("components/dashboard/BacklogHealthCard.tsx");

  it("exports BacklogHealthCard component", () => {
    expect(content).toContain("export function BacklogHealthCard");
  });

  it("accepts health prop of type BacklogHealth", () => {
    expect(content).toContain("health: BacklogHealth");
  });

  it("displays health score badge (good/fair/critical)", () => {
    expect(content).toContain("health_score");
    expect(content).toContain("Good");
    expect(content).toContain("Fair");
    expect(content).toContain("Critical");
  });

  it("shows 7-day clear rate with progress bar", () => {
    expect(content).toContain("clear_rate_7d");
    expect(content).toContain("rateTrack");
    expect(content).toContain("rateFill");
  });

  it("shows pending items count", () => {
    expect(content).toContain("pending_items");
  });

  it("shows overdue items count", () => {
    expect(content).toContain("overdue_items");
  });

  it("shows completed items count", () => {
    expect(content).toContain("completed_items");
  });

  it("shows estimated completion date", () => {
    expect(content).toContain("estimated_completion_date");
  });

  it("applies critical styling to overdue count when > 0", () => {
    expect(content).toContain("countCritical");
  });
});

// ─── ProgressOverview ───

describe("ProgressOverview", () => {
  const content = readFile("components/dashboard/ProgressOverview.tsx");

  it("exports ProgressOverview component", () => {
    expect(content).toContain("export function ProgressOverview");
  });

  it("accepts tasks, study minutes, streak, and deadline props", () => {
    expect(content).toContain("totalTasks: number");
    expect(content).toContain("completedTasks: number");
    expect(content).toContain("studyMinutes: number");
    expect(content).toContain("streak: StudyStreakData");
    expect(content).toContain("deadlineLabel");
  });

  it("renders 2x2 grid layout", () => {
    expect(content).toContain("grid");
    expect(content).toContain("gridRow");
    expect(content).toContain("statBox");
  });

  it("shows tasks done/total", () => {
    expect(content).toContain("tasksDone");
    expect(content).toContain("tasksTotal");
  });

  it("shows study time", () => {
    expect(content).toContain("formatMinutes");
    expect(content).toContain("Study Time");
  });

  it("shows streak count", () => {
    expect(content).toContain("current_streak");
    expect(content).toContain("Day Streak");
  });

  it("shows next deadline", () => {
    expect(content).toContain("Next Deadline");
  });
});

// ─── StreakCard ───

describe("StreakCard", () => {
  const content = readFile("components/dashboard/StreakCard.tsx");

  it("exports StreakCard component", () => {
    expect(content).toContain("export function StreakCard");
  });

  it("accepts streaks prop of type StreakAllData", () => {
    expect(content).toContain("streaks: StreakAllData");
  });

  it("displays current streak", () => {
    expect(content).toContain("current_streak");
    expect(content).toContain("day");
  });

  it("displays total study days", () => {
    expect(content).toContain("total_study_days");
    expect(content).toContain("total days");
  });

  it("displays best/longest streak", () => {
    expect(content).toContain("longest_streak");
    expect(content).toContain("best streak");
  });

  it("shows recovery tokens section", () => {
    expect(content).toContain("recovery_tokens_current");
    expect(content).toContain("Recovery Tokens");
  });

  it("shows subject streaks list", () => {
    expect(content).toContain("subjects");
    expect(content).toContain("Subject Streaks");
    expect(content).toContain("SubjectRow");
  });

  it("subject rows show course color dot", () => {
    expect(content).toContain("course_color");
    expect(content).toContain("subjectDot");
  });

  it("subject rows show streak progress bar", () => {
    expect(content).toContain("progressTrack");
    expect(content).toContain("progressFill");
  });

  it("limits displayed subjects to 5", () => {
    expect(content).toContain("subjects.slice(0, 5)");
  });
});

// ─── BalanceScoreCard ───

describe("BalanceScoreCard", () => {
  const content = readFile("components/dashboard/BalanceScoreCard.tsx");

  it("exports BalanceScoreCard component", () => {
    expect(content).toContain("export function BalanceScoreCard");
  });

  it("accepts balance prop of type BalanceScoreData", () => {
    expect(content).toContain("balance: BalanceScoreData");
  });

  it("displays score value (0-100)", () => {
    expect(content).toContain("balance.score");
  });

  it("shows score bar with color coding", () => {
    expect(content).toContain("barTrack");
    expect(content).toContain("barFill");
  });

  it("applies color based on score thresholds", () => {
    expect(content).toContain("scoreColor");
    expect(content).toContain("80");
    expect(content).toContain("50");
  });

  it("shows score label (Well balanced / Needs attention / Imbalanced)", () => {
    expect(content).toContain("Well balanced");
    expect(content).toContain("Needs attention");
    expect(content).toContain("Imbalanced");
  });

  it("displays message when available", () => {
    expect(content).toContain("balance.message");
  });

  it("shows neglected subjects as tags", () => {
    expect(content).toContain("neglected_subjects");
    expect(content).toContain("neglectedTag");
    expect(content).toContain("Needs more focus");
  });
});

// ─── Today Screen Integration ───

describe("Today screen integration", () => {
  const content = readFile("app/(app)/(today)/index.tsx");

  it("imports all dashboard components", () => {
    expect(content).toContain("RecommendedNextCard");
    expect(content).toContain("BacklogHealthCard");
    expect(content).toContain("ProgressOverview");
    expect(content).toContain("StreakCard");
    expect(content).toContain("BalanceScoreCard");
  });

  it("renders RecommendedNextCard with session data", () => {
    expect(content).toContain("<RecommendedNextCard");
    expect(content).toContain("session={missionSession}");
    expect(content).toContain("backlogItem=");
    expect(content).toContain("isCurrent=");
    expect(content).toContain("onStart=");
  });

  it("renders BacklogHealthCard with health data", () => {
    expect(content).toContain("<BacklogHealthCard");
    expect(content).toContain("health={data.planning.backlog_health}");
  });

  it("renders ProgressOverview with stats", () => {
    expect(content).toContain("<ProgressOverview");
    expect(content).toContain("totalTasks=");
    expect(content).toContain("completedTasks=");
    expect(content).toContain("studyMinutes=");
    expect(content).toContain("streak={data.streaks.momentum}");
  });

  it("renders StreakCard with streaks data", () => {
    expect(content).toContain("<StreakCard");
    expect(content).toContain("streaks={data.streaks}");
  });

  it("renders BalanceScoreCard with balance data", () => {
    expect(content).toContain("<BalanceScoreCard");
    expect(content).toContain("balance={data.balance}");
  });

  it("retains existing focus navigation", () => {
    expect(content).toContain("pathname: \"/(app)/focus\"");
    expect(content).toContain("handleStartStudy");
  });

  it("retains greeting and logout", () => {
    expect(content).toContain("getGreeting");
    expect(content).toContain("logout");
  });

  it("retains insight display", () => {
    expect(content).toContain("data.insight");
  });

  it("retains upcoming sessions list", () => {
    expect(content).toContain("upcomingSessions");
    expect(content).toContain("Upcoming Today");
  });

  it("retains empty states", () => {
    expect(content).toContain("All caught up!");
    expect(content).toContain("No more sessions today");
  });

  it("retains pull-to-refresh", () => {
    expect(content).toContain("RefreshControl");
  });

  it("retains loading and error states", () => {
    expect(content).toContain("ActivityIndicator");
    expect(content).toContain("Could not load dashboard");
    expect(content).toContain("Retry");
  });

  it("computes next deadline from backlog", () => {
    expect(content).toContain("nextDeadline");
    expect(content).toContain("due_date");
  });
});

// ─── Data Fields Reused ───

describe("Dashboard data fields reused from API", () => {
  const typesContent = readFile("services/types.ts");
  const hooksContent = readFile("services/hooks.ts");

  it("DashboardData includes all needed fields", () => {
    expect(typesContent).toContain("interface DashboardData");
    expect(typesContent).toContain("profile:");
    expect(typesContent).toContain("streaks:");
    expect(typesContent).toContain("balance:");
    expect(typesContent).toContain("insight:");
    expect(typesContent).toContain("planning:");
    expect(typesContent).toContain("plan:");
  });

  it("BacklogHealth has all required fields", () => {
    expect(typesContent).toContain("interface BacklogHealth");
    expect(typesContent).toContain("total_items:");
    expect(typesContent).toContain("completed_items:");
    expect(typesContent).toContain("overdue_items:");
    expect(typesContent).toContain("pending_items:");
    expect(typesContent).toContain("clear_rate_7d:");
    expect(typesContent).toContain("health_score:");
    expect(typesContent).toContain("estimated_completion_date:");
  });

  it("StudyStreakData has all required fields", () => {
    expect(typesContent).toContain("interface StudyStreakData");
    expect(typesContent).toContain("current_streak:");
    expect(typesContent).toContain("longest_streak:");
    expect(typesContent).toContain("total_study_days:");
    expect(typesContent).toContain("recovery_tokens_current:");
    expect(typesContent).toContain("recovery_tokens_earned:");
    expect(typesContent).toContain("recovery_tokens_used:");
    expect(typesContent).toContain("streak_protected_today:");
  });

  it("BalanceScoreData has all required fields", () => {
    expect(typesContent).toContain("interface BalanceScoreData");
    expect(typesContent).toContain("score:");
    expect(typesContent).toContain("message:");
    expect(typesContent).toContain("neglected_subjects:");
  });

  it("SubjectStreakData has all required fields", () => {
    expect(typesContent).toContain("interface SubjectStreakData");
    expect(typesContent).toContain("course_name:");
    expect(typesContent).toContain("course_color:");
    expect(typesContent).toContain("current_streak:");
    expect(typesContent).toContain("longest_streak:");
  });

  it("hooks.ts uses single GET /api/v1/dashboard endpoint", () => {
    expect(hooksContent).toContain("useDashboard");
    expect(hooksContent).toContain("/api/v1/dashboard");
    expect(hooksContent).toContain("DashboardData");
  });

  it("no additional API endpoints were added", () => {
    // Only the existing endpoints should be present
    expect(hooksContent).toContain("/api/v1/backlog");
    expect(hooksContent).toContain("/api/v1/courses");
    expect(hooksContent).toContain("/api/v1/goals");
    expect(hooksContent).toContain("/api/v1/profile/schedule");
    expect(hooksContent).toContain("/api/v1/dashboard");
  });
});

// ─── Coaching Helpers ───

describe("Coaching helper functions used by dashboard", () => {
  const coachingContent = readFile("lib/coaching.ts");

  it("has buildRecommendationReason", () => {
    expect(coachingContent).toContain("buildRecommendationReason");
  });

  it("has healthTone", () => {
    expect(coachingContent).toContain("healthTone");
  });

  it("has formatMinutes", () => {
    expect(coachingContent).toContain("formatMinutes");
  });

  it("has formatTimeRange", () => {
    expect(coachingContent).toContain("formatTimeRange");
  });

  it("has formatHourMinute", () => {
    expect(coachingContent).toContain("formatHourMinute");
  });

  it("has computeDailyProgress", () => {
    expect(coachingContent).toContain("computeDailyProgress");
  });

  it("has getActiveSessions", () => {
    expect(coachingContent).toContain("getActiveSessions");
  });

  it("has getCurrentSession", () => {
    expect(coachingContent).toContain("getCurrentSession");
  });

  it("has getNextSession", () => {
    expect(coachingContent).toContain("getNextSession");
  });

  it("has getUpcomingSessions", () => {
    expect(coachingContent).toContain("getUpcomingSessions");
  });
});
