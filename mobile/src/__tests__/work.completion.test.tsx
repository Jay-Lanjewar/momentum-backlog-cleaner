/**
 * C11 — Work circle-tick completion must share the Focus/adaptive truth:
 *
 * 1. Completing from Work issues exactly one request (backlog PUT) —
 *    never the session-completion endpoint (no duplicated completions).
 * 2. When the completed item has sessions in the active plan, the user
 *    gets the existing plan-change notification (not a silent replan).
 * 3. Completion with no active plan session still works, silently.
 * 4. Duplicate taps are guarded (Focus-style busy ref).
 * 5. Un-completing does not claim a plan change (backend does not
 *    supersede the snapshot on completed → pending).
 * 6. A failed completion does not claim a plan change.
 */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }),
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children, ...props }: any) =>
    require("react").createElement("SafeAreaView", props, children),
}));

jest.mock("@/components/BacklogForm", () => ({
  BacklogForm: () => null,
}));

let mockItems: any[] = [];
let mockDashboard: any = null;
const mockUpdate = jest.fn();
const mockCreate = jest.fn();
const mockCompleteSession = jest.fn();
const mockPlanChanged = jest.fn();

jest.mock("@/services/hooks", () => ({
  useBacklogItems: () => ({
    data: mockItems,
    isLoading: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
  useCourses: () => ({ data: [] }),
  useCreateBacklogItem: () => ({ mutateAsync: mockCreate, isPending: false }),
  useUpdateBacklogItem: () => ({
    mutateAsync: mockUpdate,
    isPending: false,
  }),
  useDashboard: () => ({
    data: mockDashboard,
    isLoading: false,
    refetch: jest.fn(),
  }),
  useCompleteSession: mockCompleteSession,
}));

jest.mock("@/services/notifications", () => ({
  showPlanChangedNotification: (...args: unknown[]) =>
    mockPlanChanged(...args),
}));

const BacklogScreen = require("@/app/(app)/(work)/index").default;

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "bl-1",
    user_id: "u1",
    course_id: "c1",
    title: "Physics HW",
    description: null,
    priority: 1,
    estimated_minutes: 60,
    due_date: null,
    status: "pending",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    session_id: "sess-1",
    backlog_item_id: "bl-1",
    start_time: "16:00",
    end_time: "17:00",
    reason: "Work on Physics HW",
    remaining_minutes: 60,
    ...overrides,
  };
}

function makeDashboard(sessions: any[]) {
  return {
    profile: null,
    streaks: {},
    balance: {},
    insight: {},
    planning: { prioritized_backlog: [] },
    plan: {
      plan: { sessions, daily_message: "", overflow: [] },
      source: "deterministic",
      snapshot_id: "snap-1",
    },
    today_completed_minutes: 0,
  };
}

async function renderWork() {
  return render(<BacklogScreen />);
}

async function pressToggle(id: string) {
  await fireEvent.press(screen.getByTestId(`completion-toggle-${id}`));
}

function findOnPress(instance: any): () => void {
  let fiber = instance.unstable_fiber;
  while (fiber) {
    const props = fiber.memoizedProps;
    if (props && typeof props.onPress === "function") return props.onPress;
    fiber = fiber.return;
  }
  throw new Error("onPress handler not found");
}

beforeEach(() => {
  mockItems = [makeItem()];
  mockDashboard = makeDashboard([makeSession()]);
  mockUpdate.mockReset();
  mockUpdate.mockResolvedValue(makeItem({ status: "completed" }));
  mockCreate.mockReset();
  mockCompleteSession.mockReset();
  mockPlanChanged.mockReset();
  mockPlanChanged.mockResolvedValue(undefined);
  mockPush.mockClear();
  mockReplace.mockClear();
  mockBack.mockClear();
});

describe("Work completion (C11)", () => {
  it("completes via the backlog PUT with status completed", async () => {
    await renderWork();
    await pressToggle("bl-1");

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({
      id: "bl-1",
      payload: { status: "completed" },
    });
  });

  it("never invokes the session-completion flow (no duplicate completion request)", async () => {
    await renderWork();
    await pressToggle("bl-1");

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockCompleteSession).not.toHaveBeenCalled();
  });
});

describe("Plan/adaptive feedback (C11)", () => {
  it("notifies via showPlanChangedNotification when the item is in the active plan", async () => {
    await renderWork();
    await pressToggle("bl-1");

    expect(mockPlanChanged).toHaveBeenCalledTimes(1);
    const changes = mockPlanChanged.mock.calls[0][0] as any[];
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      session_id: "sess-1",
      backlog_item_id: "bl-1",
      title: "Physics HW",
      change_type: "removed",
      previous_start: "16:00",
      previous_end: "17:00",
      new_start: null,
      new_end: null,
    });
    expect(changes[0].reason).toContain("completed and removed");
  });

  it("notifies with one change per affected session", async () => {
    mockDashboard = makeDashboard([
      makeSession(),
      makeSession({ session_id: "sess-1b", start_time: "17:00", end_time: "17:30" }),
    ]);
    await renderWork();
    await pressToggle("bl-1");

    expect(mockPlanChanged).toHaveBeenCalledTimes(1);
    const changes = mockPlanChanged.mock.calls[0][0] as any[];
    expect(changes).toHaveLength(2);
    expect(changes.map((c) => c.session_id)).toEqual(["sess-1", "sess-1b"]);
  });

  it("does not notify when the completed item has no active plan session", async () => {
    mockDashboard = makeDashboard([
      makeSession({ session_id: "sess-other", backlog_item_id: "bl-other" }),
    ]);
    await renderWork();
    await pressToggle("bl-1");

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({
      id: "bl-1",
      payload: { status: "completed" },
    });
    expect(mockPlanChanged).not.toHaveBeenCalled();
  });

  it("still completes with no cached dashboard (no-session path)", async () => {
    mockDashboard = null;
    await renderWork();
    await pressToggle("bl-1");

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({
      id: "bl-1",
      payload: { status: "completed" },
    });
    expect(mockPlanChanged).not.toHaveBeenCalled();
  });
});

describe("Duplicate completion guard (C11)", () => {
  it("double-tap while the PUT is in flight issues only one request", async () => {
    let resolveUpdate!: (v: any) => void;
    mockUpdate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    await renderWork();

    const onPress = findOnPress(
      screen.getByTestId("completion-toggle-bl-1"),
    );
    await act(async () => {
      void onPress();
      void onPress();
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveUpdate(makeItem({ status: "completed" }));
    });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("does not notify more than once for a single completion", async () => {
    let resolveUpdate!: (v: any) => void;
    mockUpdate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    await renderWork();

    const onPress = findOnPress(
      screen.getByTestId("completion-toggle-bl-1"),
    );
    await act(async () => {
      void onPress();
      void onPress();
    });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockPlanChanged).not.toHaveBeenCalled();

    await act(async () => {
      resolveUpdate(makeItem({ status: "completed" }));
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockPlanChanged).toHaveBeenCalledTimes(1);
  });
});

describe("Toggle semantics (C11)", () => {
  it("un-completing does not claim a plan change", async () => {
    mockItems = [makeItem({ status: "completed" })];
    await renderWork();
    await pressToggle("bl-1");

    expect(mockUpdate).toHaveBeenCalledWith({
      id: "bl-1",
      payload: { status: "pending" },
    });
    expect(mockPlanChanged).not.toHaveBeenCalled();
  });

  it("a failed completion does not claim a plan change", async () => {
    mockUpdate.mockRejectedValue(new Error("boom"));
    await renderWork();
    await pressToggle("bl-1");

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockPlanChanged).not.toHaveBeenCalled();
  });

  it("a failed completion keeps the guard released so retry works", async () => {
    mockUpdate.mockRejectedValueOnce(new Error("boom"));
    await renderWork();
    await pressToggle("bl-1");
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    mockUpdate.mockResolvedValue(makeItem({ status: "completed" }));
    await pressToggle("bl-1");
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });
});
