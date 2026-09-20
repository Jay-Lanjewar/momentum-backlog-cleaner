import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useLinkingURL } from "expo-linking";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";

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
  const linkingURL = useLinkingURL();
  const [state, setState] = useState<ConfirmState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const processedRef = useRef(false);

  useEffect(() => {
    useAuthStore.getState().setConfirming(true);
  }, []);

  useEffect(() => {
    if (processedRef.current || !linkingURL) return;
    processedRef.current = true;

    let cancelled = false;
    const url = linkingURL;

    async function process() {
      const tokens = parseHashTokens(url);
      if (!tokens?.access_token || !tokens.refresh_token) {
        if (!cancelled) {
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

        if (cancelled) return;
        if (error) {
          setErrorMessage(error.message);
          setState("error");
          useAuthStore.getState().setConfirming(false);
        } else {
          setState("success");
        }
      } catch {
        if (!cancelled) {
          setErrorMessage("Something went wrong. Please try again.");
          setState("error");
          useAuthStore.getState().setConfirming(false);
        }
      }
    }

    process();

    return () => {
      cancelled = true;
    };
  }, [linkingURL]);

  if (state === "loading") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.title}>Verifying your email...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (state === "success") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <Text style={styles.icon}>{"\u2713"}</Text>
          </View>
          <Text style={styles.title}>Email verified!</Text>
          <Text style={styles.body}>Taking you to Momentum...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={[styles.iconCircle, styles.iconCircleError]}>
          <Text style={styles.icon}>{"\u2715"}</Text>
        </View>
        <Text style={styles.title}>Confirmation failed</Text>
        <Text style={styles.body}>{errorMessage}</Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.replace("/(auth)/login")}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Back to Sign In</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => router.replace("/(auth)/register")}
        >
          <Text style={styles.linkText}>Create a new account</Text>
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
