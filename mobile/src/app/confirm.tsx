import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { useLinkingURL } from "expo-linking";

import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import type { AuthMeResponse } from "@/services/types";
import { useTheme } from "@/theme/ThemeProvider";

type ConfirmState = "loading" | "success" | "error";

function parseHashTokens(url: string): Record<string, string> | null {
  const hashIndex = url.indexOf("#");
  if (hashIndex === -1) return null;
  const hash = url.slice(hashIndex + 1);
  if (!hash) return null;

  const params: Record<string, string> = {};
  for (const pair of hash.split("&")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    params[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1));
  }
  return params;
}

export default function ConfirmScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const linkingURL = useLinkingURL();
  const [state, setState] = useState<ConfirmState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const processedRef = useRef(false);
  const unmountedRef = useRef(false);
  const navigatedRef = useRef(false);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Single exit point: guarded so the delayed timer, the fallback CTA, and the
  // recovery branch can never double-navigate. Not dependent on any
  // linkingURL/effect-cancellation flag.
  const navigateOnce = useCallback(
    (href: Href) => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      if (successTimerRef.current !== null) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
      router.replace(href);
    },
    [router],
  );

  useEffect(() => {
    useAuthStore.getState().setConfirming(true);
    return () => {
      // Unmount-only cleanup: never triggered by linkingURL changes, so a
      // re-delivered deep link cannot cancel a scheduled success navigation.
      unmountedRef.current = true;
      if (successTimerRef.current !== null) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (processedRef.current || !linkingURL) return;
    processedRef.current = true;

    const url = linkingURL;

    async function process() {
      const tokens = parseHashTokens(url);
      if (!tokens?.access_token || !tokens.refresh_token) {
        if (!unmountedRef.current) {
          setErrorMessage("Invalid or expired confirmation link.");
          setState("error");
          useAuthStore.getState().setConfirming(false);
        }
        return;
      }

      try {
        const { error } = await supabase.auth.setSession({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
        });

        if (unmountedRef.current) return;
        if (error) {
          setErrorMessage(error.message);
          setState("error");
          useAuthStore.getState().setConfirming(false);
          return;
        }

        const isRecovery = tokens.type === "recovery";

        try {
          const meResult = await api.get<AuthMeResponse>("/api/v1/auth/me");
          if (!unmountedRef.current && meResult.data) {
            useAuthStore.getState().setUser(meResult.data);
          }
        } catch {
          // Profile fetch failed — Supabase session is valid, proceed anyway
        }

        if (unmountedRef.current) return;

        if (isRecovery) {
          // Keep confirming=true while transitioning to the reset-password
          // screen so AuthGate does not redirect the recovery session away.
          navigateOnce("/(auth)/reset-password");
          return;
        }

        useAuthStore.getState().setConfirming(false);
        setState("success");
        successTimerRef.current = setTimeout(() => {
          successTimerRef.current = null;
          navigateOnce("/");
        }, 1500);
      } catch {
        if (!unmountedRef.current) {
          setErrorMessage("Something went wrong. Please try again.");
          setState("error");
          useAuthStore.getState().setConfirming(false);
        }
      }
    }

    process();
  }, [linkingURL, navigateOnce]);

  if (state === "loading") {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.content}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.title, { color: colors.primaryText }]}>Verifying your email...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (state === "success") {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.content}>
          <View style={[styles.iconCircle, { backgroundColor: `${colors.success}20` }]}>
            <Text style={[styles.icon, { color: colors.success }]}>{"\u2713"}</Text>
          </View>
          <Text style={[styles.title, { color: colors.primaryText }]}>Email verified!</Text>
          <Text style={[styles.body, { color: colors.secondaryText }]}>Taking you to Momentum...</Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.accent }]}
            onPress={() => navigateOnce("/")}
            accessibilityRole="button"
            accessibilityLabel="Continue to Momentum"
            activeOpacity={0.8}
          >
            <Text style={[styles.buttonText, { color: colors.accentForeground }]}>Continue to Momentum</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={[styles.iconCircle, styles.iconCircleError, { backgroundColor: `${colors.error}20` }]}>
          <Text style={[styles.icon, { color: colors.error }]}>{"\u2715"}</Text>
        </View>
        <Text style={[styles.title, { color: colors.primaryText }]}>Confirmation failed</Text>
        <Text style={[styles.body, { color: colors.secondaryText }]}>{errorMessage}</Text>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.accent }]}
          onPress={() => router.replace("/(auth)/login")}
          activeOpacity={0.8}
        >
          <Text style={[styles.buttonText, { color: colors.accentForeground }]}>Back to Sign In</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => router.replace("/(auth)/register")}
        >
          <Text style={[styles.linkText, { color: colors.accentText }]}>Create a new account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAFAFA" },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  iconCircleError: {
    backgroundColor: "#FEF2F2",
  },
  icon: { fontSize: 32, color: "#2563EB" },
  title: { fontSize: 24, fontWeight: "700", color: "#1A1A1A", marginBottom: 8, textAlign: "center" },
  body: { fontSize: 15, color: "#666", textAlign: "center", marginBottom: 32 },
  button: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: "center",
    width: "100%",
  },
  buttonText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  linkRow: { marginTop: 20 },
  linkText: { fontSize: 14, color: "#2563EB" },
});
