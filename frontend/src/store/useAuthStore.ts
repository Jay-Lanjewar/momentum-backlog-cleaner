import { create } from "zustand";
console.log("Creating Auth Store");
import type { AuthMeResponse } from "@/services/types";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthMeResponse | null;
  setUser: (user: AuthMeResponse | null) => void;
  setLoading: (loading: boolean) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: true,
  user: null,
  setUser: (user) => set({ user, isAuthenticated: !!user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
  clearAuth: () => set({ user: null, isAuthenticated: false, isLoading: false }),
}));
