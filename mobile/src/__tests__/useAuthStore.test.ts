import { useAuthStore } from "../store/useAuthStore";
import type { AuthMeResponse } from "../services/types";

const mockUser: AuthMeResponse = {
  id: "test-user-id",
  email: "test@example.com",
  name: "Test User",
  avatar_url: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  profile: null,
  streak: null,
};

describe("useAuthStore", () => {
  beforeEach(() => {
    // Reset to initial state directly
    useAuthStore.setState({
      isAuthenticated: false,
      isLoading: true,
      user: null,
    });
  });

  it("starts with loading state", () => {
    const state = useAuthStore.getState();
    expect(state.isLoading).toBe(true);
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
  });

  it("sets user and marks as authenticated", () => {
    useAuthStore.getState().setUser(mockUser);
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(state.user).toEqual(mockUser);
  });

  it("clears auth state", () => {
    useAuthStore.getState().setUser(mockUser);
    useAuthStore.getState().clearAuth();
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.user).toBeNull();
  });

  it("setLoading updates loading state", () => {
    useAuthStore.getState().setLoading(false);
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it("setUser with null clears authentication", () => {
    useAuthStore.getState().setUser(mockUser);
    useAuthStore.getState().setUser(null);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
