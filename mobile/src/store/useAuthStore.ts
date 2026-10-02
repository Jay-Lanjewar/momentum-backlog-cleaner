import { create } from "zustand";

import type { AuthMeResponse } from "@/services/types";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  confirming: boolean;
  /** Non-auth error from GET /api/v1/auth/me (session may still be valid). */
  meError: string | null;
  user: AuthMeResponse | null;
  /**
   * Transient (never persisted): a verified TOTP factor exists but the
   * session is still aal1 — the user must prove the code before app data
   * is allowed to load. Cleared on verify success or sign-out.
   */
  mfaRequired: boolean;
  /** The verified TOTP factor awaiting challenge — null when not required. */
  mfaFactorId: string | null;
  /** Assurance level of the current challenge: aal1 until verify, then aal2. */
  mfaAal: "aal1" | "aal2" | null;
  setUser: (user: AuthMeResponse | null) => void;
  setLoading: (isLoading: boolean) => void;
  setConfirming: (confirming: boolean) => void;
  setMeError: (meError: string | null) => void;
  beginMfaChallenge: (factorId: string) => void;
  completeMfaChallenge: () => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: true,
  confirming: false,
  meError: null,
  user: null,
  mfaRequired: false,
  mfaFactorId: null,
  mfaAal: null,
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
  beginMfaChallenge: (factorId) =>
    set({
      mfaRequired: true,
      mfaFactorId: factorId,
      mfaAal: "aal1",
    }),
  completeMfaChallenge: () =>
    set({
      mfaRequired: false,
      mfaFactorId: null,
      mfaAal: "aal2",
    }),
  clearAuth: () =>
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      confirming: false,
      meError: null,
      mfaRequired: false,
      mfaFactorId: null,
      mfaAal: null,
    }),
}));
