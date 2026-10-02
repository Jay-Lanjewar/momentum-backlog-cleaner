import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import { loadAuthMe } from "@/hooks/useAuth";
import { challengeErrorCopy, isValidTotpCode } from "@/lib/mfa";

/**
 * Login-time 2-step verification. Reached only via the AuthGate when the
 * session is aal1 with a verified TOTP factor; never listed as a place the
 * user can browse to. Success clears the challenge flag and loads the
 * profile — AuthGate then routes into the app.
 */
export default function TwoFactorScreen() {
  const router = useRouter();
  const factorId = useAuthStore((s) => s.mfaFactorId);
  const meError = useAuthStore((s) => s.meError);
  const setMeError = useAuthStore((s) => s.setMeError);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const completeMfaChallenge = useAuthStore((s) => s.completeMfaChallenge);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);

  async function handleVerify() {
    const trimmed = code.trim();
    if (!factorId || busy) return;
    if (!isValidTotpCode(trimmed)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // Fresh challenge per attempt so an expired one can never block a retry.
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error || !challenge.data) {
        setError(challengeErrorCopy(challenge.error));
        return;
      }

      const verify = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: trimmed,
      });
      if (verify.error || !verify.data) {
        setError(challengeErrorCopy(verify.error));
        setCode("");
        return;
      }

      // verify() saved the aal2 session; release the gate, then load the
      // profile so AuthGate can route. A /me failure shows meError + Retry.
      setCode("");
      completeMfaChallenge();
      await loadAuthMe();
    } catch (verifyError) {
      setError(challengeErrorCopy(verifyError));
    } finally {
      setBusy(false);
    }
  }

  async function handleBackToSignIn() {
    if (busy) return;
    setBusy(true);
    try {
      await supabase.auth.signOut().catch(() => {});
      clearAuth();
      router.replace("/(auth)/login");
    } finally {
      setBusy(false);
    }
  }

  async function handleMeRetry() {
    if (retrying) return;
    setRetrying(true);
    try {
      setMeError(null);
      await loadAuthMe();
    } finally {
      setRetrying(false);
    }
  }

  const canVerify = isValidTotpCode(code) && !!factorId && !busy;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Two-step verification</Text>
            <Text style={styles.subtitle}>
              Open your authenticator app and enter the 6-digit code for
              Momentum.
            </Text>
          </View>

          {error ? (
            <View style={styles.errorBox} testID="two-factor-error">
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {meError ? (
            <View style={styles.meErrorBox} testID="two-factor-me-error">
              <Text style={styles.meErrorText}>{meError}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => void handleMeRetry()}
                disabled={retrying}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Retry loading your account"
                testID="two-factor-me-retry"
              >
                {retrying ? (
                  <ActivityIndicator color="#2563EB" size="small" />
                ) : (
                  <Text style={styles.retryButtonText}>Retry</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.form}>
            <Text style={styles.label}>6-digit code</Text>
            <TextInput
              style={styles.codeInput}
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              placeholderTextColor="#999"
              keyboardType="number-pad"
              maxLength={6}
              editable={!busy}
              accessibilityLabel="6-digit code from your authenticator app"
              testID="two-factor-code-input"
            />

            <TouchableOpacity
              style={[styles.button, !canVerify && styles.buttonDisabled]}
              onPress={() => void handleVerify()}
              disabled={!canVerify}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Verify 6-digit code"
              testID="two-factor-verify"
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Verify</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => void handleBackToSignIn()}
              disabled={busy}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Back to sign in"
              testID="two-factor-back"
            >
              <Text style={styles.backText}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAFAFA",
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  header: {
    marginBottom: 40,
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 10,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    lineHeight: 23,
  },
  form: {
    gap: 16,
  },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: "#991B1B",
    fontSize: 14,
    lineHeight: 20,
  },
  meErrorBox: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  meErrorText: {
    color: "#991B1B",
    fontSize: 14,
    marginBottom: 8,
  },
  retryButton: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  retryButtonText: {
    color: "#2563EB",
    fontSize: 14,
    fontWeight: "600",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  codeInput: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: 10,
    color: "#1A1A1A",
    textAlign: "center",
  },
  button: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  backText: {
    fontSize: 15,
    color: "#2563EB",
    fontWeight: "600",
    textAlign: "center",
    marginTop: 4,
    paddingVertical: 10,
  },
});
