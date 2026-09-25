import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";

import {
  DIFFICULTIES,
  DUE_CHIPS,
  chipForDate,
  difficultyFromPriority,
  dueDateForChip,
  formatDueDate,
  formatMinutes,
  priorityFromDifficulty,
} from "@/lib/coaching";
import { DEFAULT_SUBJECT, type TaskDraft } from "@/lib/backlogInterpret";

const ESTIMATE_CHIPS = [15, 30, 45, 60, 90];
type SimpleDueChip = "today" | "tomorrow" | "week";
const DUE_CHIP_VALUES: { value: SimpleDueChip; label: string }[] =
  DUE_CHIPS.filter(
    (chip): chip is { value: SimpleDueChip; label: string } =>
      chip.value === "today" || chip.value === "tomorrow" || chip.value === "week",
  );

interface TaskReviewCardProps {
  task: TaskDraft;
  index: number;
  subject: string;
  subjectUncertain: boolean;
  courseNames: string[];
  onUpdate: (patch: Partial<TaskDraft>) => void;
  onSubjectChange: (subject: string) => void;
  onMove: (targetSubject: string) => void;
  onDelete: () => void;
}

export function TaskReviewCard({
  task,
  index,
  subject,
  subjectUncertain,
  courseNames,
  onUpdate,
  onSubjectChange,
  onMove,
  onDelete,
}: TaskReviewCardProps) {
  const ownName = subject.trim() || DEFAULT_SUBJECT;
  const otherCourses = courseNames.filter(
    (name) => name.trim().toLowerCase() !== ownName.toLowerCase(),
  );
  const dueChip = chipForDate(task.due_date);
  const difficulty = difficultyFromPriority(task.priority);
  const estimateValues =
    task.estimated_minutes === null ||
    ESTIMATE_CHIPS.includes(task.estimated_minutes)
      ? ESTIMATE_CHIPS
      : [...ESTIMATE_CHIPS, task.estimated_minutes].sort((a, b) => a - b);

  const label = (text: string) => `${text}, task ${index + 1}`;

  return (
    <View style={styles.card} testID={`review-card-${index}`}>
      <View style={styles.chipRow}>
        <TextInput
          style={[styles.subjectInput, subjectUncertain && styles.subjectPlaceholder]}
          value={subject}
          onChangeText={onSubjectChange}
          placeholder="Add a subject"
          placeholderTextColor="#94A3B8"
          maxLength={60}
          accessibilityLabel={label("Subject")}
          accessibilityHint="Renames the subject shared by these tasks"
          testID={`task-subject-${index}`}
        />
        {otherCourses.map((name) => (
          <TouchableOpacity
            key={name}
            style={styles.chip}
            onPress={() => onMove(name)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={label(`Move to ${name}`)}
            testID={`task-move-${index}-${name}`}
          >
            <Text style={styles.chipText} numberOfLines={1}>
              {name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput
        style={styles.titleInput}
        value={task.title}
        onChangeText={(value) => onUpdate({ title: value })}
        placeholder="What needs doing?"
        placeholderTextColor="#94A3B8"
        maxLength={200}
        accessibilityLabel={label("Task title")}
        testID={`task-title-${index}`}
      />

      <View style={styles.chipRow}>
        {DUE_CHIP_VALUES.map((chip) => (
          <TouchableOpacity
            key={chip.value}
            style={[styles.chip, dueChip === chip.value && styles.chipActive]}
            onPress={() =>
              onUpdate({ due_date: dueDateForChip(chip.value, new Date()) })
            }
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={label(`${chip.label} due date`)}
            accessibilityState={{ selected: dueChip === chip.value }}
            testID={`task-due-${index}-${chip.value}`}
          >
            <Text
              style={[styles.chipText, dueChip === chip.value && styles.chipTextActive]}
            >
              {chip.label}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.chip, !task.due_date && styles.chipActive]}
          onPress={() => onUpdate({ due_date: null })}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={label("No due date")}
          accessibilityState={{ selected: !task.due_date }}
          testID={`task-due-${index}-none`}
        >
          <Text style={[styles.chipText, !task.due_date && styles.chipTextActive]}>
            None
          </Text>
        </TouchableOpacity>
        {task.due_date && dueChip === "custom" ? (
          <Text style={styles.dueCustomLabel}>{formatDueDate(task.due_date)}</Text>
        ) : null}
      </View>

      <View style={styles.chipRow}>
        {DIFFICULTIES.map((option) => {
          const selected = difficulty === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.chip, selected && styles.chipActive]}
              onPress={() => onUpdate({ priority: priorityFromDifficulty(option.value) })}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={label(`${option.label} difficulty`)}
              accessibilityState={{ selected }}
              testID={`task-difficulty-${index}-${option.value}`}
            >
              <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.chipRow}>
        <TouchableOpacity
          style={[styles.chip, task.estimated_minutes === null && styles.chipActive]}
          onPress={() => onUpdate({ estimated_minutes: null })}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={label("Auto estimate")}
          accessibilityState={{ selected: task.estimated_minutes === null }}
          testID={`task-est-${index}-auto`}
        >
          <Text
            style={[
              styles.chipText,
              task.estimated_minutes === null && styles.chipTextActive,
            ]}
          >
            Auto
          </Text>
        </TouchableOpacity>
        {estimateValues.map((minutes) => {
          const selected = task.estimated_minutes === minutes;
          return (
            <TouchableOpacity
              key={minutes}
              style={[styles.chip, selected && styles.chipActive]}
              onPress={() => onUpdate({ estimated_minutes: minutes })}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={label(`Estimated ${formatMinutes(minutes)}`)}
              accessibilityState={{ selected }}
              testID={`task-est-${index}-${minutes}`}
            >
              <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                {formatMinutes(minutes)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.notesRow}>
        <TextInput
          style={styles.notesInput}
          value={task.description ?? ""}
          onChangeText={(value) =>
            onUpdate({ description: value.trim() ? value : null })
          }
          placeholder="Notes (e.g. 20 questions)"
          placeholderTextColor="#94A3B8"
          maxLength={200}
          accessibilityLabel={label("Notes")}
          testID={`task-notes-${index}`}
        />
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={onDelete}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={label(`Delete task ${task.title || "untitled"}`)}
          testID={`task-delete-${index}`}
        >
          <Text style={styles.deleteText}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    width: "100%",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    marginBottom: 8,
  },
  subjectInput: {
    minHeight: 44,
    minWidth: 110,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    color: "#1D4ED8",
    fontSize: 14,
    fontWeight: "600",
    marginRight: 6,
    marginBottom: 6,
  },
  subjectPlaceholder: {
    color: "#94A3B8",
    fontWeight: "500",
  },
  titleInput: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    backgroundColor: "#F8FAFC",
    color: "#1A1A1A",
    fontSize: 15,
    marginBottom: 10,
  },
  chip: {
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    backgroundColor: "#F8FAFC",
    marginRight: 6,
    marginBottom: 6,
  },
  chipActive: {
    backgroundColor: "#DBEAFE",
    borderColor: "#2563EB",
  },
  chipText: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "500",
  },
  chipTextActive: {
    color: "#1D4ED8",
    fontWeight: "700",
  },
  dueCustomLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "600",
    marginLeft: 4,
    marginBottom: 6,
  },
  notesRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  notesInput: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    backgroundColor: "#F8FAFC",
    color: "#1A1A1A",
    fontSize: 14,
    marginRight: 8,
  },
  deleteBtn: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  deleteText: {
    fontSize: 16,
    color: "#DC2626",
    fontWeight: "600",
  },
});
