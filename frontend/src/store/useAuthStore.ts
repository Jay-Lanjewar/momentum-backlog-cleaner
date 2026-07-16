import { create } from "zustand";

interface AuthState {
  isAuthenticated: boolean;
  user: Record<string, unknown> | null;
  setUser: (user: Record<string, unknown> | null) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  user: null,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  clearAuth: () => set({ user: null, isAuthenticated: false }),
}));
