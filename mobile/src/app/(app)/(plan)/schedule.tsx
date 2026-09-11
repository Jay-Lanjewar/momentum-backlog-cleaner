import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  ActivityIndicator,
  Platform,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";

import { useWeeklySchedule, useSaveWeeklySchedule } from "@/services/hooks";
import type {
  BlockType,
  DayName,
  WeeklyBlock,
  WeeklyScheduleUpdatePayload,
} from "@/services/types";
import {
  BLOCK_TYPES,
  BLOCK_TYPE_MAP,
  DAYS,
  DAY_LABELS,
  DAY_FULL_LABELS,
  getCurrentDayName,
  formatTime12h,
  isValidTimeRange,
  hasOverlap,
} from "@/lib/schedule";

type ScheduleMap = Partial<Record<DayName, WeeklyBlock[]>>;

function timeToDate(time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function dateToTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function ScheduleScreen() {
  const { data: scheduleData, isLoading } = useWeeklySchedule();
  const saveSchedule = useSaveWeeklySchedule();

  const [localSchedule, setLocalSchedule] = useState<ScheduleMap>({});
  const [selectedDay, setSelectedDay] = useState<DayName>(getCurrentDayName());
  const [hasChanges, setHasChanges] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (scheduleData?.schedule) {
      setLocalSchedule(scheduleData.schedule);
    }
  }, [scheduleData?.schedule]);

  const blocks: WeeklyBlock[] = localSchedule[selectedDay] ?? [];

  const updateBlocks = useCallback(
    (day: DayName, newBlocks: WeeklyBlock[]) => {
      setLocalSchedule((prev) => ({ ...prev, [day]: newBlocks }));
      setHasChanges(true);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    try {
      const payload: WeeklyScheduleUpdatePayload = {
        schedule: localSchedule,
      };
      await saveSchedule.mutateAsync(payload);
      setHasChanges(false);
    } catch {
      Alert.alert("Error", "Failed to save schedule. Please try again.");
    }
  }, [localSchedule, saveSchedule]);

  const handleDelete = useCallback(() => {
    if (deletingIndex === null) return;
    const newBlocks = [...blocks];
    newBlocks.splice(deletingIndex, 1);
    updateBlocks(selectedDay, newBlocks);
    setDeletingIndex(null);
  }, [deletingIndex, blocks, selectedDay, updateBlocks]);

  const handleAddBlock = useCallback(
    (block: WeeklyBlock) => {
      const newBlocks = [...blocks, block];
      newBlocks.sort((a, b) => a.start.localeCompare(b.start));
      updateBlocks(selectedDay, newBlocks);
    },
    [blocks, selectedDay, updateBlocks],
  );

  const handleEditBlock = useCallback(
    (block: WeeklyBlock) => {
      if (editingIndex === null) return;
      const newBlocks = [...blocks];
      newBlocks[editingIndex] = block;
      newBlocks.sort((a, b) => a.start.localeCompare(b.start));
      updateBlocks(selectedDay, newBlocks);
    },
    [editingIndex, blocks, selectedDay, updateBlocks],
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Weekly Schedule</Text>
        {hasChanges && (
          <TouchableOpacity
            style={[styles.saveBtn, saveSchedule.isPending && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saveSchedule.isPending}
            activeOpacity={0.8}
          >
            {saveSchedule.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Day Selector */}
      <View style={styles.dayBar}>
        {DAYS.map((day) => {
          const isToday = day === getCurrentDayName();
          const isSelected = day === selectedDay;
          const hasBlocks = (localSchedule[day]?.length ?? 0) > 0;
          return (
            <TouchableOpacity
              key={day}
              style={[styles.dayTab, isSelected && styles.dayTabActive]}
              onPress={() => setSelectedDay(day)}
              activeOpacity={0.7}
            >
              <Text style={[styles.dayLabel, isSelected && styles.dayLabelActive]}>
                {DAY_LABELS[day]}
              </Text>
              {isToday && <View style={styles.todayDot} />}
              {hasBlocks && !isSelected && <View style={styles.blocksDot} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Timeline */}
      <ScrollView style={styles.timeline} contentContainerStyle={styles.timelineContent}>
        <Text style={styles.dayTitle}>{DAY_FULL_LABELS[selectedDay]}</Text>

        {blocks.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No fixed commitments.</Text>
            <Text style={styles.emptyHint}>
              Add school, coaching, or other recurring blocks.
            </Text>
          </View>
        ) : (
          blocks.map((block, index) => {
            const info = BLOCK_TYPE_MAP.get(block.type);
            return (
              <TouchableOpacity
                key={`${block.start}-${block.end}-${block.type}-${index}`}
                style={styles.blockCard}
                onPress={() => {
                  setEditingIndex(index);
                  setShowForm(true);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.blockDot, { backgroundColor: info?.color ?? "#737373" }]} />
                <View style={styles.blockContent}>
                  <View style={styles.blockTop}>
                    <Text style={styles.blockType}>
                      {info?.label ?? block.type}
                    </Text>
                    {block.title ? (
                      <Text style={styles.blockTitle}>{block.title}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.blockTime}>
                    {formatTime12h(block.start)} – {formatTime12h(block.end)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.blockDeleteBtn}
                  onPress={() => setDeletingIndex(index)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.blockDeleteText}>✕</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Add Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          setEditingIndex(null);
          setShowForm(true);
        }}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Delete Confirmation */}
      {deletingIndex !== null && (
        <Modal transparent animationType="fade" onRequestClose={() => setDeletingIndex(null)}>
          <View style={styles.overlay}>
            <View style={styles.dialog}>
              <Text style={styles.dialogTitle}>Delete Block</Text>
              <Text style={styles.dialogBody}>
                Remove {BLOCK_TYPE_MAP.get(blocks[deletingIndex]?.type ?? "")?.label ?? "this block"} from {DAY_FULL_LABELS[selectedDay]}?
              </Text>
              <View style={styles.dialogActions}>
                <TouchableOpacity
                  style={styles.dialogCancel}
                  onPress={() => setDeletingIndex(null)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.dialogCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dialogDelete}
                  onPress={handleDelete}
                  activeOpacity={0.8}
                >
                  <Text style={styles.dialogDeleteText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Add / Edit Form */}
      <BlockFormModal
        visible={showForm}
        initial={editingIndex !== null ? blocks[editingIndex] : null}
        existingBlocks={blocks}
        excludeIndex={editingIndex ?? undefined}
        dayName={selectedDay}
        onSave={editingIndex !== null ? handleEditBlock : handleAddBlock}
        onClose={() => {
          setShowForm(false);
          setEditingIndex(null);
        }}
      />
    </SafeAreaView>
  );
}

// ─── Block Form Modal ───

function BlockFormModal({
  visible,
  initial,
  existingBlocks,
  excludeIndex,
  dayName,
  onSave,
  onClose,
}: {
  visible: boolean;
  initial: WeeklyBlock | null;
  existingBlocks: WeeklyBlock[];
  excludeIndex?: number;
  dayName: DayName;
  onSave: (block: WeeklyBlock) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<BlockType>(initial?.type ?? "school");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [start, setStart] = useState(initial?.start ?? "08:00");
  const [end, setEnd] = useState(initial?.end ?? "09:00");

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setType(initial?.type ?? "school");
      setTitle(initial?.title ?? "");
      setStart(initial?.start ?? "08:00");
      setEnd(initial?.end ?? "09:00");
    }
  }, [visible, initial]);

  const timeValid = isValidTimeRange(start, end);
  const overlap = hasOverlap(existingBlocks, start, end, excludeIndex);
  const canSave = timeValid && !overlap;

  const handleStartChange = useCallback(
    (_event: DateTimePickerEvent, selectedDate?: Date) => {
      if (Platform.OS === "android") setShowStartPicker(false);
      if (selectedDate) setStart(dateToTime(selectedDate));
    },
    [],
  );

  const handleEndChange = useCallback(
    (_event: DateTimePickerEvent, selectedDate?: Date) => {
      if (Platform.OS === "android") setShowEndPicker(false);
      if (selectedDate) setEnd(dateToTime(selectedDate));
    },
    [],
  );

  const handleSave = useCallback(() => {
    if (!canSave) return;
    onSave({ type, start, end, title: title.trim() || undefined });
    onClose();
  }, [canSave, type, start, end, title, onSave, onClose]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.formContainer}>
        <View style={styles.formHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.formCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.formTitle}>
            {initial ? "Edit Block" : "Add Block"}
          </Text>
          <TouchableOpacity onPress={handleSave} disabled={!canSave}>
            <Text style={[styles.formSave, !canSave && styles.formSaveDisabled]}>
              Save
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.formBody} contentContainerStyle={styles.formBodyContent}>
          {/* Block Type Grid */}
          <Text style={styles.fieldLabel}>Category</Text>
          <View style={styles.typeGrid}>
            {BLOCK_TYPES.map((bt) => (
              <TouchableOpacity
                key={bt.value}
                style={[
                  styles.typeChip,
                  type === bt.value && { backgroundColor: bt.color + "30", borderColor: bt.color },
                ]}
                onPress={() => setType(bt.value)}
                activeOpacity={0.7}
              >
                <View style={[styles.typeDot, { backgroundColor: bt.color }]} />
                <Text
                  style={[
                    styles.typeLabel,
                    type === bt.value && { color: bt.color, fontWeight: "600" },
                  ]}
                  numberOfLines={1}
                >
                  {bt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Title */}
          <Text style={styles.fieldLabel}>Name (optional)</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. AP Physics"
            placeholderTextColor="#64748b"
            maxLength={100}
          />

          {/* Start Time */}
          <Text style={styles.fieldLabel}>Start Time</Text>
          <TouchableOpacity
            style={styles.timeBtn}
            onPress={() => setShowStartPicker(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.timeBtnText}>{formatTime12h(start)}</Text>
          </TouchableOpacity>
          {showStartPicker && (
            <DateTimePicker
              value={timeToDate(start)}
              mode="time"
              is24Hour={false}
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={handleStartChange}
            />
          )}

          {/* End Time */}
          <Text style={styles.fieldLabel}>End Time</Text>
          <TouchableOpacity
            style={styles.timeBtn}
            onPress={() => setShowEndPicker(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.timeBtnText}>{formatTime12h(end)}</Text>
          </TouchableOpacity>
          {showEndPicker && (
            <DateTimePicker
              value={timeToDate(end)}
              mode="time"
              is24Hour={false}
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={handleEndChange}
            />
          )}

          {/* Validation */}
          {!timeValid && (
            <Text style={styles.errorText}>End time must be after start time.</Text>
          )}
          {timeValid && overlap && (
            <Text style={styles.errorText}>This block overlaps with an existing block.</Text>
          )}

          {/* Day Info */}
          <Text style={styles.fieldLabel}>Day</Text>
          <View style={styles.dayInfo}>
            <Text style={styles.dayInfoText}>{DAY_FULL_LABELS[dayName]}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 22, fontWeight: "700", color: "#F8FAFC" },
  saveBtn: {
    backgroundColor: "#3B82F6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },

  // Day Selector
  dayBar: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 4,
  },
  dayTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 8,
    position: "relative",
  },
  dayTabActive: { backgroundColor: "#334155" },
  dayLabel: { fontSize: 13, color: "#64748B", fontWeight: "500" },
  dayLabelActive: { color: "#F8FAFC", fontWeight: "700" },
  todayDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#3B82F6",
    marginTop: 3,
  },
  blocksDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#64748B",
    marginTop: 3,
  },

  // Timeline
  timeline: { flex: 1 },
  timelineContent: { paddingHorizontal: 20, paddingBottom: 100 },
  dayTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#CBD5E1",
    marginBottom: 12,
    marginTop: 4,
  },

  // Empty
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 48,
  },
  emptyText: { fontSize: 15, color: "#94A3B8", marginBottom: 4 },
  emptyHint: { fontSize: 13, color: "#64748B" },

  // Block Card
  blockCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#334155",
  },
  blockDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  blockContent: { flex: 1 },
  blockTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  blockType: { fontSize: 15, fontWeight: "600", color: "#F8FAFC" },
  blockTitle: { fontSize: 13, color: "#94A3B8" },
  blockTime: { fontSize: 13, color: "#64748B" },
  blockDeleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },
  blockDeleteText: { fontSize: 14, color: "#94A3B8" },

  // FAB
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabText: { fontSize: 28, color: "#fff", lineHeight: 30 },

  // Overlay / Dialog
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  dialog: {
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 320,
  },
  dialogTitle: { fontSize: 18, fontWeight: "700", color: "#F8FAFC", marginBottom: 8 },
  dialogBody: { fontSize: 14, color: "#94A3B8", marginBottom: 20, lineHeight: 20 },
  dialogActions: { flexDirection: "row", gap: 10 },
  dialogCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#334155",
  },
  dialogCancelText: { fontSize: 14, color: "#CBD5E1", fontWeight: "500" },
  dialogDelete: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#EF4444",
  },
  dialogDeleteText: { fontSize: 14, color: "#fff", fontWeight: "600" },

  // Form
  formContainer: { flex: 1, backgroundColor: "#0F172A" },
  formHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  formCancel: { fontSize: 16, color: "#3B82F6" },
  formTitle: { fontSize: 17, fontWeight: "600", color: "#F8FAFC" },
  formSave: { fontSize: 16, color: "#3B82F6", fontWeight: "600" },
  formSaveDisabled: { opacity: 0.4 },
  formBody: { flex: 1 },
  formBodyContent: { padding: 20 },

  // Fields
  fieldLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#94A3B8",
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: "#1E293B",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#F8FAFC",
  },

  // Type Grid
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    minWidth: 0,
  },
  typeDot: { width: 8, height: 8, borderRadius: 4 },
  typeLabel: { fontSize: 12, color: "#CBD5E1" },

  // Time
  timeBtn: {
    backgroundColor: "#1E293B",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  timeBtnText: { fontSize: 15, color: "#F8FAFC" },

  // Validation
  errorText: { fontSize: 13, color: "#EF4444", marginTop: 8 },

  // Day info
  dayInfo: {
    backgroundColor: "#1E293B",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dayInfoText: { fontSize: 15, color: "#F8FAFC" },
});
