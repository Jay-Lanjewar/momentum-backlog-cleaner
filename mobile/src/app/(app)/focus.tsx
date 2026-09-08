import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  BackHandler,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";

import { useFocusLock } from "@/hooks/useFocusLock";
import { useCompleteSession } from "@/services/hooks";
import {
  formatHourMinute,
  formatTimeRange,
  focusCoachMessage,
  topicFromSession,
  nextSessionAfter,
} from "@/lib/coaching";
import type { AdaptivePlanResponse } from "@/services/types";

function parseDurationMs(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) * 60 * 1000;
}

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function FocusModeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    sessionId: string;
    backlogItemId: string;
    startTime: string;
    endTime: string;
    reason: string;
    remainingMinutes: string;
    sessions: string;
    snapshotId: string;
    dailyMessage: string;
  }>();

  const totalDurationMs = parseDurationMs(params.startTime, params.endTime);
  const { phase, focusedElapsedMs, remainingMs, pause, resume, complete } =
    useFocusLock(totalDurationMs);

  const completeSession = useCompleteSession();
  const [adaptiveResult, setAdaptiveResult] =
    useState<AdaptivePlanResponse | null>(null);

  useKeepAwake("focus-session");

  // Auto-complete when timer reaches zero
  useEffect(() => {
    if (phase === "focusing" && remainingMs <= 0) {
      handleComplete();
    }
  }, [phase, remainingMs]);

  // Android back button handling
  useEffect(() => {
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (phase === "focusing" || phase === "paused_by_user" || phase === "paused_lost_focus" || phase === "focus_returned") {
        Alert.alert("Leave Focus Session?", "Your progress will be saved.", [
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

  const handleComplete = useCallback(() => {
    complete();
    const actualMinutes = Math.max(
      1,
      Math.ceil(focusedElapsedMs / 60000),
    );
    completeSession.mutate(
      {
        session_id: params.sessionId,
        actual_minutes: actualMinutes,
      },
      {
        onSuccess: (data) => {
          setAdaptiveResult(data);
        },
        onError: (error) => {
          Alert.alert("Error", error.message);
        },
      },
    );
  }, [complete, focusedElapsedMs, params.sessionId, completeSession]);

  const handleFinishEarly = useCallback(() => {
    Alert.alert("Finish Early?", "Your focused time will be recorded.", [
      { text: "Cancel", style: "cancel" },
      { text: "Finish", onPress: handleComplete },
    ]);
  }, [handleComplete]);

  const handleBackToMission = useCallback(() => {
    router.replace("/(app)");
  }, [router]);

  // ─── Completion screen ───
  if (phase === "complete" || adaptiveResult) {
    if (!adaptiveResult) {
      return (
        <View style={styles.container}>
          <View style={styles.center}>
            <Text style={styles.loadingText}>Saving your progress...</Text>
          </View>
        </View>
      );
    }

    const nextSession = nextSessionAfter(
      adaptiveResult.plan.sessions,
      params.sessionId,
      params.startTime,
    );

    return (
      <View style={styles.container}>
        <View style={styles.completionContent}>
          <Text style={styles.completionEmoji}>✅</Text>
          <Text style={styles.completionTitle}>Session Complete!</Text>
          <Text style={styles.completionMinutes}>
            {Math.max(1, Math.ceil(focusedElapsedMs / 60000))} minutes focused
          </Text>

          {/* Session summary */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle} numberOfLines={2}>
              {topicFromSession({ reason: params.reason })}
            </Text>
            <Text style={styles.summaryTime}>
              {formatTimeRange(params.startTime, params.endTime)}
            </Text>
          </View>

          {/* Adaptive plan section */}
          <View style={styles.adaptiveSection}>
            <Text style={styles.adaptiveHeader}>
              {adaptiveResult.changes.length > 0
                ? "PLAN UPDATED"
                : "PLAN ON TRACK"}
            </Text>
            {adaptiveResult.changes.length > 0 ? (
              adaptiveResult.changes.map((change) => (
                <View key={change.session_id} style={styles.changeItem}>
                  <Text style={styles.changeType}>
                    {change.change_type.replace(/_/g, " ").toUpperCase()}
                  </Text>
                  <Text style={styles.changeTitle}>{change.title}</Text>
                  <Text style={styles.changeReason}>{change.reason}</Text>
                </View>
              ))
            ) : (
              <View style={styles.changeItem}>
                <Text style={styles.changeReason}>
                  Your plan is on track — no adjustments needed.
                </Text>
              </View>
            )}
          </View>

          {/* Next session */}
          {nextSession ? (
            <View style={styles.nextSessionCard}>
              <Text style={styles.nextSessionHeader}>UP NEXT</Text>
              <Text style={styles.nextSessionTitle} numberOfLines={2}>
                {topicFromSession(nextSession)}
              </Text>
              <Text style={styles.nextSessionTime}>
                {formatTimeRange(nextSession.start_time, nextSession.end_time)}
              </Text>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() =>
                  router.push({
                    pathname: "/(app)/focus",
                    params: {
                      sessionId: nextSession.session_id,
                      backlogItemId: nextSession.backlog_item_id,
                      startTime: nextSession.start_time,
                      endTime: nextSession.end_time,
                      reason: nextSession.reason,
                      remainingMinutes: String(nextSession.remaining_minutes),
                      sessions: JSON.stringify(adaptiveResult.plan.sessions),
                      snapshotId: adaptiveResult.snapshot_id,
                      dailyMessage: adaptiveResult.plan.daily_message,
                    },
                  })
                }
                activeOpacity={0.8}
              >
                <Text style={styles.primaryButtonText}>Start Next Session</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.nextSessionCard}>
              <Text style={styles.nextSessionTitle}>
                You&apos;re all caught up for today.
              </Text>
              <Text style={styles.nextSessionTime}>
                Momentum will line up your next mission for tomorrow.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleBackToMission}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryButtonText}>
              Back to Today&apos;s Mission
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Focus timer screen ───
  const progress =
    totalDurationMs > 0
      ? Math.min(focusedElapsedMs / totalDurationMs, 1)
      : 0;
  const circumference = 2 * Math.PI * 120;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <View style={styles.container}>
      {/* Session info */}
      <View style={styles.sessionInfo}>
        <Text style={styles.sessionReason} numberOfLines={2}>
          {params.reason}
        </Text>
        <Text style={styles.sessionTime}>
          {formatHourMinute(params.startTime)} – {formatHourMinute(params.endTime)}
        </Text>
      </View>

      {/* Timer ring */}
      <View style={styles.timerContainer}>
        <View style={styles.timerRing}>
          {/* Background circle */}
          <View style={[styles.circle, styles.circleBg]} />
          {/* Progress indicator via border */}
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

      {/* Focus status messages */}
      {phase === "paused_lost_focus" && (
        <View style={styles.statusBanner}>
          <Text style={styles.statusText}>
            You left the app. Timer is paused.
          </Text>
        </View>
      )}
      {phase === "focus_returned" && (
        <View style={[styles.statusBanner, styles.statusReturned]}>
          <Text style={styles.statusText}>
            Welcome back! Tap Resume to continue.
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
            onPress={pause}
            activeOpacity={0.7}
          >
            <Text style={styles.controlButtonText}>Pause</Text>
          </TouchableOpacity>
        ) : phase === "paused_by_user" || phase === "focus_returned" ? (
          <TouchableOpacity
            style={[styles.controlButton, styles.controlButtonPrimary]}
            onPress={resume}
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
  loadingText: {
    color: "#94A3B8",
    fontSize: 16,
  },
  sessionInfo: {
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  sessionReason: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
  },
  sessionTime: {
    color: "#94A3B8",
    fontSize: 14,
  },
  timerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  timerRing: {
    width: 260,
    height: 260,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  circle: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 6,
  },
  circleBg: {
    borderColor: "#1E293B",
  },
  timerInner: {
    alignItems: "center",
  },
  timerText: {
    color: "#F8FAFC",
    fontSize: 56,
    fontWeight: "200",
    fontVariant: ["tabular-nums"],
  },
  timerLabel: {
    color: "#94A3B8",
    fontSize: 14,
    marginTop: 4,
  },
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
  coachMessage: {
    color: "#94A3B8",
    fontSize: 15,
    textAlign: "center",
    paddingHorizontal: 40,
    marginBottom: 32,
    lineHeight: 22,
  },
  controls: {
    paddingHorizontal: 32,
    paddingBottom: 60,
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
  completionContent: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  completionEmoji: {
    fontSize: 48,
    textAlign: "center",
    marginBottom: 12,
  },
  completionTitle: {
    color: "#F8FAFC",
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
  },
  completionMinutes: {
    color: "#94A3B8",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 24,
  },
  summaryCard: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  summaryTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  summaryTime: {
    color: "#94A3B8",
    fontSize: 13,
  },
  adaptiveSection: {
    marginBottom: 20,
  },
  adaptiveHeader: {
    color: "#60A5FA",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  changeItem: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  changeType: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 4,
  },
  changeTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  changeReason: {
    color: "#CBD5E1",
    fontSize: 13,
    lineHeight: 18,
  },
  nextSessionCard: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  nextSessionHeader: {
    color: "#60A5FA",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  nextSessionTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  nextSessionTime: {
    color: "#94A3B8",
    fontSize: 13,
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: "#2563EB",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#64748B",
    fontSize: 15,
  },
});
