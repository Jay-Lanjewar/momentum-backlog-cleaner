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
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";

import { api } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import type {
  AuthMeResponse,
  BlockType,
  DayName,
  WeeklyBlock,
} from "@/services/types";
import { dashboardQueryKey, fetchDashboard } from "@/services/hooks";
import { parseBacklogInput, getTotalTopics } from "@/lib/onboarding";
import {
  countDraftTasks,
  createTaskDraft,
  draftSubjectKey,
  draftsToPayload,
  interpretBacklogInput,
  type CourseDraft,
  type TaskDraft,
} from "@/lib/backlogInterpret";
import { TaskReviewCard } from "@/components/onboarding/TaskReviewCard";
import {
  BLOCK_TYPES,
  BLOCK_TYPE_MAP,
  DAYS,
  DAY_LABELS,
  DAY_FULL_LABELS,
  formatTime12h,
  isValidTimeRange,
  hasOverlap,
} from "@/lib/schedule";

const SAVING_MSG = "Saving your work...";
const BUILDING_MSG = "Building your plan...";
const AVAILABILITY_TITLE = "When are you busy?";
const AVAILABILITY_SUBTITLE =
  "Add only what's fixed. Momentum plans study time around it.";
const BACKLOG_TITLE = "What do you need to get done?";
const BACKLOG_SUBTITLE =
  "One task per line. Subjects and due dates are optional.";
const BACKLOG_PLACEHOLDER = [
  "Maths quadratic equations practice 20 questions",
  "Physics motion revise notes by Friday",
  "Chemistry atoms and molecules chapter",
  "English worksheet tomorrow",
].join("\n");
const INTERPRET_LABEL = "Interpret tasks";
const REVIEW_TITLE = "Here's what Momentum understood";
const REVIEW_SUBTITLE = "Editing is optional. Fix anything we got wrong.";

// Default school-day schedule (Mon–Fri). Editable later from Plan → Schedule.
const DEFAULT_SCHOOL_BLOCK = { type: "school", start: "08:00", end: "15:00" };
const DEFAULT_SCHEDULE_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
] as const;

const DEFAULT_SCHOOL_DAYS: DayName[] = [...DEFAULT_SCHEDULE_DAYS];
const DEFAULT_COMMITMENT = {
  type: "coaching" as BlockType,
  start: "16:00",
  end: "18:00",
};
const DEFAULT_DAILY_TARGET_MINUTES = 120;
const DAILY_TARGET_STEP = 30;
const MIN_DAILY_TARGET_MINUTES = 30;
const MAX_DAILY_TARGET_MINUTES = 480;

type StepView = "backlog" | "review" | "availability" | "confirm";
type PickerKey = "school-start" | "school-end" | "commitment-start" | "commitment-end";

interface Commitment {
  id: string;
  type: BlockType;
  title: string;
  start: string;
  end: string;
  days: DayName[];
}

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

function timeToDate(time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function dateToTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function buildSchedule(
  schoolDays: DayName[],
  schoolStart: string,
  schoolEnd: string,
  commitments: Commitment[],
): Partial<Record<DayName, WeeklyBlock[]>> {
  const schedule: Partial<Record<DayName, WeeklyBlock[]>> = {};
  for (const day of schoolDays) {
    schedule[day] = [{ type: "school", start: schoolStart, end: schoolEnd }];
  }
  for (const commitment of commitments) {
    const title = commitment.title.trim();
    for (const day of commitment.days) {
      const blocks = schedule[day] ?? [];
      blocks.push(
        title
          ? {
              type: commitment.type,
              start: commitment.start,
              end: commitment.end,
              title,
            }
          : {
              type: commitment.type,
              start: commitment.start,
              end: commitment.end,
            },
      );
      schedule[day] = blocks;
    }
  }
  for (const day of Object.keys(schedule) as DayName[]) {
    schedule[day]?.sort((a, b) => a.start.localeCompare(b.start));
  }
  return schedule;
}

function findScheduleIssue(
  schedule: Partial<Record<DayName, WeeklyBlock[]>>,
): string | null {
  const days = Object.keys(schedule) as DayName[];
  if (days.length === 0) {
    return "Add at least one fixed commitment so Momentum can plan around it.";
  }
  for (const day of days) {
    const blocks = (schedule[day] ?? [])
      .slice()
      .sort((a, b) => a.start.localeCompare(b.start));
    for (const block of blocks) {
      if (!isValidTimeRange(block.start, block.end)) {
        return "End time must be after start time.";
      }
    }
    for (let i = 1; i < blocks.length; i++) {
      if (blocks[i].start < blocks[i - 1].end) {
        return `These times overlap on ${DAY_FULL_LABELS[day]}.`;
      }
    }
  }
  return null;
}

export default function OnboardingScreen() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();

  // step: 0 = onboarding views, 1 = loading,
  // 2 = recoverable /me error after successful onboarding POST
  const [step, setStep] = useState(0);
  const [view, setView] = useState<StepView>("backlog");
  const [backlogText, setBacklogText] = useState("");
  const [drafts, setDrafts] = useState<CourseDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(SAVING_MSG);
  const [meError, setMeError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const onboardingPostedRef = useRef(false);
  const nextCommitmentId = useRef(1);

  const [schoolDays, setSchoolDays] = useState<DayName[]>(DEFAULT_SCHOOL_DAYS);
  const [schoolStart, setSchoolStart] = useState(DEFAULT_SCHOOL_BLOCK.start);
  const [schoolEnd, setSchoolEnd] = useState(DEFAULT_SCHOOL_BLOCK.end);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [form, setForm] = useState<Commitment | null>(null);
  const [picker, setPicker] = useState<PickerKey | null>(null);
  const [dailyTarget, setDailyTarget] = useState(
    DEFAULT_DAILY_TARGET_MINUTES,
  );

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

    const { courses, backlog } = draftsToPayload(drafts);

    const availability = buildSchedule(
      schoolDays,
      schoolStart,
      schoolEnd,
      commitments,
    );
    const schedule =
      Object.keys(availability).length > 0 ? availability : buildDefaultSchedule();

    // First-run defaults: no exam goals. Name is captured at register.
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
        daily_target_minutes: dailyTarget,
        class_name: "Student",
      },
      schedule: { schedule },
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
          setView("confirm");
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
        setView("confirm");
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

  function toggleSchoolDay(day: DayName) {
    setSchoolDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }

  function changeDailyTarget(delta: number) {
    setDailyTarget((prev) =>
      Math.min(
        MAX_DAILY_TARGET_MINUTES,
        Math.max(MIN_DAILY_TARGET_MINUTES, prev + delta),
      ),
    );
  }

  function handleInterpret() {
    if (totalTopics === 0 || submittingRef.current) return;
    setDrafts(interpretBacklogInput(backlogText, drafts));
    setView("review");
  }

  function updateTask(
    courseIndex: number,
    taskId: string,
    patch: Partial<TaskDraft>,
  ) {
    setDrafts((prev) =>
      prev.map((course, index) =>
        index !== courseIndex
          ? course
          : {
              ...course,
              tasks: course.tasks.map((task) =>
                task.id === taskId ? { ...task, ...patch } : task,
              ),
            },
      ),
    );
  }

  function renameCourse(courseIndex: number, subject: string) {
    setDrafts((prev) =>
      prev.map((course, index) =>
        index !== courseIndex
          ? course
          : { ...course, subject, subjectUncertain: false },
      ),
    );
  }

  function moveTask(
    courseIndex: number,
    taskId: string,
    targetSubject: string,
  ) {
    setDrafts((prev) => {
      const targetIndex = prev.findIndex(
        (course) =>
          draftSubjectKey(course.subject) ===
          draftSubjectKey(targetSubject),
      );
      if (targetIndex === -1 || targetIndex === courseIndex) return prev;
      const task = prev[courseIndex]?.tasks.find((item) => item.id === taskId);
      if (!task) return prev;
      return prev.map((course, index) => {
        if (index === courseIndex) {
          return {
            ...course,
            tasks: course.tasks.filter((item) => item.id !== taskId),
          };
        }
        if (index === targetIndex) {
          return { ...course, tasks: [...course.tasks, task] };
        }
        return course;
      });
    });
  }

  function deleteTask(courseIndex: number, taskId: string) {
    setDrafts((prev) =>
      prev.map((course, index) =>
        index !== courseIndex
          ? course
          : {
              ...course,
              tasks: course.tasks.filter((task) => task.id !== taskId),
            },
      ),
    );
  }

  function addTask() {
    setDrafts((prev) => {
      const task = createTaskDraft();
      if (prev.length === 0) {
        return [
          {
            subject: "",
            subjectUncertain: true,
            sourceText: backlogText,
            tasks: [task],
          },
        ];
      }
      const lastIndex = prev.length - 1;
      return prev.map((course, index) =>
        index === lastIndex
          ? { ...course, tasks: [...course.tasks, task] }
          : course,
      );
    });
  }

  function openForm(value: Commitment) {
    setPicker(null);
    setForm(value);
  }

  function closeForm() {
    setPicker(null);
    setForm(null);
  }

  function openNewCommitment() {
    openForm({
      id: "",
      type: DEFAULT_COMMITMENT.type,
      title: "",
      start: DEFAULT_COMMITMENT.start,
      end: DEFAULT_COMMITMENT.end,
      days: [...DEFAULT_SCHOOL_DAYS],
    });
  }

  function saveCommitment() {
    if (!form) return;
    if (validateCommitment(form)) return;
    if (form.id) {
      setCommitments((prev) =>
        prev.map((c) => (c.id === form.id ? { ...form } : c)),
      );
    } else {
      const id = `commitment-${nextCommitmentId.current++}`;
      setCommitments((prev) => [...prev, { ...form, id }]);
    }
    closeForm();
  }

  function validateCommitment(candidate: Commitment): string | null {
    if (candidate.days.length === 0) return "Pick at least one day.";
    if (!isValidTimeRange(candidate.start, candidate.end)) {
      return "End time must be after start time.";
    }
    for (const day of candidate.days) {
      const others: WeeklyBlock[] = [];
      if (schoolDays.includes(day)) {
        others.push({
          type: "school",
          start: schoolStart,
          end: schoolEnd,
        });
      }
      for (const commitment of commitments) {
        if (commitment.id === candidate.id) continue;
        if (commitment.days.includes(day)) {
          others.push({
            type: commitment.type,
            start: commitment.start,
            end: commitment.end,
          });
        }
      }
      if (hasOverlap(others, candidate.start, candidate.end)) {
        return `This overlaps with another commitment on ${DAY_FULL_LABELS[day]}.`;
      }
    }
    return null;
  }

  function handleSchoolTimeChange(
    which: "start" | "end",
    _event: DateTimePickerEvent,
    selectedDate?: Date,
  ) {
    if (Platform.OS === "android") setPicker(null);
    if (!selectedDate) return;
    const value = dateToTime(selectedDate);
    if (which === "start") setSchoolStart(value);
    else setSchoolEnd(value);
  }

  function handleCommitmentTimeChange(
    which: "start" | "end",
    _event: DateTimePickerEvent,
    selectedDate?: Date,
  ) {
    if (Platform.OS === "android") setPicker(null);
    if (!selectedDate || !form) return;
    setForm({
      ...form,
      ...(which === "start" ? { start: dateToTime(selectedDate) } : { end: dateToTime(selectedDate) }),
    });
  }

  function renderDayChips(
    selected: DayName[],
    onToggle: (day: DayName) => void,
    testIDPrefix: string,
    labelPrefix: string,
  ) {
    return (
      <View style={styles.chipRow}>
        {DAYS.map((day) => {
          const active = selected.includes(day);
          return (
            <TouchableOpacity
              key={day}
              style={[styles.dayChip, active && styles.dayChipActive]}
              onPress={() => onToggle(day)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${labelPrefix} ${DAY_LABELS[day]}`}
              accessibilityState={{ selected: active }}
              testID={`${testIDPrefix}-${day}`}
            >
              <Text
                style={[styles.dayChipText, active && styles.dayChipTextActive]}
              >
                {DAY_LABELS[day]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  function renderTimeField(
    label: string,
    value: string,
    buttonTestID: string,
    pickerKey: PickerKey,
    pickerTestID: string,
    onChange: (
      event: DateTimePickerEvent,
      date?: Date,
    ) => void,
    accessibilityLabel: string,
  ) {
    return (
      <View style={styles.timeField}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <TouchableOpacity
          style={styles.timeBtn}
          onPress={() => setPicker(pickerKey)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          testID={buttonTestID}
        >
          <Text style={styles.timeBtnText}>{formatTime12h(value)}</Text>
        </TouchableOpacity>
        {picker === pickerKey && (
          <DateTimePicker
            testID={pickerTestID}
            value={timeToDate(value)}
            mode="time"
            is24Hour={false}
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={onChange}
          />
        )}
      </View>
    );
  }

  function renderAvailabilityView() {
    const schedule = buildSchedule(
      schoolDays,
      schoolStart,
      schoolEnd,
      commitments,
    );
    const issue = findScheduleIssue(schedule);

    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.stepScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.stepTitle}>{AVAILABILITY_TITLE}</Text>
          <Text style={styles.stepSubtitle}>{AVAILABILITY_SUBTITLE}</Text>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      BLOCK_TYPE_MAP.get("school")?.color ?? "#3b82f6",
                  },
                ]}
              />
              <Text style={styles.cardTitle}>School</Text>
            </View>
            {renderDayChips(
              schoolDays,
              toggleSchoolDay,
              "school-day",
              "School",
            )}
            <View style={styles.timeRow}>
              {renderTimeField(
                "Starts",
                schoolStart,
                "onboarding-school-start",
                "school-start",
                "onboarding-school-start-picker",
                (e, d) => handleSchoolTimeChange("start", e, d),
                "School start time",
              )}
              {renderTimeField(
                "Ends",
                schoolEnd,
                "onboarding-school-end",
                "school-end",
                "onboarding-school-end-picker",
                (e, d) => handleSchoolTimeChange("end", e, d),
                "School end time",
              )}
            </View>
          </View>

          {commitments.map((commitment) => {
            const info = BLOCK_TYPE_MAP.get(commitment.type);
            const categoryLabel = info?.label ?? commitment.type;
            const title = commitment.title.trim();
            const daysLabel = commitment.days
              .map((d) => DAY_LABELS[d])
              .join(", ");
            return (
              <View
                key={commitment.id}
                style={[styles.card, styles.commitmentRow]}
              >
                <TouchableOpacity
                  style={styles.cardBody}
                  onPress={() => {
                    openForm({ ...commitment });
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${title || categoryLabel}`}
                  testID={`commitment-${commitment.id}`}
                >
                  <View style={styles.cardHeader}>
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: info?.color ?? "#737373" },
                      ]}
                    />
                    <Text style={styles.cardTitle}>
                      {title || categoryLabel}
                    </Text>
                  </View>
                  <Text style={styles.cardMeta}>
                    {title ? `${categoryLabel} · ${daysLabel}` : daysLabel}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {formatTime12h(commitment.start)} –{" "}
                    {formatTime12h(commitment.end)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() =>
                    setCommitments((prev) =>
                      prev.filter((c) => c.id !== commitment.id),
                    )
                  }
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${title || categoryLabel}`}
                  testID={`remove-${commitment.id}`}
                >
                  <Text style={styles.deleteText}>✕</Text>
                </TouchableOpacity>
              </View>
            );
          })}

          {form === null ? (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={openNewCommitment}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Add commitment"
              testID="onboarding-add-commitment"
            >
              <Text style={styles.addBtnText}>+ Add commitment</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {form.id ? "Edit commitment" : "New commitment"}
              </Text>
              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.typeGrid}>
                {BLOCK_TYPES.map((bt) => {
                  const active = form.type === bt.value;
                  return (
                    <TouchableOpacity
                      key={bt.value}
                      style={[
                        styles.typeChip,
                        active && {
                          backgroundColor: bt.color + "30",
                          borderColor: bt.color,
                        },
                      ]}
                      onPress={() => setForm({ ...form, type: bt.value })}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={bt.label}
                      accessibilityState={{ selected: active }}
                    >
                      <View
                        style={[styles.typeDot, { backgroundColor: bt.color }]}
                      />
                      <Text
                        style={[
                          styles.typeLabel,
                          active && { color: bt.color, fontWeight: "600" },
                        ]}
                        numberOfLines={1}
                      >
                        {bt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Name (optional)</Text>
              <TextInput
                style={styles.input}
                value={form.title}
                onChangeText={(t) => setForm({ ...form, title: t })}
                placeholder="e.g. Football practice"
                placeholderTextColor="#999"
                maxLength={100}
              />

              <View style={styles.timeRow}>
                {renderTimeField(
                  "Starts",
                  form.start,
                  "onboarding-commitment-start",
                  "commitment-start",
                  "onboarding-commitment-start-picker",
                  (e, d) => handleCommitmentTimeChange("start", e, d),
                  "Commitment start time",
                )}
                {renderTimeField(
                  "Ends",
                  form.end,
                  "onboarding-commitment-end",
                  "commitment-end",
                  "onboarding-commitment-end-picker",
                  (e, d) => handleCommitmentTimeChange("end", e, d),
                  "Commitment end time",
                )}
              </View>

              <Text style={styles.fieldLabel}>Days</Text>
              {renderDayChips(
                form.days,
                (day) =>
                  setForm({
                    ...form,
                    days: form.days.includes(day)
                      ? form.days.filter((d) => d !== day)
                      : [...form.days, day],
                  }),
                "commitment-day",
                "Commitment",
              )}

              {validateCommitment(form) ? (
                <Text style={styles.errorText}>{validateCommitment(form)}</Text>
              ) : null}

              <View style={styles.row}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={closeForm}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel commitment"
                >
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    styles.primaryButtonFlex,
                    validateCommitment(form) && styles.disabled,
                  ]}
                  onPress={saveCommitment}
                  disabled={!!validateCommitment(form)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Save commitment"
                >
                  <Text style={styles.primaryButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Daily target</Text>
            <Text style={styles.cardMeta}>
              How long you want to study every day.
            </Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity
                style={[
                  styles.stepperBtn,
                  dailyTarget <= MIN_DAILY_TARGET_MINUTES && styles.disabled,
                ]}
                onPress={() => changeDailyTarget(-DAILY_TARGET_STEP)}
                disabled={dailyTarget <= MIN_DAILY_TARGET_MINUTES}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Decrease daily target"
                testID="daily-target-decrease"
              >
                <Text style={styles.stepperBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepperValue} testID="daily-target-value">
                {dailyTarget} min
              </Text>
              <TouchableOpacity
                style={[
                  styles.stepperBtn,
                  dailyTarget >= MAX_DAILY_TARGET_MINUTES && styles.disabled,
                ]}
                onPress={() => changeDailyTarget(DAILY_TARGET_STEP)}
                disabled={dailyTarget >= MAX_DAILY_TARGET_MINUTES}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Increase daily target"
                testID="daily-target-increase"
              >
                <Text style={styles.stepperBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {issue ? <Text style={styles.errorText}>{issue}</Text> : null}

          <View style={styles.row}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setView("review")}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Back to tasks"
            >
              <Text style={styles.secondaryButtonText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                styles.primaryButtonFlex,
                (issue || submitting) && styles.disabled,
              ]}
              onPress={() => {
                if (issue || submittingRef.current) return;
                setView("confirm");
              }}
              disabled={!!issue || submitting}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Continue"
            >
              <Text style={styles.primaryButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  function renderBacklogView() {
    return (
      <>
        <Text style={styles.stepTitle}>{BACKLOG_TITLE}</Text>
        <Text style={styles.stepSubtitle}>{BACKLOG_SUBTITLE}</Text>
        <TextInput
          style={styles.textArea}
          value={backlogText}
          onChangeText={setBacklogText}
          placeholder={BACKLOG_PLACEHOLDER}
          placeholderTextColor="#999"
          multiline
          textAlignVertical="top"
          accessibilityLabel="Your tasks, one per line"
          testID="backlog-input"
        />
        <TouchableOpacity
          style={[
            styles.primaryButton,
            totalTopics === 0 && styles.disabled,
          ]}
          onPress={handleInterpret}
          disabled={totalTopics === 0}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={INTERPRET_LABEL}
          accessibilityState={{ disabled: totalTopics === 0 }}
          testID="interpret-tasks"
        >
          <Text style={styles.primaryButtonText}>{INTERPRET_LABEL}</Text>
        </TouchableOpacity>
      </>
    );
  }

  function renderReviewView() {
    const { courses } = draftsToPayload(drafts);
    const courseNames = courses.map((course) => course.name);
    const total = countDraftTasks(drafts);
    const hasBlankTitle = drafts.some((course) =>
      course.tasks.some((task) => !task.title.trim()),
    );
    let taskIndex = 0;

    return (
      <>
        <Text style={styles.stepTitle}>{REVIEW_TITLE}</Text>
        <Text style={styles.stepSubtitle}>{REVIEW_SUBTITLE}</Text>
        {total === 0 ? (
          <Text style={styles.emptyText}>Add at least one task to continue.</Text>
        ) : null}
        {drafts.map((course, courseIndex) =>
          course.tasks.map((task) => {
            const index = taskIndex;
            taskIndex += 1;
            return (
              <TaskReviewCard
                key={task.id}
                task={task}
                index={index}
                subject={course.subject}
                subjectUncertain={course.subjectUncertain}
                courseNames={courseNames}
                onUpdate={(patch) => updateTask(courseIndex, task.id, patch)}
                onSubjectChange={(subject) =>
                  renameCourse(courseIndex, subject)
                }
                onMove={(target) => moveTask(courseIndex, task.id, target)}
                onDelete={() => deleteTask(courseIndex, task.id)}
              />
            );
          }),
        )}
        <TouchableOpacity
          style={styles.addBtn}
          onPress={addTask}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Add a task"
          testID="add-task"
        >
          <Text style={styles.addBtnText}>+ Add a task</Text>
        </TouchableOpacity>
        {hasBlankTitle ? (
          <Text style={styles.errorText}>
            Give every task a name to continue.
          </Text>
        ) : null}
        <View style={styles.row}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setView("backlog")}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Back to task entry"
            testID="review-back"
          >
            <Text style={styles.secondaryButtonText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              styles.primaryButtonFlex,
              (total === 0 || hasBlankTitle) && styles.disabled,
            ]}
            onPress={() => setView("availability")}
            disabled={total === 0 || hasBlankTitle}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Continue to availability"
            accessibilityState={{ disabled: total === 0 || hasBlankTitle }}
            testID="review-continue"
          >
            <Text style={styles.primaryButtonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  function renderConfirmView() {
    const { courses, backlog } = draftsToPayload(drafts);
    const topicCount = backlog.length;

    return (
      <>
        <Text style={styles.stepTitle}>Here&apos;s what I understood</Text>
        {courses.map((course, i) => {
          const count = backlog.filter(
            (item) => item.course_index === i,
          ).length;
          if (count === 0) return null;
          return (
            <View key={i} style={styles.confirmCard}>
              <View style={[styles.dot, { backgroundColor: course.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.confirmSubject}>{course.name}</Text>
                <Text style={styles.confirmCount}>
                  {count} topic{count !== 1 ? "s" : ""}
                </Text>
              </View>
            </View>
          );
        })}
        {topicCount === 0 ? (
          <Text style={styles.emptyText}>
            No topics found. Try pasting your list in a different format.
          </Text>
        ) : null}
        <View style={styles.row}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setView("review")}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Edit tasks"
            testID="confirm-edit"
          >
            <Text style={styles.secondaryButtonText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              (topicCount === 0 || submitting) && styles.disabled,
            ]}
            onPress={() => {
              if (topicCount === 0 || submittingRef.current) return;
              handleFinish();
            }}
            disabled={topicCount === 0 || submitting}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Looks correct"
          >
            <Text style={styles.primaryButtonText}>Looks correct</Text>
          </TouchableOpacity>
        </View>
      </>
    );
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

    if (view === "availability") return renderAvailabilityView();

    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.stepScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {view === "backlog"
            ? renderBacklogView()
            : view === "review"
              ? renderReviewView()
              : renderConfirmView()}
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
  primaryButtonFlex: { flex: 1, marginTop: 0 },
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
  card: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    width: "100%",
  },
  commitmentRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardBody: { flex: 1 },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#1A1A1A" },
  cardMeta: { fontSize: 13, color: "#666", marginBottom: 4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12 },
  dayChip: {
    minHeight: 44,
    paddingHorizontal: 10,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    backgroundColor: "#F8FAFC",
    marginRight: 6,
    marginBottom: 6,
  },
  dayChipActive: { backgroundColor: "#DBEAFE", borderColor: "#2563EB" },
  dayChipText: { fontSize: 13, color: "#475569", fontWeight: "500" },
  dayChipTextActive: { color: "#1D4ED8", fontWeight: "700" },
  timeRow: { flexDirection: "row", gap: 12 },
  timeField: { flex: 1 },
  fieldLabel: {
    fontSize: 13,
    color: "#666",
    fontWeight: "600",
    marginBottom: 6,
  },
  timeBtn: {
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  timeBtnText: { fontSize: 15, fontWeight: "600", color: "#1A1A1A" },
  addBtn: {
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2563EB",
    borderStyle: "dashed",
    backgroundColor: "#EFF6FF",
    marginBottom: 12,
  },
  addBtnText: { fontSize: 15, fontWeight: "600", color: "#1D4ED8" },
  deleteBtn: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  deleteText: { fontSize: 18, color: "#94A3B8" },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12 },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    backgroundColor: "#F8FAFC",
    marginRight: 6,
    marginBottom: 6,
  },
  typeDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  typeLabel: { fontSize: 13, color: "#475569" },
  input: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1A1A1A",
    marginBottom: 12,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    gap: 16,
  },
  stepperBtn: {
    width: 48,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 24,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  stepperBtnText: { fontSize: 22, color: "#1D4ED8", fontWeight: "600" },
  stepperValue: { fontSize: 17, fontWeight: "700", color: "#1A1A1A" },
  errorText: {
    color: "#DC2626",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 8,
  },
});
