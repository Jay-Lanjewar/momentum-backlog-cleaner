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
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { supabase } from "@/lib/supabase";
import { isValidEmail, passwordStrength } from "@/lib/onboarding";

export default function RegisterScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const strength = passwordStrength(password);

  const canSubmit =
    trimmedName.length > 0 &&
    trimmedName.length <= 25 &&
    isValidEmail(trimmedEmail) &&
    password.length >= 8 &&
    password === confirm &&
    !loading;

  async function handleRegister() {
    if (!canSubmit) return;
    setError(null);
    setLoading(true);

    try {
      const { data, error: signupError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: { data: { name: trimmedName } },
      });

      if (signupError) {
        setError(signupError.message);
        return;
      }

      if (data.user && !data.session) {
        router.replace({
          pathname: "/(auth)/verify-email",
          params: { email: trimmedEmail },
        });
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
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Start building your momentum.</Text>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor="#999"
              autoComplete="name"
              maxLength={25}
            />

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

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Min 8 characters"
              placeholderTextColor="#999"
              secureTextEntry
              autoComplete="new-password"
            />
            {password.length > 0 ? (
              <Text style={[styles.strengthText, { color: strength.color }]}>
                {strength.label}
              </Text>
            ) : null}

            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              style={styles.input}
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Re-enter password"
              placeholderTextColor="#999"
              secureTextEntry
              autoComplete="new-password"
            />
            {confirm.length > 0 && password !== confirm ? (
              <Text style={styles.errorSmall}>Passwords do not match</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.button, !canSubmit && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={!canSubmit}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Create Account</Text>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => router.replace("/(auth)/login")}
          >
            <Text style={styles.linkText}>
              Already have an account? <Text style={styles.linkBold}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAFAFA" },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24 },
  header: { marginBottom: 32, alignItems: "center" },
  title: { fontSize: 30, fontWeight: "700", color: "#1A1A1A", marginBottom: 8 },
  subtitle: { fontSize: 16, color: "#666" },
  form: { gap: 12 },
  label: { fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 2 },
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
  strengthText: { fontSize: 12, fontWeight: "600", marginTop: -6 },
  errorSmall: { fontSize: 12, color: "#EF4444", marginTop: -6 },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { color: "#991B1B", fontSize: 14 },
  button: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  linkRow: { marginTop: 24, alignItems: "center" },
  linkText: { fontSize: 14, color: "#666" },
  linkBold: { color: "#2563EB", fontWeight: "600" },
});
