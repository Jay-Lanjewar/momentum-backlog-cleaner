import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Linking } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { MeHeader } from "@/components/MeHeader";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import {
  getPermissionState,
  requestNotificationPermission,
} from "@/services/notifications";

/**
 * loading → "…"; granted → "On"; anything else → "Off".
 * askable = not granted but the system may still show the prompt.
 * blocked = permanently denied → tapping deep-links to system Settings.
 */
type NotificationRowState = "loading" | "granted" | "askable" | "blocked";

function classifyNotificationState(state: {
  status: string;
  canAskAgain?: boolean;
}): NotificationRowState {
  if (state.status === "granted") return "granted";
  if (state.canAskAgain === false) return "blocked";
  return "askable";
}

export default function SettingsScreen() {
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const [notificationState, setNotificationState] =
    useState<NotificationRowState>("loading");

  useEffect(() => {
    let cancelled = false;

    getPermissionState()
      .then((state) => {
        if (cancelled) return;
        setNotificationState(classifyNotificationState(state));
      })
      .catch(() => {
        if (cancelled) return;
        // Permission state unavailable: honest "Off", tap retries via helper.
        setNotificationState("askable");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const notificationHintText =
    notificationState === "loading"
      ? "…"
      : notificationState === "granted"
        ? "On"
        : "Off";

  async function handleNotificationsPress() {
    if (notificationState === "loading" || notificationState === "granted") {
      return;
    }
    if (notificationState === "blocked") {
      // Permanently denied: the native prompt is no longer available.
      try {
        void Linking.openSettings().catch(() => {});
      } catch {
        // Settings intent unavailable; nothing to do.
      }
      return;
    }

    // askable: one native attempt. The helper's once-per-session latch and
    // the platform's own limits prevent repeated nagging.
    const granted = await requestNotificationPermission();
    if (granted) {
      setNotificationState("granted");
      return;
    }
    // Status may have just flipped to permanently blocked (second denial).
    getPermissionState()
      .then((state) => setNotificationState(classifyNotificationState(state)))
      .catch(() => setNotificationState("askable"));
  }

  async function handleSignOut() {
    const confirmed = await new Promise<boolean>((resolve) => {
      Alert.alert("Sign Out", "Are you sure you want to sign out?", [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Sign Out", style: "destructive", onPress: () => resolve(true) },
      ]);
    });

    if (!confirmed) return;

    await supabase.auth.signOut();
    clearAuth();
    router.replace("/(auth)/login");
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <MeHeader screen="settings" title="Settings" />

        <View style={styles.profileSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name?.charAt(0).toUpperCase() ?? "S"}
            </Text>
          </View>
          <View>
            <Text style={styles.name}>{user?.name ?? "Student"}</Text>
            <Text style={styles.email}>{user?.email ?? ""}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Account</Text>
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.6}
            onPress={() => router.push("/(me)/change-password")}
            accessibilityRole="button"
            accessibilityLabel="Change Password"
            testID="settings-change-password-row"
          >
            <Text style={styles.rowText}>Change Password</Text>
            <Text style={styles.arrow}>{"\u2192"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.6}
            onPress={() => router.push("/(me)/security")}
            accessibilityRole="button"
            accessibilityLabel="Security"
            testID="settings-security-row"
          >
            <Text style={styles.rowText}>Security</Text>
            <Text style={styles.arrow}>{"\u2192"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Preferences</Text>
          {notificationState === "granted" || notificationState === "loading" ? (
            <View style={styles.row}>
              <Text style={styles.rowText}>Notifications</Text>
              <Text style={styles.hint} testID="notifications-status">
                {notificationHintText}
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={handleNotificationsPress}
              accessibilityRole="button"
              accessibilityLabel={`Notifications, ${notificationHintText}`}
              testID="notifications-row"
            >
              <Text style={styles.rowText}>Notifications</Text>
              <Text style={styles.hint} testID="notifications-status">
                {notificationHintText}
              </Text>
            </TouchableOpacity>
          )}
          <View style={styles.row} testID="settings-theme-row">
            <View>
              <Text style={styles.rowText}>Theme</Text>
              <Text style={styles.themeHint} testID="settings-theme-hint">
                Theme customization coming later.
              </Text>
            </View>
            <Text style={styles.hint}>Dark</Text>
          </View>
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOut}
            activeOpacity={0.8}
          >
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.version}>Momentum v0.1.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  profileSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 16,
    backgroundColor: "#1E293B",
    borderRadius: 14,
    marginBottom: 24,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#FFF",
    fontSize: 24,
    fontWeight: "700",
  },
  name: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "700",
  },
  email: {
    color: "#94A3B8",
    fontSize: 14,
    marginTop: 2,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 16,
    marginBottom: 4,
  },
  rowText: {
    color: "#F8FAFC",
    fontSize: 16,
  },
  arrow: {
    color: "#64748B",
    fontSize: 16,
  },
  hint: {
    color: "#64748B",
    fontSize: 14,
  },
  themeHint: {
    color: "#64748B",
    fontSize: 14,
    marginTop: 2,
  },
  signOutButton: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    padding: 16,
    alignItems: "center",
  },
  signOutText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#EF4444",
  },
  version: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
    marginTop: 16,
  },
});
