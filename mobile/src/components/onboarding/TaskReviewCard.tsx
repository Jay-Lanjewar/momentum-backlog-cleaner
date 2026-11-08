import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";

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
import { useTheme } from "@/theme/ThemeProvider";

const ESTIMATE_CHIPS = [15, 30, 45, 60, 90];
type DueSelection = "today" | "tomorrow" | "week" | "custom" | "none";
const DUE_CHIP_VALUES: {
  value: Exclude<DueSelection, "none" | "custom">;
  label: string;
}[] = DUE_CHIPS.filter(
  (chip): chip is {
    value: Exclude<DueSelection, "none" | "custom">;
    label: string;
  } => chip.value === "today" || chip.value === "tomorrow" || chip.value === "week",
);

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

interface TaskReviewCardProps {
  task: TaskDraft;
  index: number;
  subject: string;
  subjectUncertain: boolean;
  courseNames: string[];
  isGroupHead?: boolean;
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
  isGroupHead = true,
  onUpdate,
  onSubjectChange,
  onMove,
  onDelete,
}: TaskReviewCardProps) {
  const { colors } = useTheme();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [customPickerOpen, setCustomPickerOpen] = useState(false);
  const ownName = subject.trim() || DEFAULT_SUBJECT;
  const otherCourses = courseNames.filter(
    (name) => name.trim().toLowerCase() !== ownName.toLowerCase(),
  );
  const inferredDueSelection: DueSelection = task.due_date
    ? chipForDate(task.due_date) ?? "custom"
    : "none";
  const dueSelection = task.due_selection ?? inferredDueSelection;
  const difficulty = difficultyFromPriority(task.priority);
  const estimateValues =
    task.estimated_minutes === null ||
    ESTIMATE_CHIPS.includes(task.estimated_minutes)
      ? ESTIMATE_CHIPS
      : [...ESTIMATE_CHIPS, task.estimated_minutes].sort((a, b) => a - b);

  const label = (text: string) => `${text}, task ${index + 1}`;

  const difficultyLabel =
    DIFFICULTIES.find((option) => option.value === difficulty)?.label ?? "";
  const estimateLabel =
    task.estimated_minutes === null
      ? "Auto"
      : formatMinutes(task.estimated_minutes);
  const summaryParts = [difficultyLabel, estimateLabel];
  if (task.description?.trim()) {
    summaryParts.push("Note added");
  }
  const summary = summaryParts.join(" · ");

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID={`review-card-${index}`}>
      <View style={styles.chipRow}>
        {isGroupHead ? (
          <>
            <TextInput
              style={[
                styles.subjectInput,
                { backgroundColor: colors.accentSoft, borderColor: colors.accent, color: colors.accentSoftForeground },
                subjectUncertain && styles.subjectPlaceholder,
              ]}
              value={subject}
              onChangeText={onSubjectChange}
              placeholder="Add a subject"
              placeholderTextColor={colors.placeholder}
              maxLength={60}
              accessibilityLabel={label("Subject")}
              accessibilityHint="Renames the subject shared by these tasks"
              testID={`task-subject-${index}`}
            />
            {otherCourses.map((name) => (
              <TouchableOpacity
                key={name}
                style={[styles.chip, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}
                onPress={() => onMove(name)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={label(`Move to ${name}`)}
                testID={`task-move-${index}-${name}`}
              >
                <Text style={[styles.chipText, { color: colors.secondaryText }]} numberOfLines={1}>
                  {name}
                </Text>
              </TouchableOpacity>
            ))}
          </>
        ) : (
          <Text
            style={[styles.subjectBadge, { backgroundColor: colors.pressed, borderColor: colors.border, color: colors.mutedText }]}
            accessibilityRole="text"
            accessibilityLabel={`${ownName}, subject for task ${index + 1}`}
            testID={`task-subject-badge-${index}`}
          >
            {ownName}
          </Text>
        )}
      </View>

      <TextInput
        style={[styles.titleInput, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.primaryText }]}
        value={task.title}
        onChangeText={(value) => onUpdate({ title: value })}
        placeholder="What needs doing?"
        placeholderTextColor={colors.placeholder}
        maxLength={200}
        accessibilityLabel={label("Task title")}
        testID={`task-title-${index}`}
      />

      <View style={styles.chipRow}>
        {DUE_CHIP_VALUES.map((chip) => (
          <TouchableOpacity
            key={chip.value}
            style={[styles.chip, { backgroundColor: colors.inputBackground, borderColor: colors.border }, dueSelection === chip.value && { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
            onPress={() => {
              onUpdate({
                due_date: dueDateForChip(chip.value, new Date()),
                due_selection: chip.value,
              });
              setCustomPickerOpen(false);
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={label(`${chip.label} due date`)}
            accessibilityState={{ selected: dueSelection === chip.value }}
            testID={`task-due-${index}-${chip.value}`}
          >
            <Text
              style={[styles.chipText, { color: dueSelection === chip.value ? colors.accentSoftForeground : colors.secondaryText }, dueSelection === chip.value && styles.chipTextActive]}
            >
              {chip.label}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.chip, { backgroundColor: colors.inputBackground, borderColor: colors.border }, dueSelection === "none" && { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
          onPress={() => {
            onUpdate({ due_date: null, due_selection: "none" });
            setCustomPickerOpen(false);
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={label("No due date")}
          accessibilityState={{ selected: dueSelection === "none" }}
          testID={`task-due-${index}-none`}
        >
          <Text style={[styles.chipText, { color: dueSelection === "none" ? colors.accentSoftForeground : colors.secondaryText }, dueSelection === "none" && styles.chipTextActive]}>
            None
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, { backgroundColor: colors.inputBackground, borderColor: colors.border }, dueSelection === "custom" && { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
          onPress={() => setCustomPickerOpen(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={label("Custom date")}
          accessibilityState={{ selected: dueSelection === "custom" }}
          testID={`task-due-${index}-custom`}
        >
          <Text style={[styles.chipText, { color: dueSelection === "custom" ? colors.accentSoftForeground : colors.secondaryText }, dueSelection === "custom" && styles.chipTextActive]}>
            Custom date
          </Text>
        </TouchableOpacity>
        {customPickerOpen ? (
          <DateTimePicker
            testID={`task-due-${index}-custom-picker`}
            value={task.due_date ? new Date(`${task.due_date}T12:00:00`) : new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(event: DateTimePickerEvent, selectedDate?: Date) => {
              if (event.type === "dismissed") {
                setCustomPickerOpen(false);
                return;
              }
              if (selectedDate) {
                onUpdate({
                  due_date: dateKey(selectedDate),
                  due_selection: "custom",
                });
              }
              if (Platform.OS !== "ios") setCustomPickerOpen(false);
            }}
          />
        ) : null}
        {task.due_date && dueSelection === "custom" ? (
          <Text style={[styles.dueCustomLabel, { color: colors.mutedText }]}>{formatDueDate(task.due_date)}</Text>
        ) : null}
      </View>

      {detailsOpen ? null : (
        <Text
          style={[styles.detailsSummary, { color: colors.mutedText }]}
          testID={`task-details-summary-${index}`}
        >
          {summary}
        </Text>
      )}

      <View style={styles.detailsRow}>
        <TouchableOpacity
          style={[
            styles.detailsToggle,
            { backgroundColor: colors.inputBackground, borderColor: colors.border },
          ]}
          onPress={() => setDetailsOpen((open) => !open)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={label(
            detailsOpen ? "Hide details" : "Show details",
          )}
          accessibilityState={{ expanded: detailsOpen }}
          testID={`task-details-toggle-${index}`}
        >
          <Text style={[styles.detailsToggleText, { color: colors.secondaryText }]}>Details</Text>
          <Text style={[styles.chevron, { color: colors.mutedText }]}>
            {detailsOpen ? "\u25B2" : "\u25BC"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.deleteBtn,
            { backgroundColor: colors.inputBackground, borderColor: colors.border },
          ]}
          onPress={onDelete}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={label(`Delete task ${task.title || "untitled"}`)}
          testID={`task-delete-${index}`}
        >
          <Text style={[styles.deleteText, { color: colors.error }]}>✕</Text>
        </TouchableOpacity>
      </View>

      {detailsOpen ? (
        <>
          <View style={styles.chipRow}>
            {DIFFICULTIES.map((option) => {
              const selected = difficulty === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.chip, { backgroundColor: colors.inputBackground, borderColor: colors.border }, selected && { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
                  onPress={() =>
                    onUpdate({ priority: priorityFromDifficulty(option.value) })
                  }
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={label(`${option.label} difficulty`)}
                  accessibilityState={{ selected }}
                  testID={`task-difficulty-${index}-${option.value}`}
                >
                  <Text
                    style={[styles.chipText, { color: selected ? colors.accentSoftForeground : colors.secondaryText }, selected && styles.chipTextActive]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.chipRow}>
            <TouchableOpacity
              style={[
                styles.chip,
                { backgroundColor: colors.inputBackground, borderColor: colors.border },
                task.estimated_minutes === null && { backgroundColor: colors.accentSoft, borderColor: colors.accent },
              ]}
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
                  { color: task.estimated_minutes === null ? colors.accentSoftForeground : colors.secondaryText },
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
                  style={[styles.chip, { backgroundColor: colors.inputBackground, borderColor: colors.border }, selected && { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
                  onPress={() => onUpdate({ estimated_minutes: minutes })}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={label(`Estimated ${formatMinutes(minutes)}`)}
                  accessibilityState={{ selected }}
                  testID={`task-est-${index}-${minutes}`}
                >
                  <Text
                    style={[styles.chipText, { color: selected ? colors.accentSoftForeground : colors.secondaryText }, selected && styles.chipTextActive]}
                  >
                    {formatMinutes(minutes)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.notesRow}>
            <TextInput
              style={[styles.notesInput, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.primaryText }]}
              value={task.description ?? ""}
              onChangeText={(value) =>
                onUpdate({ description: value.trim() ? value : null })
              }
              placeholder="Notes (e.g. 20 questions)"
              placeholderTextColor={colors.placeholder}
              maxLength={200}
              accessibilityLabel={label("Notes")}
              testID={`task-notes-${index}`}
            />
          </View>
        </>
      ) : null}
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
    fontWeight: "500",
  },
  subjectBadge: {
    minHeight: 32,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F1F5F9",
    color: "#64748B",
    fontSize: 14,
    fontWeight: "600",
    marginRight: 6,
    marginBottom: 6,
    overflow: "hidden",
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
  detailsSummary: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 8,
  },
  detailsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  detailsToggle: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    backgroundColor: "#F8FAFC",
    marginRight: 6,
  },
  detailsToggleText: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "600",
  },
  chevron: {
    fontSize: 12,
    color: "#64748B",
    marginLeft: 6,
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
