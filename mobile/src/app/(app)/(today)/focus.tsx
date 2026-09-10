import { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  BackHandler,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";

import { useFocusLock } from "@/hooks/useFocusLock";
import { useCompleteSession } from "@/services/hooks";
import {
  formatHourMinute,
  formatTimeRange,
  formatMinutes,
  focusCoachMessage,
  topicFromSession,
  nextSessionAfter,
  parseTimeToMinutes,
} from "@/lib/coaching";
import type { AdaptivePlanResponse, PlanChange } from "@/services/types";
import {
  AdaptiveTimelineBar,
  computeTimelineBounds,
} from "@/components/adaptive/AdaptiveTimelineBar";
import { AdaptiveSessionLegend } from "@/components/adaptive/AdaptiveSessionLegend";
import { AdaptiveChangeGroup } from "@/components/adaptive/AdaptiveChangeGroup";

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

function minutesBetween(start: string, end: string): number {
  return parseTimeToMinutes(end) - parseTimeToMinutes(start);
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

  // ─── Derived adaptive values (declared before any early returns) ───
  const changedSessionIds = useMemo(
    () => new Set(adaptiveResult?.changes?.map((c) => c.session_id) ?? []),
    [adaptiveResult?.changes],
  );

  const overflowIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of adaptiveResult?.changes ?? []) {
      if (c.change_type === "moved_to_overflow") {
        ids.add(c.backlog_item_id);
      }
    }
    return ids;
  }, [adaptiveResult?.changes]);

  const previousSessions = adaptiveResult?.previous_sessions ?? [];
  const currentSessions = adaptiveResult?.plan?.sessions ?? [];
  const { minStart, span } = useMemo(
    () => computeTimelineBounds(previousSessions, currentSessions),
    [previousSessions, currentSessions],
  );

  // ─── Completion / adaptive result screen ───
  if (phase === "complete" || adaptiveResult) {
    if (!adaptiveResult) {
      return (
        <SafeAreaView style={styles.container} edges={["bottom"]}>
          <View style={styles.center}>
            <Text style={styles.loadingText}>Saving your progress...</Text>
          </View>
        </SafeAreaView>
      );
    }

    const nextSession = nextSessionAfter(
      adaptiveResult.plan.sessions,
      params.sessionId,
      params.startTime,
    );

    const hasChanges = adaptiveResult.changes.length > 0;
    const focusedMinutes = Math.max(1, Math.ceil(focusedElapsedMs / 60000));

    const hasTimelines = previousSessions.length > 0 || currentSessions.length > 0;

    return (
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Celebration header ── */}
          <View style={styles.celebrationHeader}>
            <View style={styles.checkCircle}>
              <Text style={styles.checkIcon}>{"\u2713"}</Text>
            </View>
            <Text style={styles.celebrationTitle}>Nice work!</Text>
            <Text style={styles.celebrationSubtitle}>
              You finished a focused session.
            </Text>
          </View>

          {/* ── Session summary card ── */}
          <View style={styles.card}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryIconCircle}>
                <Text style={styles.summaryIconCheck}>{"\u2713"}</Text>
              </View>
              <View style={styles.summaryContent}>
                <Text style={styles.summaryTopic} numberOfLines={2}>
                  {topicFromSession({ reason: params.reason })}
                </Text>
                <Text style={styles.summaryTime}>
                  {formatTimeRange(params.startTime, params.endTime)}{" "}
                  {" \u00B7 "} {focusedMinutes} min
                </Text>
              </View>
            </View>
            {focusedMinutes > 0 && (
              <View style={styles.summaryRow}>
                <View style={styles.summaryIconCircle}>
                  <Text style={styles.summaryIconStar}>{"\u2726"}</Text>
                </View>
                <View style={styles.summaryContent}>
                  <Text style={styles.summaryMotivation}>
                    One less thing to worry about
                  </Text>
                  <Text style={styles.summaryMotivationSub}>
                    Future You will thank you.
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* ── Adaptation section ── */}
          {hasChanges ? (
            <View style={styles.adaptationSection}>
              <View style={styles.adaptationHeader}>
                <View style={styles.adaptationIconCircle}>
                  <Text style={styles.adaptationIconCheck}>{"\u2713"}</Text>
                </View>
                <Text style={styles.adaptationTitle}>
                  Momentum Adapted Your Plan
                </Text>
              </View>
              <Text style={styles.adaptationReason}>
                {adaptiveResult.changes[0].reason}
              </Text>

              {/* Before/After timelines */}
              {hasTimelines && (
                <View style={styles.timelineSection}>
                  {previousSessions.length > 0 && (
                    <View style={styles.timelineBlock}>
                      <Text style={styles.timelineLabel}>BEFORE</Text>
                      <AdaptiveTimelineBar
                        sessions={previousSessions}
                        changedSessionIds={changedSessionIds}
                        minStart={minStart}
                        span={span}
                      />
                      <AdaptiveSessionLegend
                        sessions={previousSessions}
                        changedSessionIds={changedSessionIds}
                      />
                    </View>
                  )}
                  {currentSessions.length > 0 && (
                    <View style={styles.timelineBlock}>
                      <Text style={styles.timelineLabel}>AFTER</Text>
                      <AdaptiveTimelineBar
                        sessions={currentSessions}
                        changedSessionIds={changedSessionIds}
                        minStart={minStart}
                        span={span}
                        overflowIds={overflowIds}
                      />
                      <AdaptiveSessionLegend
                        sessions={currentSessions}
                        changedSessionIds={changedSessionIds}
                        overflowIds={overflowIds}
                      />
                    </View>
                  )}
                </View>
              )}

              {/* Grouped change rows */}
              <AdaptiveChangeGroup changes={adaptiveResult.changes} />
            </View>
          ) : (
            <View style={styles.onTrackCard}>
              <View style={styles.onTrackRow}>
                <View style={styles.onTrackIconCircle}>
                  <Text style={styles.onTrackIconCheck}>{"\u2713"}</Text>
                </View>
                <Text style={styles.onTrackTitle}>Plan stays on track</Text>
              </View>
              <Text style={styles.onTrackText}>
                No adjustments needed. Everything is running smoothly.
              </Text>
            </View>
          )}

          {/* ── Next session card ── */}
          {nextSession ? (
            <View style={styles.nextSessionCard}>
              <Text style={styles.nextSessionLabel}>UP NEXT</Text>
              <Text style={styles.nextSessionTopic} numberOfLines={2}>
                {topicFromSession(nextSession)}
              </Text>
              <Text style={styles.nextSessionTime}>
                {formatTimeRange(nextSession.start_time, nextSession.end_time)}
                {" \u00B7 "}
                {formatMinutes(
                  minutesBetween(nextSession.start_time, nextSession.end_time),
                )}
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
                <Text style={styles.primaryButtonText}>
                  Start Next Session
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.caughtUpCard}>
              <Text style={styles.caughtUpTitle}>
                You&apos;re all caught up for today.
              </Text>
              <Text style={styles.caughtUpSubtitle}>
                Momentum will line up your next mission for tomorrow.
              </Text>
            </View>
          )}

          {/* ── Back to Today ── */}
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleBackToMission}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryButtonText}>
              Back to Today&apos;s Mission
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
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

  // ── Completion screen ──
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  celebrationHeader: {
    alignItems: "center",
    marginBottom: 20,
  },
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
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
  },

  // ── Cards ──
  card: {
    backgroundColor: "#1E293B",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  summaryIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  summaryIconCheck: {
    color: "#10B981",
    fontSize: 15,
    fontWeight: "700",
  },
  summaryIconStar: {
    color: "#2563EB",
    fontSize: 16,
  },
  summaryContent: {
    flex: 1,
  },
  summaryTopic: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  summaryTime: {
    color: "#94A3B8",
    fontSize: 13,
  },
  summaryMotivation: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "500",
  },
  summaryMotivationSub: {
    color: "#94A3B8",
    fontSize: 12,
  },

  // ── Adaptation section ──
  adaptationSection: {
    backgroundColor: "rgba(37, 99, 235, 0.06)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.15)",
    padding: 16,
    marginBottom: 16,
  },
  adaptationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  adaptationIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(37, 99, 235, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  adaptationIconCheck: {
    color: "#2563EB",
    fontSize: 12,
    fontWeight: "700",
  },
  adaptationTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "600",
  },
  adaptationReason: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 18,
    marginLeft: 30,
    marginBottom: 12,
  },

  // ── Timelines ──
  timelineSection: {
    gap: 12,
    marginBottom: 12,
  },
  timelineBlock: {},
  timelineLabel: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },

  // ── On-track card ──
  onTrackCard: {
    backgroundColor: "#1E293B",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  onTrackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  onTrackIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  onTrackIconCheck: {
    color: "#10B981",
    fontSize: 12,
    fontWeight: "700",
  },
  onTrackTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "600",
  },
  onTrackText: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 18,
  },

  // ── Next session ──
  nextSessionCard: {
    backgroundColor: "#1E293B",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: "#2563EB",
  },
  nextSessionLabel: {
    color: "#60A5FA",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  nextSessionTopic: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  nextSessionTime: {
    color: "#94A3B8",
    fontSize: 13,
    marginBottom: 14,
  },
  primaryButton: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "600",
  },

  // ── Caught up ──
  caughtUpCard: {
    backgroundColor: "#1E293B",
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#334155",
    padding: 20,
    alignItems: "center",
    marginBottom: 16,
  },
  caughtUpTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  caughtUpSubtitle: {
    color: "#94A3B8",
    fontSize: 13,
    textAlign: "center",
  },

  // ── Secondary button ──
  secondaryButton: {
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#64748B",
    fontSize: 15,
  },

  // ── Focus timer (unchanged) ──
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
});
