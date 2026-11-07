import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Linking,
  Modal,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { MeHeader } from "@/components/MeHeader";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import { clearDashboardSessionData } from "@/services/hooks";
import {
  getPermissionState,
  requestNotificationPermission,
} from "@/services/notifications";
import { usePreferencesStore } from "@/store/usePreferencesStore";
import {
  ACCENT_LABELS,
  ACCENT_OPTIONS,
  APPEARANCE_OPTIONS,
  type AccentName,
  type Appearance,
} from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";

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
  const { user, clearAuth, beginLogout, cancelLogout } = useAuthStore();
  const { colors, appearance, accent } = useTheme();
  const setAppearance = usePreferencesStore((state) => state.setAppearance);
  const setAccent = usePreferencesStore((state) => state.setAccent);
  const [notificationState, setNotificationState] =
    useState<NotificationRowState>("loading");
  const [themeModalVisible, setThemeModalVisible] = useState(false);

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

  function openSystemSettings() {
    try {
      void Linking.openSettings().catch(() => {});
    } catch {
      // Settings intent unavailable; nothing to do.
    }
  }

  async function handleNotificationsPress() {
    if (notificationState === "loading" || notificationState === "granted") {
      return;
    }
    if (notificationState === "blocked") {
      // Permanently denied: the native prompt is no longer available.
      openSystemSettings();
      return;
    }

    // Explicit user action: bypass the once-per-session anti-nag latch so a
    // deliberate Settings tap always reaches the native prompt, even when
    // the latch already tripped (e.g. the Today priming card).
    const granted = await requestNotificationPermission({
      bypassSessionLatch: true,
    });
    if (granted) {
      setNotificationState("granted");
      return;
    }

    // Refused, failed, or denied: never leave the tap looking like a no-op.
    // Refresh state (a second denial may have flipped us to blocked) and
    // land the user where they can flip the toggle themselves.
    getPermissionState()
      .then((state) => setNotificationState(classifyNotificationState(state)))
      .catch(() => setNotificationState("askable"));
    openSystemSettings();
  }

  async function handleSignOut() {
    const confirmed = await new Promise<boolean>((resolve) => {
      Alert.alert("Sign Out", "Are you sure you want to sign out?", [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Sign Out", style: "destructive", onPress: () => resolve(true) },
      ]);
    });

    if (!confirmed) return;

    const currentUserId = useAuthStore.getState().user?.id;
    beginLogout();
    clearDashboardSessionData(currentUserId);
    try {
      await supabase.auth.signOut();
      clearAuth();
      router.replace("/(auth)/login");
    } catch (error) {
      cancelLogout();
      throw error;
    }
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["bottom"]}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <MeHeader screen="settings" title="Settings" />

        <View style={[styles.profileSection, { backgroundColor: colors.surface }]}>
          <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
            <Text style={styles.avatarText}>
              {user?.name?.charAt(0).toUpperCase() ?? "S"}
            </Text>
          </View>
          <View>
            <Text style={[styles.name, { color: colors.primaryText }]}>
              {user?.name ?? "Student"}
            </Text>
            <Text style={[styles.email, { color: colors.mutedText }]}>
              {user?.email ?? ""}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.mutedText }]}>
            Account
          </Text>
          <TouchableOpacity
            style={[styles.row, { backgroundColor: colors.surface }]}
            activeOpacity={0.6}
            onPress={() => router.push("/(me)/change-password")}
            accessibilityRole="button"
            accessibilityLabel="Change Password"
            testID="settings-change-password-row"
          >
            <Text style={[styles.rowText, { color: colors.primaryText }]}>
              Change Password
            </Text>
            <Text style={[styles.arrow, { color: colors.mutedText }]}>{"\u2192"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.row, { backgroundColor: colors.surface }]}
            activeOpacity={0.6}
            onPress={() => router.push("/(me)/security")}
            accessibilityRole="button"
            accessibilityLabel="Security"
            testID="settings-security-row"
          >
            <Text style={[styles.rowText, { color: colors.primaryText }]}>Security</Text>
            <Text style={[styles.arrow, { color: colors.mutedText }]}>{"\u2192"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.mutedText }]}>
            Preferences
          </Text>
          {notificationState === "granted" || notificationState === "loading" ? (
            <View style={[styles.row, { backgroundColor: colors.surface }]}>
              <Text style={[styles.rowText, { color: colors.primaryText }]}>
                Notifications
              </Text>
              <Text style={[styles.hint, { color: colors.mutedText }]} testID="notifications-status">
                {notificationHintText}
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.row, { backgroundColor: colors.surface }]}
              activeOpacity={0.6}
              onPress={handleNotificationsPress}
              accessibilityRole="button"
              accessibilityLabel={`Notifications, ${notificationHintText}`}
              accessibilityHint={
                notificationState === "blocked"
                  ? "Opens system settings"
                  : "Requests permission to show notifications"
              }
              testID="notifications-row"
            >
              <Text style={[styles.rowText, { color: colors.primaryText }]}>
                Notifications
              </Text>
              <Text style={[styles.hint, { color: colors.mutedText }]} testID="notifications-status">
                {notificationHintText}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.row, { backgroundColor: colors.surface }]}
            onPress={() => setThemeModalVisible(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Theme, ${appearanceLabel(appearance)}`}
            testID="settings-theme-row"
          >
            <View>
              <Text style={[styles.rowText, { color: colors.primaryText }]}>
                Theme
              </Text>
              <Text style={[styles.themeHint, { color: colors.mutedText }]} testID="settings-theme-hint">
                Appearance and accent colour
              </Text>
            </View>
            <Text style={[styles.hint, { color: colors.mutedText }]}>
              {appearanceLabel(appearance)}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={[
              styles.signOutButton,
              {
                backgroundColor: `${colors.error}1A`,
                borderColor: `${colors.error}66`,
              },
            ]}
            onPress={handleSignOut}
            activeOpacity={0.8}
          >
            <Text style={[styles.signOutText, { color: colors.error }]}>
              Sign Out
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.version, { color: colors.mutedText }]}>
          Momentum v0.1.0
        </Text>
      </ScrollView>
      <ThemeCustomizationModal
        visible={themeModalVisible}
        appearance={appearance}
        accent={accent}
        onClose={() => setThemeModalVisible(false)}
        onAppearanceChange={setAppearance}
        onAccentChange={setAccent}
      />
    </SafeAreaView>
  );
}

function appearanceLabel(appearance: Appearance): string {
  return appearance.charAt(0).toUpperCase() + appearance.slice(1);
}

function ThemeCustomizationModal({
  visible,
  appearance,
  accent,
  onClose,
  onAppearanceChange,
  onAccentChange,
}: {
  visible: boolean;
  appearance: Appearance;
  accent: AccentName;
  onClose: () => void;
  onAppearanceChange: (value: Appearance) => void;
  onAccentChange: (value: AccentName) => void;
}) {
  const { colors } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: colors.dialog }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.primaryText }]}>
              Theme customization
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close theme customization"
              hitSlop={12}
            >
              <Text style={[styles.close, { color: colors.mutedText }]}>
                {"\u00D7"}
              </Text>
            </Pressable>
          </View>
          <Text style={[styles.modalLabel, { color: colors.secondaryText }]}>
            Appearance
          </Text>
          <View style={styles.optionGrid}>
            {APPEARANCE_OPTIONS.map((option) => (
              <ThemeOption
                key={option}
                label={appearanceLabel(option)}
                selected={appearance === option}
                onPress={() => onAppearanceChange(option)}
                colors={colors}
                testID={`appearance-${option}`}
              />
            ))}
          </View>
          <Text style={[styles.modalLabel, { color: colors.secondaryText }]}>
            Accent colour
          </Text>
          <View style={styles.optionGrid}>
            {ACCENT_OPTIONS.map((option) => (
              <ThemeOption
                key={option}
                label={ACCENT_LABELS[option]}
                selected={accent === option}
                onPress={() => onAccentChange(option)}
                colors={colors}
                testID={`accent-${option}`}
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ThemeOption({
  label,
  selected,
  onPress,
  colors,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
  testID: string;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.option,
        {
          backgroundColor: selected ? colors.selected : colors.pressed,
          borderColor: selected ? colors.accent : colors.border,
        },
      ]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      testID={testID}
      activeOpacity={0.75}
    >
      <Text style={[styles.optionText, { color: colors.primaryText }]}>
        {label}
      </Text>
      {selected ? (
        <Text style={[styles.checkmark, { color: colors.accentText }]}>
          {"\u2713"}
        </Text>
      ) : null}
    </TouchableOpacity>
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
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(2, 6, 23, 0.65)",
    padding: 16,
  },
  modalCard: {
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  close: {
    fontSize: 28,
    lineHeight: 28,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },
  optionGrid: {
    gap: 8,
  },
  option: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionText: {
    fontSize: 15,
    fontWeight: "600",
  },
  checkmark: {
    fontSize: 18,
    fontWeight: "700",
  },
});
