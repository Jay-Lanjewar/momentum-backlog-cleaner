import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { supabase } from "@/lib/supabase";
import { isValidEmail } from "@/lib/onboarding";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedEmail = email.trim();
  const canSubmit = isValidEmail(trimmedEmail) && !loading;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    setLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        trimmedEmail,
      );

      if (resetError) {
        setError(resetError.message);
      } else {
        setSent(true);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>
            Enter your email and we&apos;ll send you a reset link.
          </Text>

          {sent ? (
            <View style={styles.successBox}>
              <Text style={styles.successText}>
                If an account exists for {trimmedEmail}, you&apos;ll receive a
                password reset link shortly.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="#999"
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
            </>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {!sent ? (
            <TouchableOpacity
              style={[styles.button, !canSubmit && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Send Reset Link</Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.button}
              onPress={() => router.replace("/(auth)/login")}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>Back to Sign In</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => router.replace("/(auth)/login")}
          >
            <Text style={styles.linkText}>Back to Sign In</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAFAFA" },
  flex: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    marginBottom: 32,
  },
  label: { fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 4 },
  input: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#1A1A1A",
  },
  successBox: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },
  successText: { color: "#166534", fontSize: 14, lineHeight: 20 },
  errorText: { color: "#EF4444", fontSize: 14, marginTop: 12 },
  button: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 16,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  linkRow: { marginTop: 20, alignItems: "center" },
  linkText: { fontSize: 14, color: "#2563EB" },
});
