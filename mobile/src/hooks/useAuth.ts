import { useEffect, useCallback } from "react";
import { router } from "expo-router";

import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
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

export function useAuth() {
  const {
    user,
    isAuthenticated,
    isLoading,
    meError,
    setUser,
    setLoading,
    clearAuth,
    setConfirming,
    setMeError,
  } = useAuthStore();

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          if (!cancelled) setLoading(false);
          return;
        }

        const result = await api.get<AuthMeResponse>("/api/v1/auth/me");
        if (cancelled) return;

        if (result.data) {
          setUser(result.data);
        } else {
          // Keep Supabase session; surface recoverable /me error only.
          setMeError(
            result.error ||
              "Couldn't load your account. Check your connection and try again.",
          );
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    restoreSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && !useAuthStore.getState().confirming) {
        clearAuth();
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [setUser, setLoading, clearAuth, setConfirming, setMeError]);

  const login = useCallback(
    async (email: string, password: string) => {
      setMeError(null);
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

      // Profile load failure must not look like a bad password and must
      // not destroy the just-created session — meError + Retry instead.
      await loadAuthMe();
    },
    [setMeError],
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
    login,
    logout,
    retryMe,
    setConfirming,
  };
}
