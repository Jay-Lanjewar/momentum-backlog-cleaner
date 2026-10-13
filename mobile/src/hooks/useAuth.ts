import { useCallback } from "react";
import { router } from "expo-router";

import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { clearDashboardSessionData } from "@/services/hooks";
import { friendlyMfaError, pickVerifiedTotpFactor } from "@/lib/mfa";
import { performanceMark, performanceMeasure } from "@/lib/performance";
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

function isolatePreviousIdentity(nextUserId: string): void {
  const previousUserId = useAuthStore.getState().user?.id;
  if (!previousUserId || previousUserId === nextUserId) return;

  clearDashboardSessionData(previousUserId);
  useAuthStore.getState().clearAuth();
  useAuthStore.getState().setLoading(true);
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
async function restoreSessionInternal(): Promise<RestoreOutcome> {
  performanceMark("startup.auth_restore.begin");
  try {
    performanceMark("startup.supabase_session_retrieval.begin");
    const {
      data: { session },
    } = await supabase.auth.getSession();
    performanceMeasure(
      "startup.supabase_session_retrieval.finish",
      "startup.supabase_session_retrieval.begin",
    );

    if (!session?.access_token) {
      useAuthStore.getState().setLoading(false);
      performanceMark("startup.auth_restore.finish");
      return "no-session";
    }

    isolatePreviousIdentity(session.user?.id ?? "");
    const mfa = await detectMfaChallenge();
    performanceMark("startup.mfa_assurance_checks.finish");
    if (mfa.status === "required") {
      useAuthStore.getState().beginMfaChallenge(mfa.factorId);
      useAuthStore.getState().setLoading(false);
      performanceMark("startup.auth_restore.finish");
      return "mfa-required";
    }
    if (mfa.status === "unavailable") {
      // Verified factor exists but can't be identified — fail closed.
      await supabase.auth.signOut().catch(() => {});
      useAuthStore.getState().clearAuth();
      performanceMark("startup.auth_restore.finish");
      return "error";
    }

    performanceMark("startup.auth_me.request.begin");
    const result = await api.get<AuthMeResponse>("/api/v1/auth/me");
    performanceMeasure(
      "startup.auth_me.request.finish",
      "startup.auth_me.request.begin",
    );
    if (result.data) {
      useAuthStore.getState().setUser(result.data);
      performanceMark("startup.auth_restore.finish");
      return "ok";
    }

    // Keep Supabase session; surface recoverable /me error only.
    useAuthStore.getState().setMeError(
      result.error ||
        "Couldn't load your account. Check your connection and try again.",
    );
    useAuthStore.getState().setLoading(false);
    performanceMark("startup.auth_restore.finish");
    return "error";
  } catch {
    useAuthStore.getState().setLoading(false);
    performanceMark("startup.auth_restore.finish");
    return "error";
  }
}

let restoreSessionInFlight: Promise<RestoreOutcome> | null = null;

/**
 * Restore the persisted session once for any overlapping callers. The guard
 * is cleared after completion so a later explicit retry can run normally.
 */
export function restoreSession(): Promise<RestoreOutcome> {
  if (restoreSessionInFlight) return restoreSessionInFlight;

  const operation = restoreSessionInternal();
  restoreSessionInFlight = operation;
  void operation.finally(() => {
    if (restoreSessionInFlight === operation) {
      restoreSessionInFlight = null;
    }
  }).catch(() => {
    // restoreSessionInternal converts failures into an outcome; this keeps
    // the cleanup promise from becoming an unhandled rejection if that
    // implementation changes later.
  });
  return operation;
}

export function subscribeToAuthState(clearAuth: () => void): () => void {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!session && !useAuthStore.getState().confirming) {
      clearAuth();
      return;
    }

    if (session) isolatePreviousIdentity(session.user?.id ?? "");
  });

  return () => {
    subscription.unsubscribe();
  };
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

  isolatePreviousIdentity("");

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
  const {
    user,
    isAuthenticated,
    isLoading,
    meError,
    clearAuth,
    setConfirming,
    setMeError,
  } =
    useAuthStore();

  const doLogin = useCallback(
    (email: string, password: string) => login(email, password),
    [],
  );

  /** Retry only GET /api/v1/auth/me — never re-login or clear the session. */
  const retryMe = useCallback(async () => {
    setMeError(null);
    return loadAuthMe();
  }, [setMeError]);

  const authUserId = user?.id;
  const logout = useCallback(async () => {
    useAuthStore.getState().beginLogout();
    clearDashboardSessionData(authUserId);
    try {
      await supabase.auth.signOut();
      clearAuth();
      router.replace("/(auth)/login");
    } catch (error) {
      useAuthStore.getState().cancelLogout();
      throw error;
    }
  }, [authUserId, clearAuth]);

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
