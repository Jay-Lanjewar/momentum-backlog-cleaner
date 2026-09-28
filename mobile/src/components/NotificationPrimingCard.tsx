import { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import {
  getPermissionState,
  requestNotificationPermission,
} from "@/services/notifications";

const DISMISS_STORAGE_KEY = "momentum:notifications-priming-dismissed";

/**
 * Per-install dismissal flag. `localStorage` is installed app-wide by
 * `expo-sqlite/localStorage/install` (imported through lib/supabase), so a
 * dismissed card stays dismissed across relaunches. Environments without
 * localStorage fall back to session-only behavior via component state.
 */
function isPrimingDismissed(): boolean {
  try {
    return (
      typeof localStorage !== "undefined" &&
      localStorage.getItem(DISMISS_STORAGE_KEY) === "1"
    );
  } catch {
    return false;
  }
}

function persistPrimingDismissed(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(DISMISS_STORAGE_KEY, "1");
    }
  } catch {
    // Best effort: state still hides the card for this session.
  }
}

/**
 * One-time explanation shown on Today before Momentum asks for the native
 * notification permission. The system prompt is only ever triggered from the
 * "Enable notifications" CTA — never automatically by the scheduler.
 *
 * The card is inline (never a modal), always dismissible, and never blocks
 * the rest of Today.
 */
export function NotificationPrimingCard() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    try {
      if (isPrimingDismissed()) return;

      getPermissionState()
        .then((state) => {
          if (cancelled) return;
          if (state.status !== "granted") setVisible(true);
        })
        .catch(() => {
          // Permission state unavailable: stay quiet rather than offer a
          // CTA that cannot work. Settings remains the recovery surface.
        });
    } catch {
      // Defensive: a missing permission API must never crash Today.
    }

    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    persistPrimingDismissed();
    setVisible(false);
  };

  const handleEnable = () => {
    // Single-shot: hide after the attempt regardless of the outcome so a
    // denied prompt is never chased automatically. The helper enforces its
    // own once-per-session latch.
    void requestNotificationPermission().then(dismiss, dismiss);
  };

  return (
    <View style={styles.card} testID="notification-priming-card">
      <Text style={styles.heading} accessibilityRole="header">
        Stay on track
      </Text>
      <Text style={styles.body}>
        Momentum will remind you 10 minutes before each session, alert you when
        one starts, and tell you if one was missed.
      </Text>
      <TouchableOpacity
        style={styles.enableButton}
        onPress={handleEnable}
        accessibilityRole="button"
        accessibilityLabel="Enable notifications"
        testID="notification-priming-enable"
        activeOpacity={0.8}
      >
        <Text style={styles.enableText}>Enable notifications</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.dismissButton}
        onPress={dismiss}
        accessibilityRole="button"
        accessibilityLabel="Not now"
        testID="notification-priming-dismiss"
        activeOpacity={0.6}
      >
        <Text style={styles.dismissText}>Not now</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    padding: 16,
    marginBottom: 16,
  },
  heading: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 6,
  },
  body: {
    fontSize: 14,
    color: "#555",
    lineHeight: 20,
    marginBottom: 14,
  },
  enableButton: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  enableText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "600",
  },
  dismissButton: {
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  dismissText: {
    color: "#666",
    fontSize: 14,
    fontWeight: "500",
  },
});
