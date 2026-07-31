import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/services/supabase";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/useAuthStore";
import type { AuthResponse } from "@/services/types";

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const navigate = useNavigate();

  const signup = useCallback(async (email: string, password: string, name?: string) => {
    const result = await api.post<AuthResponse>("/api/v1/auth/signup", {
      email,
      password,
      name: name || null,
    });
    if (result.error) {
      if (result.error.toLowerCase().includes("already registered") || result.error.toLowerCase().includes("already exists")) {
        throw new Error("An account with this email already exists");
      }
      throw new Error(result.error);
    }

    if (result.data?.access_token) {
      const { error } = await supabase.auth.setSession({
        access_token: result.data.access_token,
        refresh_token: result.data.refresh_token,
      });

      if (error) {
        throw error;
      }
    }

    await fetchUser();
    return result.data;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.post<AuthResponse>("/api/v1/auth/login", {
      email,
      password,
    });

    if (result.error) {
      const msg = result.error.toLowerCase();
      if (msg.includes("invalid login credentials") || msg.includes("incorrect email or password")) {
        throw new Error("Incorrect email or password");
      }
      if (msg.includes("email not confirmed")) {
        throw new Error("Please confirm your email before logging in");
      }
      throw new Error(result.error);
    }

    if (result.data?.access_token) {
      const redacted = (token: string | undefined) =>
        token ? `${token.slice(0, 10)}...` : "<missing>";
      console.log("Login backend response:", {
        ...result.data,
        access_token: redacted(result.data.access_token),
        refresh_token: redacted(result.data.refresh_token),
      });

      const setSessionResult = await supabase.auth.setSession({
        access_token: result.data.access_token,
        refresh_token: result.data.refresh_token,
      });
      const { error } = setSessionResult;

      console.log("setSession result:", {
        errorIsNull: error === null,
        sessionExists: !!setSessionResult.data.session,
        userExists: !!setSessionResult.data.user,
        raw: setSessionResult,
      });

      const session = await supabase.auth.getSession();
      console.log("Session after setSession:", session);

      console.log("localStorage keys:", Object.keys(localStorage));
      console.log(
        "Supabase auth key:",
        Object.keys(localStorage).find(k => k.includes("auth-token"))
      );

      if (error) {
        throw error;
      }
    }

    await fetchUser();
    return result.data;
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    useAuthStore.getState().clearAuth();
    navigate("/login", { replace: true });
  }, [navigate]);

  const forgotPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });

    if (error) throw new Error(error.message);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}`,
      },
    });

    if (error) throw new Error(error.message);
  }, []);

  const fetchUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      useAuthStore.getState().clearAuth();
      return;
    }

    const result = await api.get<import("@/services/types").AuthMeResponse>("/api/v1/auth/me");
    if (result.error || !result.data) {
      useAuthStore.getState().clearAuth();
      return;
    }

    useAuthStore.getState().setUser(result.data);
  }, []);

  return {
    user,
    isAuthenticated,
    isLoading,
    signup,
    login,
    logout,
    forgotPassword,
    signInWithGoogle,
    fetchUser,
  };
}
