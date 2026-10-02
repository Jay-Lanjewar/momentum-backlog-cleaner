import { useEffect, useCallback } from "react";
import { router } from "expo-router";

import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { friendlyMfaError, pickVerifiedTotpFactor } from "@/lib/mfa";
import type { AuthLoginRequest, AuthMeResponse } from "@/services/types";

/**
 * Load app profile/user data from FastAPI. Supabase session is the auth
 * source; this is only the profile source. On failure the Supabase session
 * is left intact and `meError` is set for UI retry — never clears auth.
 */
export async function loadAuthMe(): Promise<AuthMeResponse | null> {
  const result = await api.get<AuthMeResponse>("/api/v1/auth/me");

  if (result.data) {
    useAuthStore.getState().setUser(result.data);
    return result.data;
  }

  useAuthStore.getState().setMeError(
    result.error ||
      "Couldn't load your account. Check your connection and try again.",
  );
  useAuthStore.getState().setLoading(false);
  return null;
}

/** Password accepted; "mfa-required" means a code must be proven first. */
export type LoginOutcome = "ok" | "mfa-required";

/** What session restore found: no session, profile loaded, or a challenge. */
export type RestoreOutcome = "no-session" | "ok" | "mfa-required" | "error";

type MfaDetection =
  | { status: "none" }
  | { status: "required"; factorId: string }
  | { status: "unavailable" };

/**
 * Check the assurance level of the current session against enrolled factors.
 *
 * - aal levels equal → nothing to prove.
 * - aal1 → aal2 with a verified TOTP factor → a challenge is required.
 * - challenge indicated but the factor can't be listed → "unavailable"
 *   (fail closed: never let an unproven session reach app data).
 * - AAL itself unreadable → fail open as "none" so a transient Supabase
 *   hiccup can't lock the user out (pre-MFA behavior is preserved).
 */
async function detectMfaChallenge(): Promise<MfaDetection> {
  try {
    const { data, error } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return { status: "none" };
    if (data.currentLevel === data.nextLevel) return { status: "none" };

    try {
      const { data: factors, error: factorsError } =
        await supabase.auth.mfa.listFactors();
      if (factorsError || !factors) return { status: "unavailable" };
      const factor = pickVerifiedTotpFactor(factors);
      if (!factor) return { status: "unavailable" };
      return { status: "required", factorId: factor.id };
    } catch {
      return { status: "unavailable" };
    }
  } catch {
    return { status: "none" };
  }
}

/**
 * Restore a session on cold start. Runs before any app data loads: when a
 * verified TOTP factor exists the challenge flag is set instead of /me, and
 * AuthGate routes to (auth)/two-factor. The AuthGate routing is the single
 * source of navigation for this flow — nothing here moves the router.
 */
export async function restoreSession(): Promise<RestoreOutcome> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      useAuthStore.getState().setLoading(false);
      return "no-session";
    }

    const mfa = await detectMfaChallenge();
    if (mfa.status === "required") {
      useAuthStore.getState().beginMfaChallenge(mfa.factorId);
      useAuthStore.getState().setLoading(false);
      return "mfa-required";
    }
    if (mfa.status === "unavailable") {
      // Verified factor exists but can't be identified — fail closed.
      await supabase.auth.signOut().catch(() => {});
      useAuthStore.getState().clearAuth();
      return "error";
    }

    const result = await api.get<AuthMeResponse>("/api/v1/auth/me");
    if (result.data) {
      useAuthStore.getState().setUser(result.data);
      return "ok";
    }

    // Keep Supabase session; surface recoverable /me error only.
    useAuthStore.getState().setMeError(
      result.error ||
        "Couldn't load your account. Check your connection and try again.",
    );
    useAuthStore.getState().setLoading(false);
    return "error";
  } catch {
    useAuthStore.getState().setLoading(false);
    return "error";
  }
}

/**
 * Sign in through the backend, hand the tokens to Supabase, then decide:
 * load the profile, or stop at the MFA challenge. Throws with the API's
 * friendly error copy on failure — callers surface it as an Alert.
 */
export async function login(
  email: string,
  password: string,
): Promise<LoginOutcome> {
  useAuthStore.getState().setMeError(null);
  const payload: AuthLoginRequest = { email, password };
  const result = await api.post<{
    access_token: string;
    refresh_token: string;
  }>("/api/v1/auth/login", payload);

  if (result.error) {
    throw new Error(result.errorCode ?? result.error);
  }

  // Establish Supabase session (auth source) before loading profile.
  await supabase.auth.setSession({
    access_token: result.data.access_token,
    refresh_token: result.data.refresh_token,
  });

  const mfa = await detectMfaChallenge();
  if (mfa.status === "required") {
    useAuthStore.getState().beginMfaChallenge(mfa.factorId);
    // AuthGate must be free to route even if restore is still in flight.
    useAuthStore.getState().setLoading(false);
    return "mfa-required";
  }
  if (mfa.status === "unavailable") {
    // Password was right but the challenge can't be proven — fail closed
    // with generic copy (no raw Supabase text, no half-open session).
    await supabase.auth.signOut().catch(() => {});
    useAuthStore.getState().clearAuth();
    throw new Error(friendlyMfaError(null));
  }

  // Profile load failure must not look like a bad password and must
  // not destroy the just-created session — meError + Retry instead.
  await loadAuthMe();
  return "ok";
}

export function useAuth() {
  const { user, isAuthenticated, isLoading, meError, clearAuth, setConfirming, setMeError } =
    useAuthStore();

  useEffect(() => {
    restoreSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && !useAuthStore.getState().confirming) {
        clearAuth();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [clearAuth]);

  const doLogin = useCallback(
    (email: string, password: string) => login(email, password),
    [],
  );

  /** Retry only GET /api/v1/auth/me — never re-login or clear the session. */
  const retryMe = useCallback(async () => {
    setMeError(null);
    return loadAuthMe();
  }, [setMeError]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    clearAuth();
    router.replace("/(auth)/login");
  }, [clearAuth]);

  return {
    user,
    isAuthenticated,
    isLoading,
    meError,
    login: doLogin,
    logout,
    retryMe,
    setConfirming,
  };
}
