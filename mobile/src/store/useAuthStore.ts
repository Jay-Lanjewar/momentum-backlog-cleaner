import { create } from "zustand";

import type { AuthMeResponse } from "@/services/types";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  confirming: boolean;
  user: AuthMeResponse | null;
  setUser: (user: AuthMeResponse | null) => void;
  setLoading: (isLoading: boolean) => void;
  setConfirming: (confirming: boolean) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: true,
  confirming: false,
  user: null,
  setUser: (user) => set({ user, isAuthenticated: !!user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
  setConfirming: (confirming) => set({ confirming }),
  clearAuth: () =>
    set({ user: null, isAuthenticated: false, isLoading: false, confirming: false }),
}));
