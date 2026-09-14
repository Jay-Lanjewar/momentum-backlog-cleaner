/**
 * TEMPORARY development-only Focus screen preview.
 *
 * This screen allows visual validation of the Focus UI without
 * requiring a real database session. It uses mock data and does NOT
 * call POST /planning/complete-session or affect any backend state.
 *
 * Only accessible when __DEV__ is true.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  BackHandler,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import Svg, { Circle } from "react-native-svg";
import * as Haptics from "expo-haptics";

import { useFocusLock } from "@/hooks/useFocusLock";
import { useAuth } from "@/hooks/useAuth";
import {
  formatHourMinute,
  focusCoachMessage,
} from "@/lib/coaching";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Generate a realistic future-looking start time (next :00 or :30) */
function mockStartTime(): string {
  const now = new Date();
  const mins = now.getMinutes();
  const nextMins = mins < 30 ? 30 : 0;
  const nextHour = nextMins === 0 ? now.getHours() + 1 : now.getHours();
  return `${String(nextHour % 24).padStart(2, "0")}:${String(nextMins).padStart(2, "0")}`;
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export default function FocusPreviewScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const userName = user?.name ?? "";

  const startTime = mockStartTime();
  const endTime = addMinutes(startTime, 25);
  const totalDurationMs = 25 * 60 * 1000;

  const { phase, focusedElapsedMs, remainingMs, pause, resume, complete } =
    useFocusLock(totalDurationMs);

  const [previewComplete, setPreviewComplete] = useState(false);
  const [animatedProgress] = useState(() => new Animated.Value(0));

  useKeepAwake("focus-preview");

  // Android back button handling
  useEffect(() => {
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (phase === "focusing" || phase === "paused_by_user" || phase === "paused_lost_focus" || phase === "focus_returned") {
        Alert.alert("Leave Preview?", "No data will be saved.", [
          { text: "Stay", style: "cancel" },
          {
            text: "Leave",
            onPress: () => {
              complete();
              router.back();
            },
          },
        ]);
        return true;
      }
      return false;
    });
    return () => handler.remove();
  }, [phase, complete, router]);

  const handlePreviewComplete = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    complete();
    setPreviewComplete(true);
  }, [complete]);

  const handleFinishEarly = useCallback(() => {
    Alert.alert("Finish Preview?", "No data will be recorded.", [
      { text: "Cancel", style: "cancel" },
      { text: "Finish", onPress: handlePreviewComplete },
    ]);
  }, [handlePreviewComplete]);

  const handlePause = useCallback(() => {
    Haptics.selectionAsync();
    pause();
  }, [pause]);

  const handleResume = useCallback(() => {
    Haptics.selectionAsync();
    resume();
  }, [resume]);

  // ─── Progress ring animation ───
  const progress =
    totalDurationMs > 0
      ? Math.min(focusedElapsedMs / totalDurationMs, 1)
      : 0;

  useEffect(() => {
    Animated.timing(animatedProgress, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const RING_RADIUS = 90;
  const RING_STROKE = 7;
  const RING_SIZE = 200;
  const circumference = 2 * Math.PI * RING_RADIUS;
  const strokeDashoffset = animatedProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  // Guard: only render preview in dev mode
  if (!__DEV__) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.timerLabel}>Preview only available in dev mode</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Preview complete screen ───
  if (previewComplete || phase === "complete") {
    const focusedMinutes = Math.max(1, Math.ceil(focusedElapsedMs / 60000));
    return (
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <View style={styles.previewCompleteContainer}>
          <View style={styles.checkCircle}>
            <Text style={styles.checkIcon}>{"\u2713"}</Text>
          </View>
          <Text style={styles.celebrationTitle}>Preview Complete</Text>
          <Text style={styles.celebrationSubtitle}>
            You focused for {focusedMinutes} min. No data was saved.
          </Text>

          <View style={styles.previewBadge}>
            <Text style={styles.previewBadgeText}>DEV MODE</Text>
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>Back to Today</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Focus timer screen ───
  return (
    <View style={styles.container}>
      {/* Dev mode banner */}
      <View style={styles.devBanner}>
        <Text style={styles.devBannerText}>FOCUS UI PREVIEW</Text>
      </View>

      {/* Session info */}
      <View style={styles.sessionInfo}>
        <Text style={styles.sessionReason} numberOfLines={2}>
          Work on Physics Ch. 5
        </Text>
        <Text style={styles.sessionTime}>
          {formatHourMinute(startTime)} – {formatHourMinute(endTime)}
        </Text>
        {userName && (phase === "focusing" || phase === "entering") && (
          <Text style={styles.sessionGreeting}>
            Let&apos;s finish this one, {userName}.
          </Text>
        )}
      </View>

      {/* Timer ring */}
      <View style={styles.timerContainer}>
        <View style={styles.timerRing}>
          <Svg
            width={RING_SIZE}
            height={RING_SIZE}
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            style={{ transform: [{ rotate: "-90deg" }] }}
          >
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke="#1E293B"
              strokeWidth={RING_STROKE}
              fill="none"
            />
            <AnimatedCircle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke="#3B82F6"
              strokeWidth={RING_STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
            />
          </Svg>
          <View style={styles.timerInner}>
            <Text style={styles.timerText}>
              {formatCountdown(remainingMs)}
            </Text>
            <Text style={styles.timerLabel}>
              {phase === "focusing"
                ? "Focusing"
                : phase === "paused_by_user"
                  ? "Paused"
                  : phase === "paused_lost_focus" || phase === "focus_returned"
                    ? "Away"
                    : ""}
            </Text>
          </View>
        </View>
      </View>

      {/* Status messages */}
      {phase === "paused_lost_focus" && (
        <View style={styles.statusBanner}>
          <Text style={styles.statusText}>
            You left the app. Timer is paused.
          </Text>
          <Text style={styles.statusFocused}>
            {formatCountdown(focusedElapsedMs)} focused
          </Text>
        </View>
      )}
      {phase === "focus_returned" && (
        <View style={[styles.statusBanner, styles.statusReturned]}>
          <Text style={styles.statusText}>
            Welcome back! Tap Resume to continue.
          </Text>
          <Text style={styles.statusFocused}>
            {formatCountdown(focusedElapsedMs)} focused
          </Text>
        </View>
      )}

      {/* Coaching message */}
      <Text style={styles.coachMessage}>
        {focusCoachMessage(focusedElapsedMs, totalDurationMs)}
      </Text>

      {/* Controls */}
      <View style={styles.controls}>
        {phase === "focusing" ? (
          <TouchableOpacity
            style={styles.controlButton}
            onPress={handlePause}
            activeOpacity={0.7}
          >
            <Text style={styles.controlButtonText}>Pause</Text>
          </TouchableOpacity>
        ) : phase === "paused_by_user" || phase === "focus_returned" ? (
          <TouchableOpacity
            style={[styles.controlButton, styles.controlButtonPrimary]}
            onPress={handleResume}
            activeOpacity={0.7}
          >
            <Text style={[styles.controlButtonText, styles.controlButtonTextPrimary]}>
              Resume
            </Text>
          </TouchableOpacity>
        ) : null}

        {(phase === "focusing" || phase === "paused_by_user") && (
          <TouchableOpacity
            style={styles.finishButton}
            onPress={handleFinishEarly}
            activeOpacity={0.7}
          >
            <Text style={styles.finishButtonText}>Finish Early</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  // ── Dev banner ──
  devBanner: {
    backgroundColor: "#F59E0B",
    paddingVertical: 6,
    alignItems: "center",
  },
  devBannerText: {
    color: "#000",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },

  // ── Session info ──
  sessionInfo: {
    alignItems: "center",
    paddingTop: 40,
    paddingHorizontal: 32,
    gap: 6,
  },
  sessionReason: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  sessionTime: {
    color: "#94A3B8",
    fontSize: 14,
  },
  sessionGreeting: {
    color: "#94A3B8",
    fontSize: 13,
    marginTop: 2,
    fontStyle: "italic",
    maxWidth: 280,
    textAlign: "center",
  },

  // ── Timer ──
  timerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  timerRing: {
    width: 200,
    height: 200,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  timerInner: {
    alignItems: "center",
  },
  timerText: {
    color: "#F8FAFC",
    fontSize: 44,
    fontWeight: "200",
    fontVariant: ["tabular-nums"],
  },
  timerLabel: {
    color: "#94A3B8",
    fontSize: 14,
    marginTop: 4,
  },

  // ── Status ──
  statusBanner: {
    backgroundColor: "#334155",
    marginHorizontal: 24,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  statusReturned: {
    backgroundColor: "#1E3A5F",
  },
  statusText: {
    color: "#CBD5E1",
    fontSize: 14,
  },
  statusFocused: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 4,
  },

  // ── Coaching ──
  coachMessage: {
    color: "#94A3B8",
    fontSize: 15,
    textAlign: "center",
    paddingHorizontal: 40,
    marginBottom: 20,
    lineHeight: 22,
  },

  // ── Controls ──
  controls: {
    paddingHorizontal: 32,
    paddingBottom: 40,
    gap: 12,
  },
  controlButton: {
    backgroundColor: "#334155",
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
  },
  controlButtonPrimary: {
    backgroundColor: "#2563EB",
  },
  controlButtonText: {
    color: "#F8FAFC",
    fontSize: 17,
    fontWeight: "600",
  },
  controlButtonTextPrimary: {
    color: "#FFF",
  },
  finishButton: {
    paddingVertical: 14,
    alignItems: "center",
  },
  finishButtonText: {
    color: "#64748B",
    fontSize: 15,
  },

  // ── Preview complete ──
  previewCompleteContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkIcon: {
    color: "#10B981",
    fontSize: 32,
    fontWeight: "300",
  },
  celebrationTitle: {
    color: "#F8FAFC",
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 4,
  },
  celebrationSubtitle: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
  },
  previewBadge: {
    backgroundColor: "#F59E0B",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 8,
  },
  previewBadgeText: {
    color: "#000",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  primaryButton: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: "center",
    marginTop: 16,
  },
  primaryButtonText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "600",
  },
});
