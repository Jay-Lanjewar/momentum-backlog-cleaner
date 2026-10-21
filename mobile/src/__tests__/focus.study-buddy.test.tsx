import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert, Animated, BackHandler } from "react-native";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockComplete = jest.fn();
const mockLifecycle = jest.fn().mockResolvedValue({ state: "running" });
const mockStudyBuddyRequest = jest.fn();
let mockTimerMounts = 0;
let mockBackCallback: (() => boolean | null | undefined) | null = null;

jest.mock("expo-router", () => ({
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({
    sessionId: "00000000-0000-0000-0000-000000000001:s1",
    backlogItemId: "task-1",
    startTime: "09:00",
    endTime: "09:30",
    reason: "Work on algebra",
    snapshotId: "snapshot-1",
  }),
  useRouter: () => ({ replace: mockReplace, push: mockPush, back: mockBack }),
}));

jest.mock("expo-keep-awake", () => ({ useKeepAwake: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children, ...props }: any) => require("react").createElement("SafeAreaView", props, children),
}));
jest.mock("react-native-svg", () => {
  const { View } = require("react-native");
  return { __esModule: true, default: View, Circle: View };
});
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  NotificationFeedbackType: { Success: "success" },
}));
jest.mock("@/hooks/useFocusLock", () => {
  const ReactModule = require("react");
  return {
    useFocusLock: () => {
      const [timer] = ReactModule.useState(() => {
        mockTimerMounts += 1;
        return { phase: "focusing", focusedElapsedMs: 10_000, remainingMs: 80_000 };
      });
      return {
        ...timer,
        pause: jest.fn(),
        resume: jest.fn(),
        complete: jest.fn(),
      };
    },
  };
});
jest.mock("@/services/hooks", () => {
  const ReactModule = require("react");
  return {
    useDashboard: () => ({ data: null, isLoading: false }),
    useCompleteSession: () => ({ mutate: mockComplete, isPending: false }),
    useFocusSessionLifecycle: () => ({ mutateAsync: mockLifecycle }),
    useStudyBuddyChat: () => {
      const [isPending, setPending] = ReactModule.useState(false);
      return {
        isPending,
        mutateAsync: async (payload: unknown) => {
          setPending(true);
          try {
            return await mockStudyBuddyRequest(payload);
          } finally {
            setPending(false);
          }
        },
      };
    },
  };
});
jest.mock("@/services/notifications", () => ({
  cancelSessionNotifications: jest.fn(),
  showPlanChangedNotification: jest.fn(),
}));
jest.mock("@/lib/coaching", () => ({
  formatHourMinute: (time: string) => time || "--:--",
  formatTimeRange: (start: string, end: string) => `${start}-${end}`,
  formatMinutes: (minutes: number) => `${minutes} min`,
  focusCoachMessage: () => "Keep going!",
  topicFromSession: (session: any) => session.reason ?? "",
  nextSessionAfter: () => null,
  parseTimeToMinutes: (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  },
}));
jest.mock("@/components/adaptive/AdaptiveTimelineBar", () => ({
  AdaptiveTimelineBar: () => null,
  computeTimelineBounds: () => ({ minStart: 0, span: 1 }),
}));
jest.mock("@/components/adaptive/AdaptiveSessionLegend", () => ({ AdaptiveSessionLegend: () => null }));
jest.mock("@/components/adaptive/AdaptiveChangeGroup", () => ({ AdaptiveChangeGroup: () => null }));

jest.spyOn(Animated, "timing").mockReturnValue(({
  start: (callback?: (result: { finished: boolean }) => void) => callback?.({ finished: true }),
  stop: jest.fn(),
  reset: jest.fn(),
} as any));
jest.spyOn(BackHandler, "addEventListener").mockImplementation(((event: string, callback: any) => {
  if (event === "hardwareBackPress") mockBackCallback = callback;
  return { remove: jest.fn() };
}) as any);
jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

const FocusModeScreen = require("@/app/(app)/(today)/focus").default;

async function renderFocus() {
  const view = await render(<FocusModeScreen />);
  await act(async () => { await Promise.resolve(); });
  return view;
}

async function openBuddy() {
  await fireEvent.press(screen.getByText("Ask Study Buddy"));
  expect(screen.getByText("Study Buddy")).toBeTruthy();
}

async function submit(question: string) {
  await fireEvent.changeText(screen.getByLabelText("Message Study Buddy"), question);
  await fireEvent.press(screen.getByLabelText("Send question"));
}

beforeEach(() => {
  cleanup();
  jest.clearAllMocks();
  mockTimerMounts = 0;
  mockBackCallback = null;
  mockLifecycle.mockResolvedValue({ state: "running" });
  mockStudyBuddyRequest.mockImplementation(async (payload: any) => ({
    answer: `Answer to ${payload.question}`,
  }));
});

afterEach(cleanup);

describe("Focus Study Buddy panel", () => {
  it("opens and closes in place while preserving the timer and conversation", async () => {
    await renderFocus();
    await waitFor(() => expect(mockLifecycle).toHaveBeenCalledWith(expect.objectContaining({ action: "start" })));
    const lifecycleCalls = mockLifecycle.mock.calls.length;
    await openBuddy();
    expect(screen.getByText("Focus session continues ·")).toBeTruthy();
    expect(screen.getAllByText("01:20")).toHaveLength(2);
    await submit("Explain fractions");
    await waitFor(() => expect(screen.getByText("Answer to Explain fractions")).toBeTruthy());
    await fireEvent.press(screen.getByLabelText("Close Study Buddy"));
    expect(screen.getByText("Ask Study Buddy")).toBeTruthy();
    await openBuddy();
    expect(screen.getByText("Explain fractions")).toBeTruthy();
    expect(screen.getByText("Answer to Explain fractions")).toBeTruthy();
    expect(screen.getByText("Focus session continues ·")).toBeTruthy();
    expect(screen.getAllByText("01:20")).toHaveLength(2);
    expect(mockTimerMounts).toBe(1);
    expect(mockLifecycle).toHaveBeenCalledTimes(lifecycleCalls);
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("sends the current Focus ID and at most twelve preceding messages", async () => {
    await renderFocus();
    await openBuddy();
    for (let index = 0; index < 7; index += 1) {
      await submit(`Question ${index}`);
      await waitFor(() => expect(screen.getByText(`Answer to Question ${index}`)).toBeTruthy());
    }
    await submit("Latest question");
    await waitFor(() => expect(mockStudyBuddyRequest).toHaveBeenCalledTimes(8));
    const payload = mockStudyBuddyRequest.mock.calls[7][0];
    expect(payload).toEqual({
      session_id: "00000000-0000-0000-0000-000000000001:s1",
      question: "Latest question",
      history: expect.any(Array),
    });
    expect(payload.history).toHaveLength(12);
    expect(payload.history[0]).toEqual({ role: "user", content: "Question 1" });
  });

  it("shows loading, disables sending, and keeps draft for an explicit retry after failure", async () => {
    let rejectRequest!: (error: Error) => void;
    mockStudyBuddyRequest.mockImplementationOnce(() => new Promise((_, reject) => { rejectRequest = reject; }));
    await renderFocus();
    await openBuddy();
    await fireEvent.changeText(screen.getByLabelText("Message Study Buddy"), "Help me with this proof");
    await fireEvent.press(screen.getByLabelText("Send question"));
    await waitFor(() => expect(screen.getByText("Study Buddy is thinking…")).toBeTruthy());
    expect(screen.getByLabelText("Send question").props.accessibilityState.disabled).toBe(true);
    await act(async () => { rejectRequest(new Error("Couldn't reach Study Buddy. Check your connection, then retry.")); });
    expect(screen.getByText(/Couldn't reach Study Buddy/)).toBeTruthy();
    expect(screen.getByLabelText("Message Study Buddy").props.value).toBe("Help me with this proof");
    await fireEvent.press(screen.getByText("Retry"));
    await waitFor(() => expect(mockStudyBuddyRequest).toHaveBeenCalledTimes(2));
    expect(mockStudyBuddyRequest.mock.calls[1][0].question).toBe("Help me with this proof");
  });

  it("closes on Android Back before invoking Focus leave behavior", async () => {
    await renderFocus();
    await openBuddy();
    expect(mockBackCallback).toBeTruthy();
    let handled: boolean | null | undefined;
    await act(async () => { handled = mockBackCallback?.(); });
    expect(handled).toBe(true);
    expect(screen.getByText("Ask Study Buddy")).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalledWith("Leave Focus Session?", expect.anything(), expect.anything());
    await act(async () => { mockBackCallback?.(); });
    expect(Alert.alert).toHaveBeenCalledWith("Leave Focus Session?", expect.any(String), expect.any(Array));
  });

  it("does not issue Focus lifecycle or completion calls when merely opening and closing chat", async () => {
    await renderFocus();
    await waitFor(() => expect(mockLifecycle).toHaveBeenCalledWith(expect.objectContaining({ action: "start" })));
    mockLifecycle.mockClear();
    await openBuddy();
    await fireEvent.press(screen.getByLabelText("Close Study Buddy"));
    expect(mockLifecycle).not.toHaveBeenCalled();
    expect(mockComplete).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });
});
