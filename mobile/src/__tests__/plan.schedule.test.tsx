/**
 * Plan tab — fixed Weekly Schedule vs generated "Momentum's Plan".
 *
 * 1. Fixed schedule still renders (blocks untouched by the new section).
 * 2. Generated sessions render separately under "Momentum's Plan".
 * 3. Empty plan → sensible empty state (fixed schedule unaffected).
 * 4. Generated sessions are never written into the weekly schedule payload.
 * 5. Switching days hides today's plan (plan data is day-scoped).
 * 6. Completed sessions show as done, using the dashboard completion state.
 *
 * RNTL v14: render() and fireEvent.* return promises and must be awaited.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

import {
  DAYS,
  DAY_LABELS,
  getCurrentDayName,
  formatTime12h,
} from "@/lib/schedule";

jest.mock("react-native-safe-area-context", () => {
  const R = require("react");
  return {
    SafeAreaView: ({ children, ...props }: any) =>
      R.createElement("SafeAreaView", props, children),
  };
});

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

const mockSave = jest.fn();
let mockScheduleData: any = null;
let mockScheduleLoading = false;
let mockDashboard: any = null;
let mockPlanLoading = false;
const mockRefetch = jest.fn();

jest.mock("@/services/hooks", () => ({
  useWeeklySchedule: () => ({
    data: mockScheduleData,
    isLoading: mockScheduleLoading,
  }),
  useSaveWeeklySchedule: () => ({
    mutateAsync: mockSave,
    isPending: false,
  }),
  useDashboard: () => ({
    data: mockDashboard,
    isLoading: mockPlanLoading,
    refetch: mockRefetch,
    isRefetching: false,
  }),
}));

const ScheduleScreen = require("@/app/(app)/(plan)/schedule").default;

const TODAY = getCurrentDayName();

function makeSchedule() {
  return {
    schedule: {
      [TODAY]: [
        { type: "school", start: "09:00", end: "10:00", title: "Maths" },
      ],
    },
  };
}

function makeSession(
  sessionId: string,
  backlogId: string,
  start: string,
  end: string,
  title: string,
  minutes: number,
) {
  return {
    backlog_item_id: backlogId,
    session_id: sessionId,
    start_time: start,
    end_time: end,
    reason: `Work on ${title}`,
    remaining_minutes: minutes,
  };
}

const SESS_1 = makeSession("sess-1", "bl-1", "18:00", "18:30", "Physics HW", 30);
const SESS_2 = makeSession("sess-2", "bl-2", "19:00", "19:45", "Chem Notes", 45);

function makeDashboard(sessions: any[], prioritizedIds: string[] = []) {
  return {
    profile: null,
    streaks: {},
    balance: {},
    insight: {},
    planning: {
      prioritized_backlog: prioritizedIds.map((id) => ({
        id,
        title: id === "bl-1" ? "Physics HW" : "Chem Notes",
        course_id: id === "bl-1" ? "c1" : "c2",
        course_name: id === "bl-1" ? "Physics" : "Chemistry",
        course_color: id === "bl-1" ? "#3b82f6" : "#a855f7",
        priority: 1,
        score: 10,
        estimated_minutes: 60,
        due_date: null,
        overdue: false,
        status: "pending",
      })),
    },
    plan: {
      plan: { sessions, daily_message: "", overflow: [] },
      source: "deterministic",
      snapshot_id: "snap-1",
    },
    today_completed_minutes: 0,
  };
}

async function renderPlan(
  sessions: any[] = [SESS_1, SESS_2],
  prioritizedIds: string[] = ["bl-1", "bl-2"],
) {
  mockScheduleData = makeSchedule();
  mockDashboard = makeDashboard(sessions, prioritizedIds);
  return render(<ScheduleScreen />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockScheduleLoading = false;
  mockPlanLoading = false;
});

// ─── 1. Fixed schedule ───

describe("Plan tab — fixed Weekly Schedule", () => {
  it("renders the fixed schedule blocks", async () => {
    await renderPlan();

    expect(screen.getByTestId("fixed-schedule-label")).toBeTruthy();
    expect(screen.getByTestId("schedule-block-0")).toBeTruthy();
    expect(screen.getByText("School")).toBeTruthy();
    expect(screen.getByText("Maths")).toBeTruthy();
    expect(
      screen.getByText(
        `${formatTime12h("09:00")} – ${formatTime12h("10:00")}`,
      ),
    ).toBeTruthy();
  });

  it("keeps the schedule editable (delete + save still work)", async () => {
    await renderPlan();

    await fireEvent.press(screen.getByText("✕"));
    await fireEvent.press(screen.getByText("Delete"));
    await fireEvent.press(screen.getByText("Save"));

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith({ schedule: { [TODAY]: [] } });
  });
});

// ─── 2. Generated sessions ───

describe("Plan tab — Momentum's Plan", () => {
  it("renders generated sessions in their own section", async () => {
    await renderPlan();

    expect(screen.getByTestId("momentum-plan-section")).toBeTruthy();
    expect(screen.getByText("Momentum's Plan")).toBeTruthy();
    expect(screen.getByText(/recommendations, not commitments/)).toBeTruthy();

    expect(screen.getByTestId("plan-session-sess-1")).toBeTruthy();
    expect(screen.getByTestId("plan-session-sess-2")).toBeTruthy();
    expect(screen.getByText("6:00 PM – 6:30 PM")).toBeTruthy();
    expect(screen.getByText("7:00 PM – 7:45 PM")).toBeTruthy();
    expect(screen.getByText("Physics HW")).toBeTruthy();
    expect(screen.getByText("Chem Notes")).toBeTruthy();
    expect(screen.getByText("Physics")).toBeTruthy();
    expect(screen.getByText("~30m")).toBeTruthy();
    expect(screen.getByText("~45m")).toBeTruthy();
  });

  it("keeps generated sessions separate from the fixed schedule data", async () => {
    await renderPlan();

    expect(screen.getAllByTestId(/^schedule-block-/)).toHaveLength(1);
    expect(screen.getAllByTestId(/^plan-session-/)).toHaveLength(2);
  });
});

// ─── 3. Empty plan ───

describe("Plan tab — empty plan", () => {
  it("shows a sensible empty state without touching the fixed schedule", async () => {
    await renderPlan([], ["bl-1"]);

    expect(screen.getByTestId("plan-empty")).toBeTruthy();
    expect(screen.getByText("No study sessions planned today")).toBeTruthy();
    expect(screen.getByTestId("schedule-block-0")).toBeTruthy();
    expect(screen.getByText("Maths")).toBeTruthy();
    expect(screen.queryByTestId(/^plan-session-/)).toBeNull();
  });

  it("shows a loading row while the plan is loading", async () => {
    mockScheduleData = makeSchedule();
    mockDashboard = null;
    mockPlanLoading = true;
    await render(<ScheduleScreen />);

    expect(screen.getByText("Loading your plan…")).toBeTruthy();
    expect(screen.getByTestId("schedule-block-0")).toBeTruthy();
  });
});

// ─── 4. No writes into the schedule ───

describe("Plan tab — plan never mutates the weekly schedule", () => {
  it("does not add generated sessions to the saved schedule payload", async () => {
    await renderPlan();

    // Plan section keeps its sessions after a schedule save.
    await fireEvent.press(screen.getByText("✕"));
    await fireEvent.press(screen.getByText("Delete"));
    await fireEvent.press(screen.getByText("Save"));

    expect(mockSave).toHaveBeenCalledTimes(1);
    const payload = mockSave.mock.calls[0][0];
    expect(payload).toEqual({ schedule: { [TODAY]: [] } });
    expect(JSON.stringify(payload)).not.toContain("Physics HW");
    expect(JSON.stringify(payload)).not.toContain("sess-1");

    expect(screen.getAllByTestId(/^plan-session-/)).toHaveLength(2);
  });
});

// ─── 5. Day switching ───

describe("Plan tab — day scoping", () => {
  it("hides today's generated sessions when another day is selected", async () => {
    await renderPlan();
    expect(screen.getByTestId("plan-session-sess-1")).toBeTruthy();

    const otherDay = DAYS.find((d) => d !== TODAY)!;
    await fireEvent.press(screen.getByText(DAY_LABELS[otherDay]));

    expect(screen.queryByTestId("plan-session-sess-1")).toBeNull();
    expect(screen.getByTestId("plan-empty")).toBeTruthy();
    expect(screen.getByText("Nothing planned for this day")).toBeTruthy();
    expect(screen.getByText("No fixed commitments.")).toBeTruthy();
  });
});

// ─── 6. Completion state ───

describe("Plan tab — completion", () => {
  it("marks sessions whose backlog item left the prioritized backlog as done", async () => {
    await renderPlan([SESS_1, SESS_2], ["bl-1"]);

    expect(screen.getByText("Done")).toBeTruthy();
    expect(screen.getByText("Chem Notes")).toBeTruthy();
    expect(screen.queryAllByText("Done")).toHaveLength(1);
  });
});
