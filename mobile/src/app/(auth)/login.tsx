import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/theme/ThemeProvider";

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { login, meError, retryMe } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Error", "Please enter email and password.");
      return;
    }
    setLoading(true);
    try {
      const outcome = await login(email.trim(), password);
      if (outcome === "mfa-required") {
        // No success UX here: the AuthGate swaps this screen for
        // (auth)/two-factor once the challenge flag lands in the store.
        return;
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Login failed";
      Alert.alert("Login failed", message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRetryMe() {
    if (retrying) return;
    setRetrying(true);
    try {
      await retryMe();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.primaryText }]}>
              Momentum
            </Text>
            <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
              Pick up where you left off.
            </Text>
          </View>

          {meError ? (
            <View style={styles.meErrorBox} testID="me-error">
              <Text style={[styles.meErrorText, { color: colors.error }]}>{meError}</Text>
              <TouchableOpacity
                style={[styles.retryButton, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}
                onPress={handleRetryMe}
                disabled={retrying}
                activeOpacity={0.8}
              >
                {retrying ? (
                  <ActivityIndicator color={colors.accent} size="small" />
                ) : (
                  <Text style={[styles.retryButtonText, { color: colors.accentText }]}>Retry</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.form}>
            <Text style={[styles.label, { color: colors.secondaryText }]}>Email</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.border,
                  color: colors.primaryText,
                },
              ]}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />

            <Text style={[styles.label, { color: colors.secondaryText }]}>
              Password
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.border,
                  color: colors.primaryText,
                },
              ]}
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              placeholderTextColor={colors.placeholder}
              secureTextEntry
              autoComplete="password"
            />

            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: colors.accent },
                loading && styles.buttonDisabled,
              ]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={colors.accentForeground} />
              ) : (
                <Text style={[styles.buttonText, { color: colors.accentForeground }]}>Sign In</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/(auth)/forgot-password")}
            >
              <Text style={[styles.forgotText, { color: colors.accentText }]}>
                Forgot password?
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => router.push("/(auth)/register")}
          >
            <Text style={[styles.linkText, { color: colors.secondaryText }]}>
              Don&apos;t have an account?{" "}
              <Text style={[styles.linkBold, { color: colors.accentText }]}>
                Create one
              </Text>
            </Text>
          </TouchableOpacity>
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
    marginBottom: 48,
    alignItems: "center",
  },
  title: {
    fontSize: 34,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
  },
  form: {
    gap: 16,
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
  forgotText: {
    color: "#2563EB",
    fontSize: 14,
    textAlign: "center",
    marginTop: 12,
  },
  linkRow: {
    marginTop: 24,
    alignItems: "center",
  },
  linkText: {
    fontSize: 14,
    color: "#666",
  },
  linkBold: {
    color: "#2563EB",
    fontWeight: "600",
  },
});
