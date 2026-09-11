import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";

import { useCourses, useCreateCourse } from "@/services/hooks";
import type { Course, BacklogItem } from "@/services/types";
import {
  DIFFICULTIES,
  DUE_CHIPS,
  difficultyFromPriority,
  priorityFromDifficulty,
  dueDateForChip,
  chipForDate,
  formatDueDate,
  type Difficulty,
  type DueChip,
} from "@/lib/coaching";
import { COURSE_COLORS } from "@/lib/onboarding";

interface BacklogFormProps {
  initial?: BacklogItem;
  saving: boolean;
  submitLabel: string;
  onSubmit: (data: {
    title: string;
    course_id: string;
    priority: number;
    due_date: string | null;
    estimated_minutes: number | null;
    description: string | null;
  }) => void;
}

export function BacklogForm({
  initial,
  saving,
  submitLabel,
  onSubmit,
}: BacklogFormProps) {
  const { data: courses = [], isLoading: coursesLoading } = useCourses();
  const createCourse = useCreateCourse();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [courseId, setCourseId] = useState(initial?.course_id ?? "");
  const [difficulty, setDifficulty] = useState<Difficulty>(
    initial ? difficultyFromPriority(initial.priority) : "medium",
  );
  const [dueChip, setDueChip] = useState<DueChip | null>(
    initial?.due_date ? (chipForDate(initial.due_date) ?? "custom") : null,
  );
  const [customDate, setCustomDate] = useState<Date | null>(
    initial?.due_date ? new Date(initial.due_date) : null,
  );
  const [estMinutes, setEstMinutes] = useState(
    initial?.estimated_minutes?.toString() ?? "",
  );
  const [description, setDescription] = useState(
    initial?.description ?? "",
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCoursePicker, setShowCoursePicker] = useState(false);
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseColor, setNewCourseColor] = useState(COURSE_COLORS[0]);

  const trimmedTitle = title.trim();
  const valid = trimmedTitle.length > 0 && trimmedTitle.length <= 255 && !!courseId;

  function resolveDueDate(): string | null {
    if (dueChip === "custom" && customDate) {
      return customDate.toISOString();
    }
    if (dueChip === "today" || dueChip === "tomorrow" || dueChip === "week") {
      return dueDateForChip(dueChip) + "T00:00:00.000Z";
    }
    return null;
  }

  function handleSubmit() {
    if (!valid || saving) return;
    const est = estMinutes.trim();
    const estNum = est ? Math.max(5, Math.min(1440, parseInt(est, 10) || 0)) : null;
    onSubmit({
      title: trimmedTitle,
      course_id: courseId,
      priority: priorityFromDifficulty(difficulty),
      due_date: resolveDueDate(),
      estimated_minutes: estNum,
      description: description.trim() || null,
    });
  }

  function handleDateChange(_event: DateTimePickerEvent, selectedDate?: Date) {
    setShowDatePicker(false);
    if (selectedDate) {
      setCustomDate(selectedDate);
      setDueChip("custom");
    }
  }

  const selectedCourse = courses.find((c) => c.id === courseId);

  async function handleCreateCourse() {
    if (!newCourseName.trim() || createCourse.isPending) return;
    try {
      const course = await createCourse.mutateAsync({
        name: newCourseName.trim(),
        color: newCourseColor,
      });
      setCourseId(course.id);
      setNewCourseName("");
      setNewCourseColor(COURSE_COLORS[0]);
      setCreatingCourse(false);
      setShowCoursePicker(false);
    } catch {
      // error handled by mutation
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Title */}
      <Text style={styles.label}>Task name</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="What do you need to do?"
        placeholderTextColor="#64748B"
        maxLength={255}
        autoFocus={!initial}
      />

      {/* Course selector */}
      <Text style={styles.label}>Subject</Text>
      <TouchableOpacity
        style={styles.pickerButton}
        onPress={() => setShowCoursePicker(!showCoursePicker)}
        activeOpacity={0.7}
      >
        {coursesLoading ? (
          <ActivityIndicator size="small" color="#94A3B8" />
        ) : selectedCourse ? (
          <View style={styles.pickerRow}>
            <View
              style={[styles.courseDot, { backgroundColor: selectedCourse.color }]}
            />
            <Text style={styles.pickerText}>{selectedCourse.name}</Text>
          </View>
        ) : (
          <Text style={styles.pickerPlaceholder}>Select a subject</Text>
        )}
        <Text style={styles.chevron}>{showCoursePicker ? "\u25B2" : "\u25BC"}</Text>
      </TouchableOpacity>

      {showCoursePicker && (
        <View style={styles.courseList}>
          {creatingCourse ? (
            <View style={styles.createCourseForm}>
              <TextInput
                style={styles.input}
                value={newCourseName}
                onChangeText={setNewCourseName}
                placeholder="Subject name"
                placeholderTextColor="#64748B"
                autoFocus
                maxLength={255}
              />
              <View style={styles.colorPalette}>
                {COURSE_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.colorCircle,
                      { backgroundColor: c },
                      newCourseColor === c && styles.colorCircleSelected,
                    ]}
                    onPress={() => setNewCourseColor(c)}
                    activeOpacity={0.7}
                  />
                ))}
              </View>
              <View style={styles.createCourseActions}>
                <TouchableOpacity
                  style={styles.createCancelBtn}
                  onPress={() => {
                    setCreatingCourse(false);
                    setNewCourseName("");
                    setNewCourseColor(COURSE_COLORS[0]);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.createCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.createSubmitBtn,
                    (!newCourseName.trim() || createCourse.isPending) &&
                      styles.createSubmitDisabled,
                  ]}
                  onPress={handleCreateCourse}
                  disabled={!newCourseName.trim() || createCourse.isPending}
                  activeOpacity={0.8}
                >
                  {createCourse.isPending ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.createSubmitText}>Create</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              {courses.length === 0 && (
                <Text style={styles.emptyCourseText}>No subjects yet.</Text>
              )}
              {courses.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.courseOption,
                    c.id === courseId && styles.courseOptionSelected,
                  ]}
                  onPress={() => {
                    setCourseId(c.id);
                    setShowCoursePicker(false);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.courseDot, { backgroundColor: c.color }]} />
                  <Text
                    style={[
                      styles.courseOptionText,
                      c.id === courseId && styles.courseOptionTextSelected,
                    ]}
                  >
                    {c.name}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.addSubjectButton}
                onPress={() => setCreatingCourse(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.addSubjectText}>+ Add Subject</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* Difficulty */}
      <Text style={styles.label}>Difficulty</Text>
      <View style={styles.segmentedRow}>
        {DIFFICULTIES.map((d) => (
          <TouchableOpacity
            key={d.value}
            style={[
              styles.segmentedButton,
              difficulty === d.value && styles.segmentedButtonActive,
              difficulty === d.value &&
                (d.value === "hard"
                  ? styles.segmentedHard
                  : d.value === "easy"
                    ? styles.segmentedEasy
                    : styles.segmentedMedium),
            ]}
            onPress={() => setDifficulty(d.value)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.segmentedText,
                difficulty === d.value && styles.segmentedTextActive,
              ]}
            >
              {d.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Due date chips */}
      <Text style={styles.label}>Due</Text>
      <View style={styles.chipRow}>
        {DUE_CHIPS.map((chip) => (
          <TouchableOpacity
            key={chip.value}
            style={[
              styles.chip,
              dueChip === chip.value && styles.chipActive,
            ]}
            onPress={() => {
              if (chip.value === "custom") {
                setShowDatePicker(true);
              } else {
                setDueChip(dueChip === chip.value ? null : chip.value);
              }
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.chipText,
                dueChip === chip.value && styles.chipTextActive,
              ]}
            >
              {chip.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {dueChip === "custom" && customDate && (
        <Text style={styles.datePreview}>{formatDueDate(customDate.toISOString())}</Text>
      )}

      {showDatePicker && (
        <DateTimePicker
          value={customDate ?? new Date()}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={handleDateChange}
          minimumDate={new Date()}
        />
      )}

      {/* Advanced section */}
      <View style={styles.advancedSection}>
        <Text style={styles.label}>Est. minutes (optional)</Text>
        <TextInput
          style={styles.input}
          value={estMinutes}
          onChangeText={setEstMinutes}
          placeholder="Leave blank to auto-estimate"
          placeholderTextColor="#64748B"
          keyboardType="numeric"
          maxLength={4}
        />

        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Anything your teacher said..."
          placeholderTextColor="#64748B"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </View>

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitButton, (!valid || saving) && styles.submitDisabled]}
        onPress={handleSubmit}
        disabled={!valid || saving}
        activeOpacity={0.8}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>{submitLabel}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#94A3B8",
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#F8FAFC",
  },
  textArea: { minHeight: 80 },
  pickerButton: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pickerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  pickerText: { fontSize: 16, color: "#F8FAFC" },
  pickerPlaceholder: { fontSize: 16, color: "#64748B" },
  chevron: { fontSize: 12, color: "#64748B" },
  courseDot: { width: 10, height: 10, borderRadius: 5 },
  courseList: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    marginTop: 4,
    overflow: "hidden",
  },
  courseOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  courseOptionSelected: { backgroundColor: "#334155" },
  courseOptionText: { fontSize: 15, color: "#CBD5E1" },
  courseOptionTextSelected: { color: "#F8FAFC", fontWeight: "600" },
  emptyCourseText: {
    fontSize: 14,
    color: "#64748B",
    paddingHorizontal: 16,
    paddingVertical: 12,
    textAlign: "center",
  },
  addSubjectButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#334155",
  },
  addSubjectText: { fontSize: 14, color: "#3B82F6", fontWeight: "600" },
  createCourseForm: {
    padding: 12,
    gap: 12,
  },
  colorPalette: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  colorCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  colorCircleSelected: {
    borderWidth: 3,
    borderColor: "#F8FAFC",
  },
  createCourseActions: {
    flexDirection: "row",
    gap: 8,
  },
  createCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#334155",
  },
  createCancelText: { fontSize: 14, color: "#CBD5E1" },
  createSubmitBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#3B82F6",
  },
  createSubmitDisabled: { opacity: 0.5 },
  createSubmitText: { fontSize: 14, color: "#FFF", fontWeight: "600" },
  segmentedRow: {
    flexDirection: "row",
    gap: 8,
  },
  segmentedButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
  },
  segmentedButtonActive: { borderWidth: 2 },
  segmentedHard: { borderColor: "#EF4444", backgroundColor: "rgba(239,68,68,0.1)" },
  segmentedMedium: { borderColor: "#F59E0B", backgroundColor: "rgba(245,158,11,0.1)" },
  segmentedEasy: { borderColor: "#22C55E", backgroundColor: "rgba(34,197,94,0.1)" },
  segmentedText: { fontSize: 14, color: "#94A3B8" },
  segmentedTextActive: { color: "#F8FAFC", fontWeight: "600" },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
  },
  chipActive: {
    backgroundColor: "#3B82F6",
    borderColor: "#3B82F6",
  },
  chipText: { fontSize: 13, color: "#94A3B8" },
  chipTextActive: { color: "#FFF", fontWeight: "600" },
  datePreview: {
    fontSize: 13,
    color: "#3B82F6",
    marginTop: 8,
    fontWeight: "500",
  },
  advancedSection: { marginTop: 8 },
  submitButton: {
    backgroundColor: "#3B82F6",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
});
