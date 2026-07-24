import { useEffect } from "react";
import { supabase } from "@/services/supabase";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/useAuthStore";
import type { AuthMeResponse } from "@/services/types";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const { data: { session } } = await supabase.auth.getSession();

      if (cancelled) return;

      if (!session?.access_token) {
        useAuthStore.getState().setLoading(false);
        return;
      }

      const result = await api.get<AuthMeResponse>("/api/v1/auth/me");

      if (cancelled) return;

      if (result.data && !result.error) {
        useAuthStore.getState().setUser(result.data);
      } else {
        useAuthStore.getState().setLoading(false);
      }
    }

    restoreSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (cancelled) return;

        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          if (session?.access_token) {
            const result = await api.get<AuthMeResponse>("/api/v1/auth/me");
            if (cancelled) return;
            if (result.data && !result.error) {
              useAuthStore.getState().setUser(result.data);
              return;
            }
          }
        }

        if (event === "SIGNED_OUT") {
          useAuthStore.getState().setUser(null);
        }
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return <>{children}</>;
}
