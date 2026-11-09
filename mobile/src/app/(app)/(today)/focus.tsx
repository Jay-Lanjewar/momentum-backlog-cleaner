import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  BackHandler,
  Animated,
  AppState,
  type AppStateStatus,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import Svg, { Circle } from "react-native-svg";
import * as Haptics from "expo-haptics";

import { useFocusLock } from "@/hooks/useFocusLock";
import {
  useCompleteSession,
  useDashboard,
  useFocusSessionLifecycle,
  useStudyBuddyChat,
} from "@/services/hooks";
import type {
  AdaptivePlanResponse,
  FocusSessionAction,
  StudyBuddyMessage,
} from "@/services/types";
import {
  cancelSessionNotifications,
  showPlanChangedNotification,
} from "@/services/notifications";
import {
  formatHourMinute,
  formatTimeRange,
  formatMinutes,
  focusCoachMessage,
  topicFromSession,
  nextSessionAfter,
  parseTimeToMinutes,
} from "@/lib/coaching";
import {
  AdaptiveTimelineBar,
  computeTimelineBounds,
} from "@/components/adaptive/AdaptiveTimelineBar";
import { AdaptiveSessionLegend } from "@/components/adaptive/AdaptiveSessionLegend";
import { AdaptiveChangeGroup } from "@/components/adaptive/AdaptiveChangeGroup";
import { StudyBuddyPanel } from "@/components/focus/StudyBuddyPanel";
import { FocusShieldChallenge } from "@/components/focus/FocusShieldChallenge";
import { useTheme } from "@/theme/ThemeProvider";
import { useAuthStore } from "@/store/useAuthStore";
import { clearFocusSession, loadFocusSession } from "@/focus/focusSessionPersistence";

function parseDurationMs(start: string | undefined, end: string | undefined): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 0;
  return (eh * 60 + em - (sh * 60 + sm)) * 60 * 1000;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function minutesBetween(start: string, end: string): number {
  return parseTimeToMinutes(end) - parseTimeToMinutes(start);
}

function createFocusGeneration(): string {
  const random = () => Math.random().toString(36).slice(2).padEnd(12, "0");
  return `${Date.now().toString(36)}-${random()}-${random()}`.slice(0, 64);
}

export default function FocusModeScreen() {
  const { colors } = useTheme();
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
    userName: string;
    taskTitle: string;
    courseName: string;
    className: string;
    boardName: string;
  }>();

  const hasDirectSession = Boolean(
    params.sessionId && params.startTime && params.endTime && params.reason,
  );
  const { data: dashboard, isLoading: dashboardLoading } = useDashboard({
    enabled: !hasDirectSession || !params.snapshotId,
    refetchOnMount: "always",
    staleTime: 0,
  });

  // Resolve session data when opened via notification deep link
  // (notification provides sessionId/backlogItemId but not full params)
  const resolvedSession = useMemo(() => {
    if (params.startTime && params.endTime && params.reason) {
      return null; // All params present, no resolution needed
    }
    if (!dashboard || !params.sessionId) return null;

    const sessions = dashboard.plan.plan.sessions;
    return sessions.find((s) => s.session_id === params.sessionId) ?? null;
  }, [params, dashboard]);

  const startTime = params.startTime ?? resolvedSession?.start_time ?? "";
  const endTime = params.endTime ?? resolvedSession?.end_time ?? "";
  const reason = params.reason ?? resolvedSession?.reason ?? "";
  const sessionId = params.sessionId ?? resolvedSession?.session_id ?? "";
  const snapshotId = params.snapshotId || dashboard?.plan.snapshot_id || "";
  const userName = params.userName ?? "";
  const authUserId = useAuthStore((state) => state.user?.id ?? "");
  const profile = useAuthStore((state) => state.user?.profile ?? null);
  const activeTask = dashboard?.planning?.prioritized_backlog?.find((item) => item.id === params.backlogItemId);
  const taskTitle = params.taskTitle || activeTask?.title || reason;
  const courseName = params.courseName || activeTask?.course_name || "";
  const className = params.className || profile?.class_name || dashboard?.profile?.class_name || null;
  const boardName = params.boardName || profile?.board || dashboard?.profile?.board || null;

  // Redirect back if we can't identify the session at all
  const isMissingSession =
    !sessionId ||
    (!resolvedSession && !params.startTime) ||
    (!snapshotId && !dashboardLoading);

  const totalDurationMs = parseDurationMs(startTime, endTime);
  const identityReady = Boolean(
    sessionId && snapshotId && startTime && endTime && reason,
  );
  const recoveredFocusSession = useMemo(
    () => identityReady && authUserId
      ? loadFocusSession(authUserId, sessionId, snapshotId, totalDurationMs)
      : null,
    [authUserId, identityReady, sessionId, snapshotId, totalDurationMs],
  );
  const generation = useMemo(
    () => recoveredFocusSession?.generation ?? createFocusGeneration(),
    [recoveredFocusSession?.generation],
  );
  const durableFocusRecovery = useMemo(() => identityReady && authUserId
    ? {
      identity: { userId: authUserId, sessionId, snapshotId, generation },
      record: recoveredFocusSession,
    }
    : undefined,
  [authUserId, generation, identityReady, recoveredFocusSession, sessionId, snapshotId]);
  const { phase, focusedElapsedMs, remainingMs, pause, pauseForChallenge, resume, markCompletionPending, complete, recovered, persistenceError: focusPersistenceError, completionMinutes } =
    useFocusLock(totalDurationMs, identityReady, durableFocusRecovery);

  const completeSession = useCompleteSession();
  const studyBuddy = useStudyBuddyChat();
  const focusLifecycle = useFocusSessionLifecycle();
  const mutateFocusLifecycle = focusLifecycle.mutateAsync;
  const lifecycleQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const leaseStartedRef = useRef(Boolean(recoveredFocusSession));
  const leaseAcceptedRef = useRef(false);
  const recoveredLeaseValidatedRef = useRef(!recoveredFocusSession);
  const recoveryRequiredRef = useRef(Boolean(recoveredFocusSession));
  const completionSavedRef = useRef(false);
  const [leaseReady, setLeaseReady] = useState(false);
  const [focusLeaseError, setFocusLeaseError] = useState<string | null>(null);
  const [appState, setAppState] = useState<AppStateStatus | null>(AppState.currentState);
  const [adaptiveResult, setAdaptiveResult] =
    useState<AdaptivePlanResponse | null>(null);
  const [completedMinutes, setCompletedMinutes] = useState<number | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [studyBuddyOpen, setStudyBuddyOpen] = useState(false);
  const [focusShieldOpen, setFocusShieldOpen] = useState(false);
  const focusShieldPausedSession = useRef(false);
  const [studyBuddyMessages, setStudyBuddyMessages] = useState<StudyBuddyMessage[]>([]);
  const [studyBuddyDraft, setStudyBuddyDraft] = useState("");
  const [studyBuddyError, setStudyBuddyError] = useState<string | null>(null);
  const studyBuddySendingRef = useRef(false);
  const completingRef = useRef(false);
  const [animatedProgress] = useState(() => new Animated.Value(0));

  const sendLifecycle = useCallback(
    (action: FocusSessionAction) => {
      const operation = lifecycleQueueRef.current.then(() =>
        mutateFocusLifecycle({
          action,
          session_id: sessionId,
          snapshot_id: snapshotId,
          generation,
        }),
      );
      lifecycleQueueRef.current = operation.catch(() => undefined);
      return operation;
    },
    [generation, mutateFocusLifecycle, sessionId, snapshotId],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (state: AppStateStatus) => setAppState(state),
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!identityReady || isMissingSession || focusLeaseError || adaptiveResult) {
      return;
    }
    if (phase === "focusing") {
      if (leaseReady) return;
      const action: FocusSessionAction = leaseStartedRef.current ? "resume" : "start";
      leaseStartedRef.current = true;
      let cancelled = false;
      sendLifecycle(action).then(
        () => {
          if (!cancelled) {
            leaseAcceptedRef.current = true;
            recoveryRequiredRef.current = false;
            setLeaseReady(true);
          }
        },
        (error: Error) => {
          if (cancelled) return;
          leaseAcceptedRef.current = false;
          recoveryRequiredRef.current = true;
          setLeaseReady(false);
          setFocusLeaseError(error?.message || "This session is no longer available.");
          pause();
        },
      );
      return () => {
        cancelled = true;
      };
    }
    if (
      leaseStartedRef.current &&
      recoveredLeaseValidatedRef.current &&
      (phase === "paused_by_user" ||
        phase === "paused_lost_focus" ||
        phase === "focus_returned")
    ) {
      setLeaseReady(false);
      void sendLifecycle("pause").catch(() => {
        // The lease expires server-side even if the app is backgrounded offline.
      });
    }
  }, [
    adaptiveResult,
    focusLeaseError,
    identityReady,
    isMissingSession,
    leaseReady,
    pause,
    phase,
    sendLifecycle,
  ]);

  useEffect(() => {
    if (
      phase !== "focusing" ||
      appState !== "active" ||
      !leaseReady ||
      focusLeaseError
    ) {
      return;
    }
    let cancelled = false;
    let inFlight = false;
    const interval = setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      void sendLifecycle("heartbeat").then(
        () => {
          inFlight = false;
        },
        (error: Error) => {
          inFlight = false;
          if (cancelled) return;
          setLeaseReady(false);
          leaseAcceptedRef.current = false;
          recoveryRequiredRef.current = true;
          setFocusLeaseError(error?.message || "This session is no longer available.");
          pause();
        },
      );
    }, 25_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [appState, focusLeaseError, leaseReady, pause, phase, sendLifecycle]);

  const cancelAndLeave = useCallback(() => {
    if (phase === "focusing") pause();
    router.back();
  }, [pause, phase, router]);

  const sendStudyBuddyQuestion = useCallback(async () => {
    const question = studyBuddyDraft.trim();
    if (!question || !sessionId || studyBuddySendingRef.current) return;

    studyBuddySendingRef.current = true;
    setStudyBuddyError(null);
    const history = studyBuddyMessages.slice(-12).map(({ role, content }) => ({
      role,
      content,
    }));
    try {
      const result = await studyBuddy.mutateAsync({
        session_id: sessionId,
        question,
        history,
      });
      setStudyBuddyMessages((current) => [
        ...current,
        { role: "user", content: question },
        { role: "assistant", content: result.answer },
      ]);
      setStudyBuddyDraft((current) => current.trim() === question ? "" : current);
    } catch (error) {
      setStudyBuddyError(
        error instanceof Error
          ? error.message
          : "Study Buddy couldn't answer just now. Please try again.",
      );
    } finally {
      studyBuddySendingRef.current = false;
    }
  }, [sessionId, studyBuddy, studyBuddyDraft, studyBuddyMessages]);

  useKeepAwake("focus-session");

  const ensureLeaseRunning = useCallback(async (): Promise<"running" | "completed"> => {
    if (recoveryRequiredRef.current) {
      const recoveryResult = await sendLifecycle("recover");
      if (recoveryResult.state === "completed") {
        recoveryRequiredRef.current = false;
        recoveredLeaseValidatedRef.current = true;
        return "completed";
      }
      if (recoveryResult.state !== "paused") throw new Error("This Focus session cannot be recovered.");
      leaseStartedRef.current = true;
      recoveredLeaseValidatedRef.current = true;
      const resumed = await sendLifecycle("resume");
      if (resumed.state !== "running") throw new Error("This Focus session could not be resumed.");
    } else {
      const action: FocusSessionAction = leaseStartedRef.current ? "resume" : "start";
      const result = await sendLifecycle(action);
      if (result.state !== "running") throw new Error("This Focus session is no longer available.");
    }
    leaseStartedRef.current = true;
    leaseAcceptedRef.current = true;
    recoveryRequiredRef.current = false;
    recoveredLeaseValidatedRef.current = true;
    return "running";
  }, [sendLifecycle]);

  const handleComplete = useCallback(() => {
    if (completingRef.current || completeSession.isPending) return;
    completingRef.current = true;
    setCompletionError(null);
    // The backend validates reported minutes against the planned duration.
    // A delayed JS timer tick must not round an automatic completion above it.
    const actualMinutes = completionMinutes ?? Math.max(
      1,
      Math.ceil(Math.min(focusedElapsedMs, totalDurationMs) / 60000),
    );
    markCompletionPending(actualMinutes);
    void lifecycleQueueRef.current.then(() => {
      const validateLease = leaseAcceptedRef.current
        ? Promise.resolve("running" as const)
        : ensureLeaseRunning();
      void validateLease.then(() => completeSession.mutate(
        {
          session_id: sessionId,
          actual_minutes: actualMinutes,
          focus_generation: generation,
        },
        {
          onSuccess: (data) => {
            completionSavedRef.current = true;
            leaseAcceptedRef.current = false;
            setLeaseReady(false);
            setCompletedMinutes(actualMinutes);
            // Local "complete" only after the API succeeds
            complete();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setAdaptiveResult(data);
            cancelSessionNotifications(sessionId);
            if (data.changes.length > 0) {
              showPlanChangedNotification(data.changes);
            }
          },
          onError: (error) => {
            completingRef.current = false;
            leaseAcceptedRef.current = false;
            recoveryRequiredRef.current = true;
            setLeaseReady(false);
            setCompletionError(
              error?.message ||
                "Could not save your progress. Please try again.",
            );
            pause();
          },
        },
      )).catch((error: Error) => {
        completingRef.current = false;
        recoveryRequiredRef.current = true;
        setCompletionError(error.message || "This session is no longer available.");
      });
    });
  }, [complete, ensureLeaseRunning, generation, markCompletionPending, pause, focusedElapsedMs, totalDurationMs, sessionId, completeSession, completionMinutes]);

  // Auto-complete when timer reaches zero (skip if already saving or failed)
  useEffect(() => {
    if (
      phase === "focusing" &&
      leaseReady &&
      remainingMs <= 0 &&
      !completionError &&
      !completeSession.isPending
    ) {
      handleComplete();
    }
  }, [
    phase,
    remainingMs,
    completionError,
    completeSession.isPending,
    handleComplete,
    leaseReady,
  ]);

  // Android back button handling
  useEffect(() => {
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (studyBuddyOpen) {
        setStudyBuddyOpen(false);
        return true;
      }
      if (phase === "focusing" || phase === "paused_by_user" || phase === "paused_lost_focus" || phase === "focus_returned" || phase === "recovery_pending" || phase === "completion_pending") {
        Alert.alert(
          "Leave Focus Session?",
          "Your focused time is saved on this device. You can return to this session later to recover or finish syncing it.",
          [
            { text: "Stay", style: "cancel" },
            {
              text: "Leave",
              style: "destructive",
              onPress: () => void cancelAndLeave(),
            },
          ],
        );
        return true;
      }
      return false;
    });
    return () => handler.remove();
  }, [cancelAndLeave, phase, studyBuddyOpen]);

  const handleFinishEarly = useCallback(() => {
    Alert.alert("Finish Early?", "Your focused time will be recorded.", [
      { text: "Cancel", style: "cancel" },
      { text: "Finish", onPress: handleComplete },
    ]);
  }, [handleComplete]);

  const handlePause = useCallback(() => {
    Haptics.selectionAsync();
    pause();
  }, [pause]);

  const handleResume = useCallback(async () => {
    Haptics.selectionAsync();
    try {
      const state = await ensureLeaseRunning();
      if (state === "completed") {
        const minutes = completionMinutes ?? Math.max(1, Math.ceil(Math.min(focusedElapsedMs, totalDurationMs) / 60000));
        markCompletionPending(minutes);
        recoveryRequiredRef.current = true;
        handleComplete();
        return;
      }
      setFocusLeaseError(null);
      setLeaseReady(true);
      resume();
    } catch (error) {
      recoveryRequiredRef.current = true;
      setFocusLeaseError(error instanceof Error ? error.message : "This session is no longer available.");
    }
  }, [completionMinutes, ensureLeaseRunning, focusedElapsedMs, handleComplete, markCompletionPending, resume, totalDurationMs]);

  const handleBackToMission = useCallback(() => {
    router.replace("/(app)");
  }, [router]);

  const discardAndBackToMission = useCallback(() => {
    clearFocusSession(authUserId, sessionId);
    if (leaseStartedRef.current && !completionSavedRef.current) {
      leaseAcceptedRef.current = false;
      void sendLifecycle("cancel").catch(() => undefined);
    }
    router.replace("/(app)");
  }, [authUserId, router, sendLifecycle, sessionId]);

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

  // ─── Progress ring animation (must be before early returns) ───
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

  // ─── Session not found (notification deep link) ───
  if (!identityReady && dashboardLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <Text style={[styles.loadingText, { color: colors.mutedText }]}>Loading your session...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isMissingSession) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <Text style={{ color: colors.secondaryText, fontSize: 16 }}>
            Session not found. Return to Today.
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.accent }]}
            onPress={() => router.replace("/(app)")}
          >
            <Text style={[styles.primaryButtonText, { color: colors.accentForeground }]}>Back to Today</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (focusLeaseError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <Text style={[styles.errorTitle, { color: colors.primaryText }]}>Focus session paused</Text>
          <Text style={[styles.errorBody, { color: colors.error }]}>{focusLeaseError}</Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.accent }]}
            onPress={() => void handleResume()}
          >
            <Text style={[styles.primaryButtonText, { color: colors.accentForeground }]}>Retry recovery</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: colors.border }]}
            onPress={handleBackToMission}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.mutedText }]}>Return to Today with session saved</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Completion error (recoverable) ───
  if (completionError && !adaptiveResult) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["bottom"]}>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorTitle, { color: colors.primaryText }]}>Couldn&apos;t save your session</Text>
          <Text style={[styles.errorBody, { color: colors.error }]}>{completionError}</Text>
          <Text style={[styles.errorHint, { color: colors.mutedText }]}>
            Your focused time was not recorded yet.
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, styles.errorPrimaryButton, { backgroundColor: colors.accent }]}
            onPress={handleComplete}
            disabled={completeSession.isPending}
            activeOpacity={0.8}
          >
            <Text style={[styles.primaryButtonText, { color: colors.accentForeground }]}>
              {completeSession.isPending ? "Saving..." : "Try Again"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.errorLeaveButton}
            onPress={discardAndBackToMission}
            activeOpacity={0.8}
          >
            <Text style={[styles.errorLeaveText, { color: colors.mutedText }]}>Leave without saving</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Saving in progress (API pending, or legacy phase without result) ───
  if (
    !adaptiveResult &&
    (completeSession.isPending || phase === "complete")
  ) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["bottom"]}>
        <View style={styles.center}>
          <Text style={[styles.loadingText, { color: colors.mutedText }]}>Saving your progress...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Completion / adaptive result screen ───
  if (phase === "complete" || adaptiveResult) {
    if (!adaptiveResult) {
      return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["bottom"]}>
          <View style={styles.center}>
            <Text style={[styles.loadingText, { color: colors.mutedText }]}>Saving your progress...</Text>
          </View>
        </SafeAreaView>
      );
    }

    const nextSession = nextSessionAfter(
      adaptiveResult.plan.sessions,
      sessionId,
      startTime,
    );

    const hasChanges = adaptiveResult.changes.length > 0;
    const focusedMinutes =
      completedMinutes ?? Math.max(1, Math.ceil(focusedElapsedMs / 60000));

    const hasTimelines = previousSessions.length > 0 || currentSessions.length > 0;

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["bottom"]}>
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
            <Text style={[styles.celebrationTitle, { color: colors.primaryText }]}>Nice work!</Text>
            <Text style={[styles.celebrationSubtitle, { color: colors.mutedText }]}>
              You finished a focused session.
            </Text>
          </View>

          {/* ── Session summary card ── */}
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryIconCircle}>
                <Text style={styles.summaryIconCheck}>{"\u2713"}</Text>
              </View>
              <View style={styles.summaryContent}>
                <Text style={[styles.summaryTopic, { color: colors.primaryText }]} numberOfLines={2}>
                  {topicFromSession({ reason })}
                </Text>
                <Text style={[styles.summaryTime, { color: colors.mutedText }]}>
                  {formatTimeRange(startTime, endTime)}{" "}
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
                  <Text style={[styles.summaryMotivation, { color: colors.primaryText }]}>
                    One less thing to worry about
                  </Text>
                  <Text style={[styles.summaryMotivationSub, { color: colors.mutedText }]}>
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
            <View style={[styles.onTrackCard, { backgroundColor: colors.card }]}>
              <View style={styles.onTrackRow}>
                <View style={styles.onTrackIconCircle}>
                  <Text style={styles.onTrackIconCheck}>{"\u2713"}</Text>
                </View>
                <Text style={[styles.onTrackTitle, { color: colors.primaryText }]}>Plan stays on track</Text>
              </View>
              <Text style={[styles.onTrackText, { color: colors.mutedText }]}>
                No adjustments needed. Everything is running smoothly.
              </Text>
            </View>
          )}

          {/* ── Next session card ── */}
          {nextSession ? (
            <View style={[styles.nextSessionCard, { backgroundColor: colors.card, borderLeftColor: colors.accent }]}>
              <Text style={[styles.nextSessionLabel, { color: colors.accentText }]}>UP NEXT</Text>
              <Text style={[styles.nextSessionTopic, { color: colors.primaryText }]} numberOfLines={2}>
                {topicFromSession(nextSession)}
              </Text>
              <Text style={[styles.nextSessionTime, { color: colors.mutedText }]}>
                {formatTimeRange(nextSession.start_time, nextSession.end_time)}
                {" \u00B7 "}
                {formatMinutes(
                  minutesBetween(nextSession.start_time, nextSession.end_time),
                )}
              </Text>
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.accent }]}
                onPress={() =>
                  router.push({
                    pathname: "/(app)/(today)/focus",
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
                      userName,
                    },
                  })
                }
                activeOpacity={0.8}
              >
                <Text style={[styles.primaryButtonText, { color: colors.accentForeground }]}>
                  Start Next Session
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.caughtUpCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.caughtUpTitle, { color: colors.primaryText }]}>
                You&apos;re all caught up for today.
              </Text>
              <Text style={[styles.caughtUpSubtitle, { color: colors.mutedText }]}>
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
            <Text style={[styles.secondaryButtonText, { color: colors.mutedText }]}>
              Back to Today&apos;s Mission
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Focus timer screen ───
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Session info — fixed at top */}
      <View style={styles.sessionInfo}>
        <Text style={[styles.sessionReason, { color: colors.primaryText }]} numberOfLines={2}>
          {reason}
        </Text>
        <Text style={[styles.sessionTime, { color: colors.mutedText }]}>
          {formatHourMinute(startTime)} – {formatHourMinute(endTime)}
        </Text>
        {userName && (phase === "focusing" || phase === "entering") && (
          <Text style={[styles.sessionGreeting, { color: colors.mutedText }]}>
            Let&apos;s finish this one, {userName}.
          </Text>
        )}
      </View>

      {/* Keep the timer mounted beneath the Study Buddy conversation. */}
      <View style={styles.timerContainer}>
        <View style={styles.timerRing}>
          <Svg
            width={RING_SIZE}
            height={RING_SIZE}
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            style={{ transform: [{ rotate: "-90deg" }] }}
          >
            {/* Track */}
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={colors.border}
              strokeWidth={RING_STROKE}
              fill="none"
            />
            {/* Progress */}
            <AnimatedCircle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={colors.accent}
              strokeWidth={RING_STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
            />
          </Svg>
          <View style={styles.timerInner}>
            <Text style={[styles.timerText, { color: colors.primaryText }]}>
              {formatCountdown(remainingMs)}
            </Text>
            <Text style={[styles.timerLabel, { color: colors.mutedText }]}>
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

      {identityReady && !!sessionId && (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => setStudyBuddyOpen(true)}
          style={styles.studyBuddyEntry}
          activeOpacity={0.8}
        >
          <Text style={styles.studyBuddyEntryText}>Ask Study Buddy</Text>
        </TouchableOpacity>
      )}

      {identityReady && !!(params.backlogItemId || resolvedSession?.backlog_item_id) && (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Try a Focus Shield knowledge challenge"
          onPress={() => {
            focusShieldPausedSession.current = phase === "focusing";
            if (focusShieldPausedSession.current) pauseForChallenge();
            setFocusShieldOpen(true);
          }}
          style={[styles.shieldEntry, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}
          activeOpacity={0.8}
        >
          <Text style={[styles.shieldEntryText, { color: colors.accentSoftForeground }]}>Try a Focus Shield challenge</Text>
        </TouchableOpacity>
      )}

      {/* Focus status messages */}
      {phase === "paused_lost_focus" && (
        <View style={[styles.statusBanner, { backgroundColor: colors.pressed }]}>
          <Text style={[styles.statusText, { color: colors.secondaryText }]}>
            You left the app. Timer is paused.
          </Text>
          <Text style={[styles.statusFocused, { color: colors.mutedText }]}>
            {formatCountdown(focusedElapsedMs)} focused
          </Text>
        </View>
      )}
      {recovered && phase === "paused_by_user" && (
        <View style={[styles.statusBanner, { backgroundColor: colors.pressed }]}>
          <Text style={[styles.statusText, { color: colors.secondaryText }]}>Your Focus session was recovered. It is paused until you resume.</Text>
          <Text style={[styles.statusFocused, { color: colors.mutedText }]}>{formatCountdown(focusedElapsedMs)} focused before reopening</Text>
        </View>
      )}
      {phase === "recovery_pending" && (
        <View style={[styles.statusBanner, { backgroundColor: colors.accentSoft }]}>
          <Text style={[styles.statusText, { color: colors.secondaryText }]}>Your saved Focus time is safe. Recover the session when you’re ready.</Text>
          <Text style={[styles.statusFocused, { color: colors.mutedText }]}>{formatCountdown(focusedElapsedMs)} focused before reopening</Text>
        </View>
      )}
      {focusPersistenceError && (
        <View style={[styles.statusBanner, { backgroundColor: colors.pressed }]}>
          <Text style={[styles.statusText, { color: colors.warning }]}>Session recovery could not be saved. Keep MOMENTUM open while studying.</Text>
        </View>
      )}
      {phase === "focus_returned" && (
        <View style={[styles.statusBanner, styles.statusReturned, { backgroundColor: colors.accentSoft }]}>
          <Text style={[styles.statusText, { color: colors.secondaryText }]}>
            Welcome back! Tap Resume to continue.
          </Text>
          <Text style={[styles.statusFocused, { color: colors.mutedText }]}>
            {formatCountdown(focusedElapsedMs)} focused
          </Text>
        </View>
      )}

      {/* Coaching message — always below ring, above controls */}
      <Text style={[styles.coachMessage, { color: colors.mutedText }]}>
        {focusCoachMessage(focusedElapsedMs, totalDurationMs)}
      </Text>

      {/* Controls — fixed at bottom */}
      <View style={styles.controls}>
        {phase === "completion_pending" ? (
          <TouchableOpacity
            style={[styles.controlButton, styles.controlButtonPrimary, { backgroundColor: colors.accent }]}
            onPress={handleComplete}
            disabled={completeSession.isPending}
            activeOpacity={0.7}
          >
            <Text style={[styles.controlButtonText, { color: colors.accentForeground }]}>
              {completeSession.isPending ? "Saving…" : "Retry saving session"}
            </Text>
          </TouchableOpacity>
        ) : phase === "focusing" ? (
          <TouchableOpacity
            style={[styles.controlButton, { backgroundColor: colors.pressed }]}
            onPress={handlePause}
            activeOpacity={0.7}
          >
            <Text style={[styles.controlButtonText, { color: colors.primaryText }]}>Pause</Text>
          </TouchableOpacity>
        ) : phase === "recovery_pending" ? (
          <TouchableOpacity
            style={[styles.controlButton, styles.controlButtonPrimary, { backgroundColor: colors.accent }]}
            onPress={() => void handleResume()}
            activeOpacity={0.7}
          >
            <Text style={[styles.controlButtonText, { color: colors.accentForeground }]}>Recover and resume</Text>
          </TouchableOpacity>
        ) : phase === "paused_by_user" || phase === "focus_returned" ? (
          <TouchableOpacity
            style={[styles.controlButton, styles.controlButtonPrimary, { backgroundColor: colors.accent }]}
            onPress={handleResume}
            activeOpacity={0.7}
          >
            <Text style={[styles.controlButtonText, { color: colors.accentForeground }]}>
              Resume
            </Text>
          </TouchableOpacity>
        ) : null}

        {(phase === "focusing" || phase === "paused_by_user" || phase === "recovery_pending") && (
          <TouchableOpacity
            style={styles.finishButton}
            onPress={handleFinishEarly}
            activeOpacity={0.7}
          >
            <Text style={[styles.finishButtonText, { color: colors.mutedText }]}>Finish Early</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal
        visible={studyBuddyOpen}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setStudyBuddyOpen(false)}
      >
        {studyBuddyOpen && (
          <StudyBuddyPanel
            messages={studyBuddyMessages}
            draft={studyBuddyDraft}
            busy={studyBuddy.isPending}
            error={studyBuddyError}
            countdown={formatCountdown(remainingMs)}
            onDraftChange={setStudyBuddyDraft}
            onSend={() => void sendStudyBuddyQuestion()}
            onRetry={() => void sendStudyBuddyQuestion()}
            onClose={() => setStudyBuddyOpen(false)}
            onSuggestion={setStudyBuddyDraft}
          />
        )}
      </Modal>
      {focusShieldOpen ? <FocusShieldChallenge
        key={`${authUserId}:${sessionId}:${params.backlogItemId || resolvedSession?.backlog_item_id || ""}:${className || ""}:${boardName || ""}`}
        visible={focusShieldOpen}
        onClose={() => {
          setFocusShieldOpen(false);
          const shouldResume = focusShieldPausedSession.current;
          focusShieldPausedSession.current = false;
          if (shouldResume && phase === "paused_by_user" && appState === "active" && identityReady && !focusLeaseError && !completionSavedRef.current) void handleResume();
        }}
        userId={authUserId}
        backlogItemId={params.backlogItemId || resolvedSession?.backlog_item_id || ""}
        taskTitle={taskTitle}
        courseName={courseName}
        className={className}
        boardName={boardName}
      /> : null}
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
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  errorTitle: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  errorBody: {
    color: "#FCA5A5",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  errorHint: {
    color: "#94A3B8",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 8,
  },
  errorPrimaryButton: {
    width: "100%",
  },
  errorLeaveButton: {
    paddingVertical: 14,
    alignItems: "center",
    width: "100%",
  },
  errorLeaveText: {
    color: "#64748B",
    fontSize: 15,
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

  // ── Focus timer ──
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
  coachMessage: {
    color: "#94A3B8",
    fontSize: 15,
    textAlign: "center",
    paddingHorizontal: 40,
    marginBottom: 20,
    lineHeight: 22,
  },
  controls: {
    paddingHorizontal: 32,
    paddingBottom: 40,
    gap: 12,
  },
  studyBuddyEntry: {
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingVertical: 8,
    marginBottom: 4,
  },
  studyBuddyEntryText: {
    color: "#93C5FD",
    fontSize: 13,
    fontWeight: "600",
  },
  shieldEntry: {
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderRadius: 999,
  },
  shieldEntryText: {
    fontSize: 13,
    fontWeight: "700",
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
