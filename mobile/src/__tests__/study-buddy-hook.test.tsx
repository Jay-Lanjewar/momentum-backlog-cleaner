import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import { api } from "@/lib/api";
import { useStudyBuddyChat } from "@/services/hooks";

jest.mock("@/lib/api", () => ({
  api: { post: jest.fn() },
}));

const mockPost = api.post as jest.Mock;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false, gcTime: 0 }, queries: { retry: false } },
  });
  return function Wrapper({ children }: React.PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => mockPost.mockReset());

describe("useStudyBuddyChat", () => {
  it("posts the bounded chat contract through the shared authenticated API helper", async () => {
    mockPost.mockResolvedValue({
      data: { answer: "Try isolating x first." },
      error: null,
      errorCode: null,
    });
    const hook = await renderHook(() => useStudyBuddyChat(), { wrapper: createWrapper() });
    const payload = {
      session_id: "session-123:s1",
      question: "How do I solve 2x + 3 = 7?",
      history: [{ role: "user" as const, content: "I am stuck" }],
    };

    let response!: { answer: string };
    await act(async () => {
      response = await hook.result.current.mutateAsync(payload);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockPost).toHaveBeenCalledWith("/api/v1/study-buddy/chat", payload);
    expect(response).toEqual({ answer: "Try isolating x first." });
  });

  it.each([
    ["Not authenticated", null, "Please sign in again to use Study Buddy."],
    ["An active Focus session is required to use Study Buddy.", null, "This Focus session is no longer active. Return to Today to choose an active session."],
    ["Request limit reached", null, "Study Buddy is taking a short break. Please try again later."],
    ["Network error", null, "Couldn't reach Study Buddy. Check your connection, then retry."],
    ["Internal provider error with secret details", null, "Study Buddy couldn't answer just now. Please try again."],
    ["Forbidden", "insufficient_aal", "Please sign in again to use Study Buddy."],
  ])("maps API failure %s to a recoverable message", async (error, errorCode, expected) => {
    mockPost.mockResolvedValue({ data: null, error, errorCode });
    const hook = await renderHook(() => useStudyBuddyChat(), { wrapper: createWrapper() });
    let caught: unknown;

    await act(async () => {
      try {
        await hook.result.current.mutateAsync({ session_id: "s", question: "Help", history: [] });
      } catch (error) {
        caught = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(caught).toEqual(expect.objectContaining({ message: expected }));
  });
});
