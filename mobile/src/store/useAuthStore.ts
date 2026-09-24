import { create } from "zustand";

import type { AuthMeResponse } from "@/services/types";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  confirming: boolean;
  /** Non-auth error from GET /api/v1/auth/me (session may still be valid). */
  meError: string | null;
  user: AuthMeResponse | null;
  setUser: (user: AuthMeResponse | null) => void;
  setLoading: (isLoading: boolean) => void;
  setConfirming: (confirming: boolean) => void;
  setMeError: (meError: string | null) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: true,
  confirming: false,
  meError: null,
  user: null,
  setUser: (user) =>
    set({
      user,
      isAuthenticated: !!user,
      isLoading: false,
      meError: null,
    }),
  setLoading: (isLoading) => set({ isLoading }),
  setConfirming: (confirming) => set({ confirming }),
  setMeError: (meError) => set({ meError }),
  clearAuth: () =>
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      confirming: false,
      meError: null,
    }),
}));
