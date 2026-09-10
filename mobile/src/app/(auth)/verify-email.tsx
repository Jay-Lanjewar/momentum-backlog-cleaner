import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";

import { supabase } from "@/lib/supabase";

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResend() {
    if (!email) return;
    setError(null);
    setLoading(true);

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email,
      });

      if (resendError) {
        setError(resendError.message);
      } else {
        setSent(true);
      }
    } catch {
      setError("Failed to resend. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Text style={styles.icon}>{"\u2709"}</Text>
        </View>

        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.body}>
          We sent a verification link to
        </Text>
        {email ? <Text style={styles.email}>{email}</Text> : null}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleResend}
          disabled={loading || !email}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {sent ? "Sent!" : "Resend Verification Email"}
            </Text>
          )}
        </TouchableOpacity>

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}

        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => router.replace("/(auth)/login")}
        >
          <Text style={styles.linkText}>Back to Sign In</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => router.replace("/(auth)/register")}
        >
          <Text style={[styles.linkText, styles.linkBold]}>Change Email</Text>
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
  icon: { fontSize: 32 },
  title: { fontSize: 24, fontWeight: "700", color: "#1A1A1A", marginBottom: 8 },
  body: { fontSize: 15, color: "#666", textAlign: "center", marginBottom: 4 },
  email: { fontSize: 15, fontWeight: "600", color: "#1A1A1A", marginBottom: 32 },
  button: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: "center",
    width: "100%",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  errorText: { color: "#EF4444", fontSize: 14, marginTop: 16 },
  linkRow: { marginTop: 20 },
  linkText: { fontSize: 14, color: "#2563EB" },
  linkBold: { fontWeight: "600" },
});
