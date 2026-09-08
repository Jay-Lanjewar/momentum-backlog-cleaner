import { useEffect, useCallback } from "react";
import { router } from "expo-router";

import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import type { AuthLoginRequest, AuthMeResponse } from "@/services/types";

export function useAuth() {
  const { user, isAuthenticated, isLoading, setUser, setLoading, clearAuth } =
    useAuthStore();

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
        if (!cancelled) {
          if (result.data) {
            setUser(result.data);
          } else {
            setLoading(false);
          }
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    restoreSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        clearAuth();
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [setUser, setLoading, clearAuth]);

  const login = useCallback(
    async (email: string, password: string) => {
      const payload: AuthLoginRequest = { email, password };
      const result = await api.post<{
        access_token: string;
        refresh_token: string;
      }>("/api/v1/auth/login", payload);

      if (result.error) {
        throw new Error(result.errorCode ?? result.error);
      }

      await supabase.auth.setSession({
        access_token: result.data.access_token,
        refresh_token: result.data.refresh_token,
      });

      const meResult = await api.get<AuthMeResponse>("/api/v1/auth/me");
      if (meResult.data) {
        setUser(meResult.data);
      }
    },
    [setUser],
  );

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    clearAuth();
    router.replace("/(auth)/login");
  }, [clearAuth]);

  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
  };
}
