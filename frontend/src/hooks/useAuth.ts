import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/services/supabase";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/useAuthStore";
import type { AuthResponse } from "@/services/types";

export class AuthError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const navigate = useNavigate();

  const establishSession = useCallback(async (data: AuthResponse) => {
    if (!data?.access_token) return;
    const { error } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
    if (error) throw error;
    useAuthStore.getState().setUser({
      ...data.user,
      profile: null,
      streak: null,
    });
  }, []);

  const signup = useCallback(
    async (email: string, password: string, name?: string) => {
      const result = await api.post<AuthResponse>("/api/v1/auth/signup", {
        email,
        password,
        name: name || null,
      });

      if (result.error) {
        if (result.errorCode === "email_not_confirmed") {
          throw new AuthError("Please verify your email first", "email_not_confirmed");
        }
        if (result.errorCode === "account_exists") {
          throw new AuthError("An account with this email already exists", "account_exists");
        }
        if (result.errorCode === "weak_password") {
          throw new AuthError("Password is too weak. Use at least 6 characters.", "weak_password");
        }
        throw new AuthError("Something went wrong. Please try again.");
      }

      await establishSession(result.data);
      return result.data;
    },
    [establishSession]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api.post<AuthResponse>("/api/v1/auth/login", {
        email,
        password,
      });

      if (result.error) {
        const msg = result.error.toLowerCase();
        if (result.errorCode === "email_not_confirmed" || msg.includes("email not confirmed")) {
          throw new AuthError("Please verify your email first", "email_not_confirmed");
        }
        if (
          result.errorCode === "invalid_credentials" ||
          msg.includes("invalid login credentials") ||
          msg.includes("incorrect email or password")
        ) {
          throw new AuthError("Incorrect email or password", "invalid_credentials");
        }
        throw new AuthError("Something went wrong. Please try again.");
      }

      await establishSession(result.data);
      return result.data;
    },
    [establishSession]
  );

  const resendVerificationEmail = useCallback(async (email: string) => {
    const result = await api.post<{ message: string }>("/api/v1/auth/resend-verification", {
      email,
    });

    if (result.error) {
      throw new AuthError("Couldn't resend the email. Please try again in a minute.");
    }
    return result.data?.message ?? "Verification email sent";
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

  return {
    user,
    isAuthenticated,
    isLoading,
    signup,
    login,
    logout,
    forgotPassword,
    signInWithGoogle,
    resendVerificationEmail,
  };
}
