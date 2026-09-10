import { useState, useCallback } from "react";
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

import { api } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import type { AuthMeResponse } from "@/services/types";
import { parseBacklogInput, getTotalTopics, COURSE_COLORS } from "@/lib/onboarding";

// ── Backlog text parser (mirrors web) ──
interface ParsedGroup {
  subject: string;
  items: string[];
}

// ── Weekday types ──
const WEEKDAY_TYPES = [
  { value: "school", label: "School only" },
  { value: "coaching", label: "School + Coaching" },
  { value: "tuition", label: "School + Tuition" },
  { value: "sports", label: "School + Sports" },
  { value: "other", label: "Other" },
] as const;

const LOADING_MESSAGES = [
  "Understanding your work...",
  "Organizing subjects...",
  "Planning your study time...",
  "Building your study plan...",
  "Almost there...",
];

export default function OnboardingScreen() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);

  // Step data (persists across re-renders via state)
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [backlogText, setBacklogText] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [exams, setExams] = useState<{ title: string; date: string }[]>([]);
  const [examTitle, setExamTitle] = useState("");
  const [examDate, setExamDate] = useState("");
  const [weekdayType, setWeekdayType] = useState<string | null>(null);
  const [coachingEnd, setCoachingEnd] = useState("17:00");
  const [submitting, setSubmitting] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);

  const parsed = parseBacklogInput(backlogText);
  const totalTopics = getTotalTopics(parsed);

  // ── Navigation ──
  const advance = useCallback(() => setStep((s) => s + 1), []);
  const retreat = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  // ── Submit ──
  async function handleFinish() {
    // Build courses + backlog from parsed text
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

    // Build goals from exams
    const goals = exams.map((e) => ({
      title: e.title,
      target_date: e.date
        ? new Date(e.date + "T00:00:00.000Z").toISOString()
        : null,
      category: "exam" as const,
    }));

    // Compute study window from weekdayType
    let studyStart = "16:00";
    if (weekdayType === "coaching") {
      const [h, m] = coachingEnd.split(":").map(Number);
      const endMin = h * 60 + m + 30;
      studyStart = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
    } else if (weekdayType === "tuition" || weekdayType === "other") {
      studyStart = "17:00";
    } else if (weekdayType === "sports") {
      studyStart = "18:00";
    }

    // Build schedule blocks for Mon-Fri
    const schoolBlock = { type: "school", start: "08:00", end: "15:00" };
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
    const schedule: Record<string, { type: string; start: string; end: string }[]> = {};
    for (const day of days) {
      const blocks = [schoolBlock];
      if (weekdayType === "coaching") {
        const [h] = coachingEnd.split(":").map(Number);
        blocks.push({
          type: "coaching",
          start: `${String(h - 2).padStart(2, "0")}:00`,
          end: coachingEnd,
        });
      }
      schedule[day] = blocks;
    }

    const payload = {
      courses,
      backlog,
      goals,
      profile: {
        name: name || undefined,
        sleep_schedule: { start: "22:00", end: "06:00" },
        energy_peak: "morning",
        preferred_study_window: { earliest_start: studyStart, latest_end: "22:00" },
        daily_target_minutes: 120,
        class_name: "Student",
      },
      schedule: { schedule },
    };

    // Cycle loading messages
    let msgIdx = 0;
    const msgTimer = setInterval(() => {
      msgIdx = (msgIdx + 1) % LOADING_MESSAGES.length;
      setLoadingMsg(LOADING_MESSAGES[msgIdx]);
    }, 2500);

    setSubmitting(true);
    try {
      const result = await api.post<AuthMeResponse>("/api/v1/onboarding", payload);

      if (result.error) {
        clearInterval(msgTimer);
        Alert.alert("Error", result.error);
        setSubmitting(false);
        return;
      }

      clearInterval(msgTimer);
      // Refresh user profile
      const meResult = await api.get<AuthMeResponse>("/api/v1/auth/me");
      if (meResult.data) {
        setUser(meResult.data);
      }
      router.replace("/(app)");
    } catch {
      clearInterval(msgTimer);
      Alert.alert("Error", "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  // ── Step content ──

  function renderStep() {
    switch (step) {
      case 0:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.heroEmoji}>{"\uD83D\uDE80"}</Text>
            <Text style={styles.heroTitle}>Welcome to Momentum</Text>
            <Text style={styles.heroSubtitle}>
              Let&apos;s set up your study plan in just a few steps.
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={advance} activeOpacity={0.8}>
              <Text style={styles.primaryButtonText}>Get Started</Text>
            </TouchableOpacity>
          </View>
        );

      case 1:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>What&apos;s your name?</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={(t) => setName(t.slice(0, 25))}
              placeholder="Your name"
              placeholderTextColor="#999"
              autoFocus
              maxLength={25}
            />
            <Text style={styles.charCount}>{name.trim().length}/25</Text>
            <TouchableOpacity
              style={[styles.primaryButton, !name.trim() && styles.disabled]}
              onPress={advance}
              disabled={!name.trim()}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        );

      case 2:
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
                        totalTopics === 0 && styles.disabled,
                      ]}
                      onPress={advance}
                      disabled={totalTopics === 0}
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

      case 3:
        return (
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.flex}
          >
            <ScrollView
              contentContainerStyle={styles.stepScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.stepTitle}>Any exam deadlines?</Text>
              <Text style={styles.stepSubtitle}>Optional. Add subjects with dates.</Text>

              {exams.map((e, i) => (
                <View key={i} style={styles.examRow}>
                  <Text style={styles.examText}>
                    {e.title}
                    {e.date ? ` — ${e.date}` : ""}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setExams(exams.filter((_, j) => j !== i))}
                  >
                    <Text style={styles.removeText}>{"\u2715"}</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <View style={styles.examInputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={examTitle}
                  onChangeText={setExamTitle}
                  placeholder="Subject name"
                  placeholderTextColor="#999"
                />
                <TextInput
                  style={[styles.input, { width: 120 }]}
                  value={examDate}
                  onChangeText={setExamDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#999"
                />
                <TouchableOpacity
                  style={[
                    styles.addButton,
                    !examTitle.trim() && styles.disabled,
                  ]}
                  disabled={!examTitle.trim()}
                  onPress={() => {
                    setExams([...exams, { title: examTitle.trim(), date: examDate.trim() }]);
                    setExamTitle("");
                    setExamDate("");
                  }}
                >
                  <Text style={styles.addButtonText}>+</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.primaryButton} onPress={advance} activeOpacity={0.8}>
                <Text style={styles.primaryButtonText}>Continue</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        );

      case 4:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>What does your weekday look like?</Text>
            <Text style={styles.stepSubtitle}>
              This helps us plan your study windows.
            </Text>

            {WEEKDAY_TYPES.map((wt) => (
              <TouchableOpacity
                key={wt.value}
                style={[
                  styles.optionRow,
                  weekdayType === wt.value && styles.optionSelected,
                ]}
                onPress={() => setWeekdayType(wt.value)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.optionText,
                    weekdayType === wt.value && styles.optionTextSelected,
                  ]}
                >
                  {wt.label}
                </Text>
              </TouchableOpacity>
            ))}

            {weekdayType === "coaching" ? (
              <View style={styles.timeRow}>
                <Text style={styles.timeLabel}>Coaching ends at:</Text>
                <TextInput
                  style={[styles.input, { width: 100 }]}
                  value={coachingEnd}
                  onChangeText={setCoachingEnd}
                  placeholder="HH:MM"
                  placeholderTextColor="#999"
                />
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.primaryButton, !weekdayType && styles.disabled]}
              onPress={advance}
              disabled={!weekdayType}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        );

      case 5:
        return (
          <View style={styles.stepContent}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={[styles.stepTitle, { marginTop: 24 }]}>
              {loadingMsg}
            </Text>
          </View>
        );

      default:
        return null;
    }
  }

  // ── Step indicator ──
  const totalSteps = 5; // steps 0-4 are user-facing, 5 is loading
  const displayStep = Math.min(step, 4);

  return (
    <SafeAreaView style={styles.container}>
      {step < 5 && step > 0 ? (
        <View style={styles.progressBar}>
          <View
            style={[styles.progressFill, { width: `${((displayStep) / 4) * 100}%` }]}
          />
        </View>
      ) : null}

      {step > 0 && step < 5 ? (
        <View style={styles.topBar}>
          <TouchableOpacity onPress={retreat} style={styles.backButton}>
            <Text style={styles.backText}>{"\u2190"} Back</Text>
          </TouchableOpacity>
          <Text style={styles.stepCounter}>
            {displayStep} / 4
          </Text>
        </View>
      ) : null}

      <View style={styles.flex}>{renderStep()}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAFAFA" },
  flex: { flex: 1 },
  progressBar: { height: 3, backgroundColor: "#E5E7EB" },
  progressFill: { height: 3, backgroundColor: "#2563EB" },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: { padding: 4 },
  backText: { fontSize: 16, color: "#2563EB" },
  stepCounter: { fontSize: 14, color: "#999" },
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
  heroEmoji: { fontSize: 48, marginBottom: 16 },
  heroTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 8,
    textAlign: "center",
  },
  heroSubtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 40,
    lineHeight: 22,
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
  charCount: { fontSize: 12, color: "#999", textAlign: "right", marginBottom: 16 },
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
  row: { flexDirection: "row", marginTop: 8 },
  confirmCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
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
  examRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  examText: { fontSize: 15, color: "#1A1A1A", flex: 1 },
  removeText: { fontSize: 16, color: "#EF4444", padding: 4 },
  examInputRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
    alignItems: "center",
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonText: { color: "#FFF", fontSize: 22, fontWeight: "700" },
  optionRow: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  optionSelected: {
    backgroundColor: "#EFF6FF",
    borderColor: "#2563EB",
  },
  optionText: { fontSize: 16, color: "#334155" },
  optionTextSelected: { color: "#2563EB", fontWeight: "600" },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
    marginBottom: 8,
  },
  timeLabel: { fontSize: 15, color: "#334155" },
});
