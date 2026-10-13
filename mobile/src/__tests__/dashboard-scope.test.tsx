import React from "react";
import { AppState } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act, waitFor } from "@testing-library/react-native";

import { getDashboardScope, useDashboard } from "@/services/hooks";

const mockGet = jest.fn();
const mockUser = { id: "user-1" };
const mockAppStateListeners: ((state: string) => void)[] = [];

jest.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

jest.mock("@/store/useAuthStore", () => {
  const useAuthStore = (selector: (state: { user: typeof mockUser }) => unknown) =>
    selector({ user: mockUser });
  return { useAuthStore };
});

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe("dashboard scope lifecycle", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 11, 23, 59, 50));
    mockGet.mockResolvedValue({
      data: {
        profile: null,
        streaks: { momentum: {}, subjects: [] },
        balance: { neglected_subjects: [] },
        insight: {},
        planning: { prioritized_backlog: [], backlog_health: {} },
        plan: { plan: { sessions: [] } },
        today_completed_minutes: 0,
      },
      error: null,
    });
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, listener) => {
        mockAppStateListeners.push(listener as (state: string) => void);
        return { remove: jest.fn() };
      });
  });

  afterEach(() => {
    jest.useRealTimers();
    mockGet.mockReset();
    mockAppStateListeners.length = 0;
    jest.restoreAllMocks();
  });

  it("rechecks the scope immediately when returning to the foreground", async () => {
    const result = await renderHook(() => useDashboard(), { wrapper });

    await waitFor(() => {
      expect(result.result.current.dashboardScope.localDate).toBe("2026-10-11");
    });

    jest.setSystemTime(new Date(2026, 9, 12, 0, 0, 5));
    act(() => {
      mockAppStateListeners[0]("active");
    });

    await waitFor(() => {
      expect(result.result.current.dashboardScope.localDate).toBe("2026-10-12");
    });
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("changes the query key when the device timezone changes", async () => {
    const timezone = jest
      .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
      .mockReturnValue({ timeZone: "America/New_York" } as Intl.ResolvedDateTimeFormatOptions);
    const first = getDashboardScope("user-1");
    timezone.mockReturnValue({ timeZone: "Asia/Kolkata" } as Intl.ResolvedDateTimeFormatOptions);
    const second = getDashboardScope("user-1");

    expect(first.timezone).toBe("America/New_York");
    expect(second.timezone).toBe("Asia/Kolkata");
    expect(second).not.toEqual(first);
    timezone.mockRestore();
  });
});
