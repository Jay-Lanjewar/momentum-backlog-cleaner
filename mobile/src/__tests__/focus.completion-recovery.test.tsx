/**
 * Focus completion / exit reliability (C1 + C2).
 *
 * 1. Leave copy says progress is NOT saved
 * 2. Leaving does not call completeSession()
 * 3. Successful Finish calls completeSession() exactly once
 * 4. Failed completion shows error/retry state
 * 5. Retry calls completeSession() again
 * 6. Back/Leave from completion error is possible
 * 7. Successful completion still shows adaptive result
 * 8. Double-tap/duplicate completion remains guarded
 * 9. Existing Focus pause/resume behavior remains unchanged
 */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import { Alert, Animated, BackHandler } from "react-native";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useLocalSearchParams: jest.fn(),
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    back: mockBack,
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

// Controllable focus lock with real state updates so UI re-renders
jest.mock("@/hooks/useFocusLock", () => {
  const ReactModule = require("react");
  return {
    useFocusLock: (totalDurationMs: number) => {
      const [phase, setPhase] = ReactModule.useState("focusing");
      const focusedElapsedMs = 60_000;
      const remainingMs = Math.max(0, totalDurationMs - focusedElapsedMs);
      return {
        phase,
        focusedElapsedMs,
        remainingMs,
        pause: ReactModule.useCallback(() => setPhase("paused_by_user"), []),
        resume: ReactModule.useCallback(() => setPhase("focusing"), []),
        complete: ReactModule.useCallback(() => setPhase("complete"), []),
        reset: ReactModule.useCallback(() => setPhase("entering"), []),
      };
    },
  };
});

const mockMutate = jest.fn();
let mockSetIsPending: (v: boolean) => void = () => {};

jest.mock("@/services/hooks", () => {
  const ReactModule = require("react");
  return {
    useCompleteSession: () => {
      const [isPending, setPending] = ReactModule.useState(false);
      mockSetIsPending = setPending;
      return { mutate: mockMutate, isPending };
    },
    useDashboard: () => ({
      data: null,
      isLoading: false,
      refetch: jest.fn(),
    }),
  };
});

jest.mock("@/services/notifications", () => ({
  cancelSessionNotifications: jest.fn(),
  showPlanChangedNotification: jest.fn(),
}));

jest.mock("@/lib/coaching", () => ({
  formatHourMinute: (time: string) => (time ? time : "--:--"),
  formatTimeRange: (s: string, e: string) => `${s}-${e}`,
  formatMinutes: (m: number) => `${m} min`,
  focusCoachMessage: () => "Keep going!",
  topicFromSession: (s: any) => s.reason?.replace(/^Work on\s+/, "") ?? "",
  nextSessionAfter: () => null,
  parseTimeToMinutes: (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  },
}));

jest.mock("@/components/adaptive/AdaptiveTimelineBar", () => ({
  AdaptiveTimelineBar: () => null,
  computeTimelineBounds: () => ({ minStart: 0, span: 100 }),
}));

jest.mock("@/components/adaptive/AdaptiveSessionLegend", () => ({
  AdaptiveSessionLegend: () => null,
}));

jest.mock("@/components/adaptive/AdaptiveChangeGroup", () => ({
  AdaptiveChangeGroup: () => null,
}));

const FocusModeScreen = require("@/app/(app)/(today)/focus").default;
const { useLocalSearchParams } = require("expo-router");

// Install persistent spies once — never mockRestore (avoids cross-test pollution)
const alertSpy = jest
  .spyOn(Alert, "alert")
  .mockImplementation(() => undefined);

let backHandler: (() => boolean | null | undefined) | null = null;

const backSpy = jest
  .spyOn(BackHandler, "addEventListener")
  .mockImplementation(((event: string, handler: any) => {
    if (event === "hardwareBackPress") {
      backHandler = handler;
    }
    return { remove: jest.fn() };
  }) as any);

jest.spyOn(Animated, "timing").mockReturnValue(({
  start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }),
  stop: jest.fn(),
  reset: jest.fn(),
} as any));

const directParams = {
  sessionId: "sess-1",
  backlogItemId: "bl-1",
  startTime: "16:00",
  endTime: "17:00",
  reason: "Work on Motion",
  remainingMinutes: "60",
  sessions: "[]",
  snapshotId: "snap-1",
  dailyMessage: "Keep it up!",
  userName: "Alex",
};

const adaptiveSuccess = {
  plan: {
    sessions: [
      {
        session_id: "sess-2",
        backlog_item_id: "bl-2",
        start_time: "18:00",
        end_time: "19:00",
        reason: "Work on Circles",
        remaining_minutes: 60,
      },
    ],
    daily_message: "Nice pace.",
    overflow: [],
  },
  changes: [],
  snapshot_id: "snap-2",
  previous_sessions: [],
};

type CompleteCallbacks = {
  onSuccess?: (data: unknown) => void;
  onError?: (err: { message: string }) => void;
};

let completeCallbacks: CompleteCallbacks = {};

function getAlertCall(title: string) {
  return alertSpy.mock.calls.find((call) => call[0] === title);
}

async function pressFinishEarlyAndConfirm() {
  await fireEvent.press(screen.getByText("Finish Early"));
  const call = getAlertCall("Finish Early?");
  expect(call).toBeTruthy();
  await act(async () => {
    (call as any[])[2][1].onPress();
  });
}

async function renderFocus() {
  useLocalSearchParams.mockReturnValue(directParams);
  return render(<FocusModeScreen />);
}

async function triggerBackHandler() {
  expect(backHandler).toBeTruthy();
  await act(async () => {
    backHandler!();
  });
}

beforeEach(() => {
  alertSpy.mockClear();
  backSpy.mockClear();
  mockReplace.mockClear();
  mockPush.mockClear();
  mockBack.mockClear();
  mockMutate.mockClear();
  mockSetIsPending = () => {};
  completeCallbacks = {};
  backHandler = null;

  backSpy.mockImplementation(((event: string, handler: any) => {
    if (event === "hardwareBackPress") {
      backHandler = handler;
    }
    return { remove: jest.fn() };
  }) as any);

  mockMutate.mockImplementation(
    (_payload: unknown, callbacks?: CompleteCallbacks) => {
      completeCallbacks = callbacks ?? {};
      mockSetIsPending(true);
    },
  );
});

describe("C1 - Leave is truthful", () => {
  it("leave text says progress is not saved", async () => {
    await renderFocus();
    await triggerBackHandler();

    const call = getAlertCall("Leave Focus Session?");
    expect(call).toBeTruthy();
    expect((call as any[])[1]).toMatch(/will not be saved/i);
    expect((call as any[])[1]).not.toMatch(/will be saved/i);
  });

  it("leaving does not call completeSession()", async () => {
    await renderFocus();
    await triggerBackHandler();

    const call = getAlertCall("Leave Focus Session?") as any[];
    const leaveButton = call[2].find((b: any) => b.text === "Leave");
    expect(leaveButton).toBeTruthy();

    await act(async () => {
      leaveButton.onPress();
    });

    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalled();
  });
});

describe("C2 - Completion failure is recoverable", () => {
  it("successful Finish calls completeSession exactly once", async () => {
    await renderFocus();
    await pressFinishEarlyAndConfirm();

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0][0]).toMatchObject({
      session_id: "sess-1",
    });
  });

  it("failed completion shows error/retry state (not stuck saving)", async () => {
    await renderFocus();
    await pressFinishEarlyAndConfirm();
    expect(screen.getByText("Saving your progress...")).toBeTruthy();

    await act(async () => {
      mockSetIsPending(false);
      completeCallbacks.onError?.({ message: "Network error" });
    });

    expect(screen.getByText(/Couldn't save your session/i)).toBeTruthy();
    expect(screen.getByText("Network error")).toBeTruthy();
    expect(screen.getByText(/not recorded yet/i)).toBeTruthy();
    expect(screen.getByText("Try Again")).toBeTruthy();
    expect(screen.queryByText("Saving your progress...")).toBeNull();
    expect(screen.queryByText("Nice work!")).toBeNull();
  });

  it("retry calls completeSession again", async () => {
    await renderFocus();
    await pressFinishEarlyAndConfirm();
    await act(async () => {
      mockSetIsPending(false);
      completeCallbacks.onError?.({ message: "Network error" });
    });
    expect(mockMutate).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByText("Try Again"));
    expect(mockMutate).toHaveBeenCalledTimes(2);
  });

  it("Back/Leave from completion error is possible", async () => {
    await renderFocus();
    await pressFinishEarlyAndConfirm();
    await act(async () => {
      mockSetIsPending(false);
      completeCallbacks.onError?.({ message: "Network error" });
    });

    await fireEvent.press(screen.getByText("Leave without saving"));

    expect(mockReplace).toHaveBeenCalledWith("/(app)");
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it("successful completion still shows the existing adaptive result", async () => {
    await renderFocus();
    await pressFinishEarlyAndConfirm();

    await act(async () => {
      mockSetIsPending(false);
      completeCallbacks.onSuccess?.(adaptiveSuccess);
    });

    expect(screen.getByText("Nice work!")).toBeTruthy();
    expect(screen.queryByText(/Couldn't save/i)).toBeNull();
    expect(screen.queryByText("Saving your progress...")).toBeNull();
  });

  it("double-tap/duplicate completion remains guarded", async () => {
    await renderFocus();

    // Keep UI on timer (do not flip isPending) so Finish can fire twice
    mockMutate.mockImplementation(
      (_payload: unknown, callbacks?: CompleteCallbacks) => {
        completeCallbacks = callbacks ?? {};
      },
    );

    await pressFinishEarlyAndConfirm();
    expect(mockMutate).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByText("Finish Early"));
    const finishAlerts = alertSpy.mock.calls.filter(
      (c) => c[0] === "Finish Early?",
    );
    await act(async () => {
      finishAlerts.forEach((call) => {
        (call as any[])[2][1].onPress();
      });
    });

    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it("allows retry after error resets the completing guard", async () => {
    await renderFocus();
    await pressFinishEarlyAndConfirm();
    expect(mockMutate).toHaveBeenCalledTimes(1);

    await act(async () => {
      mockSetIsPending(false);
      completeCallbacks.onError?.({ message: "fail" });
    });
    // After error, completingRef reset - retry allowed
    await fireEvent.press(screen.getByText("Try Again"));
    expect(mockMutate).toHaveBeenCalledTimes(2);
  });
});

describe("Pause / resume remains unchanged", () => {
  it("pause switches to Resume; resume switches back to Pause", async () => {
    await renderFocus();

    expect(screen.getByText("Pause")).toBeTruthy();
    expect(screen.queryByText("Resume")).toBeNull();

    await fireEvent.press(screen.getByText("Pause"));
    expect(screen.getByText("Resume")).toBeTruthy();
    expect(screen.queryByText("Pause")).toBeNull();

    await fireEvent.press(screen.getByText("Resume"));
    expect(screen.getByText("Pause")).toBeTruthy();
    expect(screen.queryByText("Resume")).toBeNull();
  });

  it("Finish Early is available while focusing", async () => {
    await renderFocus();
    expect(screen.getByText("Finish Early")).toBeTruthy();
  });
});
