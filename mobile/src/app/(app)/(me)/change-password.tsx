import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { MeHeader } from "@/components/MeHeader";
import { supabase } from "@/lib/supabase";
import { passwordStrength } from "@/lib/onboarding";
import { friendlyMfaError } from "@/lib/mfa";

function errorCodeOf(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code } = error as { code?: unknown };
    if (typeof code === "string" && code.length > 0) return code;
  }
  return null;
}

/**
 * Friendly copy for a failed password update. Supabase error text must
 * never reach the screen; MFA/AAL failures reuse the shared MFA copy.
 */
function friendlyUpdateError(error: unknown): string {
  const code = errorCodeOf(error);
  if (code && (code.includes("mfa") || code.includes("aal"))) {
    return friendlyMfaError(error);
  }
  if (error instanceof TypeError) {
    return "You're offline. Check your connection and try again.";
  }
  return "Something went wrong. Please try again.";
}

export default function ChangePasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const strength = passwordStrength(password);
  const canSubmit =
    password.length >= 8 && password === confirm && !loading && !success;

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => router.back(), 1000);
    return () => clearTimeout(timer);
  }, [success, router]);

  async function handleSubmit() {
    if (!canSubmit) return;

    setError(null);
    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(friendlyUpdateError(updateError));
      } else {
        setPassword("");
        setConfirm("");
        setSuccess(true);
      }
    } catch (e) {
      setError(friendlyUpdateError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <MeHeader screen="change-password" title="Change Password" />

          <Text style={styles.intro}>
            Choose a new password for your account.
          </Text>

          <Text style={styles.label}>New Password</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Min 8 characters"
              placeholderTextColor="#64748B"
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              autoCapitalize="none"
              testID="change-password-new"
            />
            <TouchableOpacity
              style={styles.toggleButton}
              onPress={() => setShowPassword((visible) => !visible)}
              accessibilityRole="button"
              accessibilityLabel={
                showPassword ? "Hide new password" : "Show new password"
              }
              testID="change-password-toggle-new"
            >
              <Text style={styles.toggleText}>
                {showPassword ? "Hide" : "Show"}
              </Text>
            </TouchableOpacity>
          </View>
          {password.length > 0 ? (
            <Text
              style={[styles.strengthText, { color: strength.color }]}
              testID="change-password-strength"
            >
              {strength.label}
            </Text>
          ) : null}
          {password.length > 0 && password.length < 8 ? (
            <Text style={styles.hintError} testID="change-password-short">
              Password must be at least 8 characters
            </Text>
          ) : null}

          <Text style={styles.label}>Confirm New Password</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Re-enter password"
              placeholderTextColor="#64748B"
              secureTextEntry={!showConfirm}
              autoComplete="new-password"
              autoCapitalize="none"
              testID="change-password-confirm"
            />
            <TouchableOpacity
              style={styles.toggleButton}
              onPress={() => setShowConfirm((visible) => !visible)}
              accessibilityRole="button"
              accessibilityLabel={
                showConfirm ? "Hide confirmed password" : "Show confirmed password"
              }
              testID="change-password-toggle-confirm"
            >
              <Text style={styles.toggleText}>
                {showConfirm ? "Hide" : "Show"}
              </Text>
            </TouchableOpacity>
          </View>
          {password.length > 0 && password !== confirm ? (
            <Text style={styles.hintError} testID="change-password-mismatch">
              Passwords do not match
            </Text>
          ) : null}

          {error ? (
            <Text style={styles.errorText} testID="change-password-error">
              {error}
            </Text>
          ) : null}

          {success ? (
            <View style={styles.successBox} testID="change-password-success">
              <Text style={styles.successText}>Password updated</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Update password"
            accessibilityState={{ disabled: !canSubmit }}
            testID="change-password-submit"
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>Update password</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  flex: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  intro: {
    color: "#94A3B8",
    fontSize: 14,
    marginBottom: 24,
    marginLeft: 4,
  },
  label: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 6,
    marginLeft: 4,
  },
  inputRow: {
    backgroundColor: "#1E293B",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 14,
    paddingRight: 12,
    marginBottom: 4,
  },
  input: {
    flex: 1,
    color: "#F8FAFC",
    fontSize: 16,
    paddingVertical: 14,
  },
  toggleButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingLeft: 12,
  },
  toggleText: {
    color: "#60A5FA",
    fontSize: 14,
    fontWeight: "600",
  },
  strengthText: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 16,
    marginLeft: 4,
  },
  hintError: {
    color: "#F87171",
    fontSize: 13,
    marginTop: 6,
    marginBottom: 12,
    marginLeft: 4,
  },
  errorText: {
    color: "#F87171",
    fontSize: 14,
    marginTop: 12,
    marginLeft: 4,
  },
  successBox: {
    backgroundColor: "rgba(34, 197, 94, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.4)",
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
  },
  successText: {
    color: "#86EFAC",
    fontSize: 15,
    fontWeight: "600",
  },
  button: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
