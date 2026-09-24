import { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import type { AuthMeResponse } from "@/services/types";
import { dashboardQueryKey, fetchDashboard } from "@/services/hooks";
import { parseBacklogInput, getTotalTopics, COURSE_COLORS } from "@/lib/onboarding";

const SAVING_MSG = "Saving your work...";
const BUILDING_MSG = "Building your plan...";

// Default school-day schedule (Mon–Fri). Editable later from Plan → Schedule.
const DEFAULT_SCHOOL_BLOCK = { type: "school", start: "08:00", end: "15:00" };
const DEFAULT_SCHEDULE_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
] as const;

function buildDefaultSchedule(): Record<
  string,
  { type: string; start: string; end: string }[]
> {
  const schedule: Record<
    string,
    { type: string; start: string; end: string }[]
  > = {};
  for (const day of DEFAULT_SCHEDULE_DAYS) {
    schedule[day] = [{ ...DEFAULT_SCHOOL_BLOCK }];
  }
  return schedule;
}

export default function OnboardingScreen() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();

  // step: 0 = backlog input / parsed confirmation, 1 = loading,
  // 2 = recoverable /me error after successful onboarding POST
  const [step, setStep] = useState(0);
  const [backlogText, setBacklogText] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(SAVING_MSG);
  const [meError, setMeError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const onboardingPostedRef = useRef(false);

  const parsed = parseBacklogInput(backlogText);
  const totalTopics = getTotalTopics(parsed);

  /**
   * After onboarding POST succeeded: load profile + prefetch dashboard.
   * Navigates to /(app) only when profile is present — never into a
   * profile-less app. Does not re-POST onboarding.
   */
  async function completeAfterPost(): Promise<boolean> {
    setLoadingMsg(BUILDING_MSG);
    const [meResult] = await Promise.all([
      api.get<AuthMeResponse>("/api/v1/auth/me"),
      queryClient.prefetchQuery({
        queryKey: dashboardQueryKey,
        queryFn: fetchDashboard,
      }),
    ]);

    if (meResult.data?.profile) {
      setUser(meResult.data);
      router.replace("/(app)");
      return true;
    }

    setMeError(
      meResult.error ||
        "Your plan was saved, but we couldn't load your account. Please retry.",
    );
    setStep(2);
    setSubmitting(false);
    submittingRef.current = false;
    return false;
  }

  async function handleFinish() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setStep(1);
    setMeError(null);
    setLoadingMsg(SAVING_MSG);

    const courses = parsed
      .filter((g) => g.items.length > 0)
      .map((g, i) => ({
        name: g.subject,
        color: COURSE_COLORS[i % COURSE_COLORS.length],
      }));

    const backlog = parsed
      .filter((g) => g.items.length > 0)
      .flatMap((g, courseIdx) =>
        g.items.map((item) => ({
          title: item,
          course_index: courseIdx,
        })),
      );

    // First-run defaults: no exam goals; generic school-week profile/schedule.
    // Name is captured at register. Schedule is editable later from Plan.
    const payload = {
      courses,
      backlog,
      goals: [] as {
        title: string;
        target_date: string | null;
        category: "exam";
      }[],
      profile: {
        sleep_schedule: { start: "22:00", end: "06:00" },
        energy_peak: "morning",
        preferred_study_window: { earliest_start: "16:00", latest_end: "22:00" },
        daily_target_minutes: 120,
        class_name: "Student",
      },
      schedule: { schedule: buildDefaultSchedule() },
    };

    try {
      // POST at most once per screen mount — /me retry must not duplicate it.
      if (!onboardingPostedRef.current) {
        const result = await api.post<AuthMeResponse>(
          "/api/v1/onboarding",
          payload,
        );

        if (result.error) {
          Alert.alert("Error", result.error);
          setSubmitting(false);
          submittingRef.current = false;
          setStep(0);
          setShowConfirm(true);
          return;
        }

        onboardingPostedRef.current = true;
      }

      // Onboarding session is authenticated; plan is created by GET /dashboard.
      // Overlap auth restore with dashboard prefetch so Today has data on first paint.
      await completeAfterPost();
    } catch {
      if (onboardingPostedRef.current) {
        // POST already succeeded — only /me/prefetch failed. Recoverable.
        setMeError(
          "Your plan was saved, but we couldn't finish loading. Please retry.",
        );
        setStep(2);
        setSubmitting(false);
        submittingRef.current = false;
      } else {
        Alert.alert("Error", "Something went wrong. Please try again.");
        setSubmitting(false);
        submittingRef.current = false;
        setStep(0);
        setShowConfirm(true);
      }
    }
  }

  /** Retry only /me after onboarding already POSTed — never POST again. */
  async function handleRetryMe() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setStep(1);
    setLoadingMsg(BUILDING_MSG);

    try {
      const meResult = await api.get<AuthMeResponse>("/api/v1/auth/me");
      if (meResult.data?.profile) {
        setUser(meResult.data);
        await queryClient.prefetchQuery({
          queryKey: dashboardQueryKey,
          queryFn: fetchDashboard,
        });
        router.replace("/(app)");
      } else {
        setMeError(
          meResult.error ||
            "Your plan was saved, but we couldn't load your account. Please retry.",
        );
        setStep(2);
        setSubmitting(false);
        submittingRef.current = false;
      }
    } catch {
      setMeError(
        "Your plan was saved, but we couldn't finish loading. Please retry.",
      );
      setStep(2);
      setSubmitting(false);
      submittingRef.current = false;
    }
  }

  function renderStep() {
    if (step === 1) {
      return (
        <View style={styles.stepContent}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={[styles.stepTitle, { marginTop: 24 }]}>
            {loadingMsg}
          </Text>
        </View>
      );
    }

    if (step === 2) {
      return (
        <View style={styles.stepContent} testID="onboarding-me-error">
          <Text style={styles.stepTitle}>Almost there</Text>
          <Text style={styles.stepSubtitle}>
            {meError ??
              "Your plan was saved, but we couldn't load your account."}
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, submitting && styles.disabled]}
            onPress={() => {
              if (submittingRef.current) return;
              handleRetryMe();
            }}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Retry</Text>
            )}
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.stepScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {!showConfirm ? (
            <>
              <Text style={styles.stepTitle}>What are you studying?</Text>
              <Text style={styles.stepSubtitle}>
                Paste or type your homework list. Separate subjects with blank lines.
              </Text>
              <TextInput
                style={styles.textArea}
                value={backlogText}
                onChangeText={setBacklogText}
                placeholder={"Physics\nMotion\nGravitation\n\nMaths\nTriangles\nCircles"}
                placeholderTextColor="#999"
                multiline
                textAlignVertical="top"
              />
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  totalTopics === 0 && styles.disabled,
                ]}
                onPress={() => setShowConfirm(true)}
                disabled={totalTopics === 0}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryButtonText}>Build My Plan</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.stepTitle}>Here&apos;s what I understood</Text>
              {parsed
                .filter((g) => g.items.length > 0)
                .map((g, i) => (
                  <View key={i} style={styles.confirmCard}>
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: COURSE_COLORS[i % COURSE_COLORS.length] },
                      ]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.confirmSubject}>{g.subject}</Text>
                      <Text style={styles.confirmCount}>
                        {g.items.length} topic{g.items.length !== 1 ? "s" : ""}
                      </Text>
                    </View>
                  </View>
                ))}
              {totalTopics === 0 ? (
                <Text style={styles.emptyText}>
                  No topics found. Try pasting your list in a different format.
                </Text>
              ) : null}
              <View style={styles.row}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => setShowConfirm(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.secondaryButtonText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    (totalTopics === 0 || submitting) && styles.disabled,
                  ]}
                  onPress={() => {
                    if (totalTopics === 0 || submittingRef.current) return;
                    handleFinish();
                  }}
                  disabled={totalTopics === 0 || submitting}
                  activeOpacity={0.8}
                >
                  <Text style={styles.primaryButtonText}>Looks correct</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.flex}>{renderStep()}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAFAFA" },
  flex: { flex: 1 },
  stepContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  stepScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 8,
    textAlign: "center",
  },
  stepSubtitle: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    marginBottom: 24,
  },
  textArea: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: "#1A1A1A",
    minHeight: 180,
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  primaryButtonText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  secondaryButton: {
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  secondaryButtonText: { color: "#334155", fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.5 },
  row: { flexDirection: "row", marginTop: 8, width: "100%" },
  confirmCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    width: "100%",
  },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  confirmSubject: { fontSize: 16, fontWeight: "600", color: "#1A1A1A" },
  confirmCount: { fontSize: 13, color: "#666", marginTop: 2 },
  emptyText: {
    color: "#999",
    fontSize: 14,
    textAlign: "center",
    marginVertical: 16,
  },
});
