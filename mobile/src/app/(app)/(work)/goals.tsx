import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";

import {
  useGoals,
  useCreateGoal,
  useUpdateGoal,
  useDeleteGoal,
} from "@/services/hooks";
import type { Goal } from "@/services/types";

const GOAL_TABS = [
  { value: "active", label: "Active" },
  { value: "achieved", label: "Achieved" },
] as const;

type GoalTabValue = (typeof GOAL_TABS)[number]["value"];

const GOAL_CATEGORIES = [
  "Academic",
  "Personal",
  "Health",
  "Career",
  "Other",
];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const months = [
    "Jan","Feb","Mar","Apr","May","Jun",
    "Jul","Aug","Sep","Oct","Nov","Dec",
  ];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

export default function GoalsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<GoalTabValue>("active");
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  const {
    data: goals = [],
    isLoading,
    isRefetching,
    refetch,
  } = useGoals(activeTab);
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const deleteGoal = useDeleteGoal();

  const handleCreate = useCallback(
    async (data: {
      title: string;
      description: string | null;
      target_date: string | null;
      category: string | null;
    }) => {
      await createGoal.mutateAsync(data);
      setShowForm(false);
    },
    [createGoal],
  );

  const handleUpdate = useCallback(
    async (data: {
      title: string;
      description: string | null;
      target_date: string | null;
      category: string | null;
      status?: "active" | "achieved" | "abandoned";
    }) => {
      if (!editingGoal) return;
      await updateGoal.mutateAsync({ id: editingGoal.id, payload: data });
      setEditingGoal(null);
    },
    [editingGoal, updateGoal],
  );

  const handleMarkAchieved = useCallback(
    async (goal: Goal) => {
      await updateGoal.mutateAsync({
        id: goal.id,
        payload: { status: "achieved" },
      });
    },
    [updateGoal],
  );

  const handleDelete = useCallback(
    async (goal: Goal) => {
      Alert.alert(
        "Delete Goal",
        `Are you sure you want to delete "${goal.title}"?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => deleteGoal.mutateAsync(goal.id),
          },
        ],
      );
    },
    [deleteGoal],
  );

  const renderItem = useCallback(
    ({ item }: { item: Goal }) => {
      const overdue =
        activeTab === "active" && isOverdue(item.target_date);

      return (
        <TouchableOpacity
          style={[styles.card, activeTab === "achieved" && styles.cardAchieved]}
          onPress={() => setEditingGoal(item)}
          activeOpacity={0.7}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.title}
            </Text>
            {activeTab === "active" && (
              <TouchableOpacity
                style={styles.achieveBtn}
                onPress={() => handleMarkAchieved(item)}
                activeOpacity={0.7}
              >
                <Text style={styles.achieveBtnText}>Achieve</Text>
              </TouchableOpacity>
            )}
          </View>

          {item.description ? (
            <Text style={styles.cardDesc} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}

          <View style={styles.cardMeta}>
            {item.category ? (
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{item.category}</Text>
              </View>
            ) : null}
            {item.target_date ? (
              <Text
                style={[styles.dateText, overdue && styles.dateOverdue]}
              >
                {overdue ? "Overdue" : formatDate(item.target_date)}
              </Text>
            ) : null}
          </View>

          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => handleDelete(item)}
            activeOpacity={0.7}
          >
            <Text style={styles.deleteBtnText}>Delete</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      );
    },
    [activeTab, handleMarkAchieved, handleDelete],
  );

  const keyExtractor = useCallback((item: Goal) => item.id, []);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.backText}>{"< Back"}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Goals</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowForm(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {GOAL_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.value}
            style={[styles.tab, activeTab === tab.value && styles.tabActive]}
            onPress={() => setActiveTab(tab.value)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab.value && styles.tabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          {[1, 2, 3].map((n) => (
            <View key={n} style={styles.skeletonCard}>
              <View style={[styles.skeletonLine, { width: "70%" }]} />
              <View style={[styles.skeletonLine, { width: "40%" }]} />
            </View>
          ))}
        </View>
      ) : goals.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>
            {activeTab === "active"
              ? "No active goals."
              : "No achieved goals yet."}
          </Text>
          <Text style={styles.emptyBody}>
            {activeTab === "active"
              ? "Set goals to stay motivated and track your progress."
              : "Achieve a goal and it will appear here."}
          </Text>
          {activeTab === "active" && (
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => setShowForm(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.emptyButtonText}>+ Add Goal</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={goals}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor="#64748B"
              colors={["#3B82F6"]}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Create Modal */}
      <Modal
        visible={showForm}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowForm(false)}
      >
        <GoalFormModal
          title="Add Goal"
          saving={createGoal.isPending}
          onSave={handleCreate}
          onClose={() => setShowForm(false)}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal
        visible={!!editingGoal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditingGoal(null)}
      >
        <GoalFormModal
          title="Edit Goal"
          initial={editingGoal}
          saving={updateGoal.isPending}
          onSave={handleUpdate}
          onClose={() => setEditingGoal(null)}
        />
      </Modal>
    </SafeAreaView>
  );
}

// ─── Goal Form Modal ───

function GoalFormModal({
  title,
  initial,
  saving,
  onSave,
  onClose,
}: {
  title: string;
  initial?: Goal | null;
  saving: boolean;
  onSave: (data: {
    title: string;
    description: string | null;
    target_date: string | null;
    category: string | null;
    status?: "active" | "achieved" | "abandoned";
  }) => void;
  onClose: () => void;
}) {
  const [goalTitle, setGoalTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [targetDate, setTargetDate] = useState<Date | null>(
    initial?.target_date ? new Date(initial.target_date) : null,
  );
  const [category, setCategory] = useState<string | null>(
    initial?.category ?? null,
  );
  const [showDatePicker, setShowDatePicker] = useState(false);

  const canSave = goalTitle.trim().length > 0 && !saving;

  const handleDateChange = useCallback(
    (_event: DateTimePickerEvent, selectedDate?: Date) => {
      if (Platform.OS === "android") {
        setShowDatePicker(false);
      }
      if (selectedDate) {
        setTargetDate(selectedDate);
      }
    },
    [],
  );

  const clearDate = useCallback(() => {
    setTargetDate(null);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!canSave) return;
    onSave({
      title: goalTitle.trim(),
      description: description.trim() || null,
      target_date: targetDate
        ? targetDate.toISOString().split("T")[0] + "T00:00:00.000Z"
        : null,
      category,
    });
  }, [canSave, goalTitle, description, targetDate, category, onSave]);

  return (
    <SafeAreaView style={styles.formContainer}>
      <View style={styles.formHeader}>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.formCancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.formTitle}>{title}</Text>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!canSave}
          activeOpacity={0.7}
        >
          <Text style={[styles.formSave, !canSave && styles.formSaveDisabled]}>
            {saving ? "Saving..." : "Save"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.formBody}>
        {/* Title */}
        <Text style={styles.fieldLabel}>Title</Text>
        <TextInput
          style={styles.input}
          value={goalTitle}
          onChangeText={setGoalTitle}
          placeholder="e.g. Score 90% in finals"
          placeholderTextColor="#64748B"
          maxLength={255}
          autoFocus
        />

        {/* Description */}
        <Text style={styles.fieldLabel}>Description (optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="What does achieving this look like?"
          placeholderTextColor="#64748B"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        {/* Target Date */}
        <Text style={styles.fieldLabel}>Target Date (optional)</Text>
        <View style={styles.dateRow}>
          <TouchableOpacity
            style={styles.dateBtn}
            onPress={() => setShowDatePicker(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.dateBtnText}>
              {targetDate ? formatDate(targetDate.toISOString()) : "Pick a date"}
            </Text>
          </TouchableOpacity>
          {targetDate && (
            <TouchableOpacity
              style={styles.clearDateBtn}
              onPress={clearDate}
              activeOpacity={0.7}
            >
              <Text style={styles.clearDateText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
        {showDatePicker && (
          <DateTimePicker
            value={targetDate ?? new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={handleDateChange}
            minimumDate={new Date()}
          />
        )}

        {/* Category */}
        <Text style={styles.fieldLabel}>Category (optional)</Text>
        <View style={styles.categoryGrid}>
          {GOAL_CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.categoryChip,
                category === cat && styles.categoryChipActive,
              ]}
              onPress={() => setCategory(category === cat ? null : cat)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  category === cat && styles.categoryChipTextActive,
                ]}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </SafeAreaView>
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
    paddingTop: 10,
    paddingBottom: 12,
  },
  backBtn: { padding: 4 },
  backText: { fontSize: 15, color: "#3B82F6" },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#F8FAFC" },
  addBtn: {
    backgroundColor: "#3B82F6",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addBtnText: { color: "#FFF", fontSize: 13, fontWeight: "600" },

  // Tabs
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: "#1E293B",
    borderRadius: 10,
    padding: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: "center",
  },
  tabActive: { backgroundColor: "#334155" },
  tabText: { fontSize: 13, color: "#64748B" },
  tabTextActive: { color: "#F8FAFC", fontWeight: "600" },

  // List
  listContent: { paddingHorizontal: 20, paddingBottom: 80 },
  separator: { height: 6 },

  // Card
  card: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#334155",
  },
  cardAchieved: { borderColor: "#22C55E40" },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 4,
  },
  cardTitle: { fontSize: 15, fontWeight: "600", color: "#F8FAFC", flex: 1 },
  achieveBtn: {
    backgroundColor: "#22C55E20",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  achieveBtnText: { fontSize: 12, color: "#22C55E", fontWeight: "600" },
  cardDesc: {
    fontSize: 13,
    color: "#94A3B8",
    lineHeight: 18,
    marginBottom: 8,
  },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  categoryBadge: {
    backgroundColor: "#334155",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryText: { fontSize: 11, color: "#CBD5E1", fontWeight: "500" },
  dateText: { fontSize: 12, color: "#94A3B8" },
  dateOverdue: { color: "#EF4444", fontWeight: "600" },
  deleteBtn: {
    position: "absolute",
    right: 14,
    bottom: 14,
  },
  deleteBtnText: { fontSize: 12, color: "#EF4444", fontWeight: "500" },

  // Loading
  loadingContainer: { paddingHorizontal: 20, paddingTop: 8 },
  skeletonCard: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
    gap: 8,
  },
  skeletonLine: {
    height: 12,
    backgroundColor: "#334155",
    borderRadius: 4,
    width: "60%",
  },

  // Empty
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#F8FAFC",
    marginBottom: 6,
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20,
  },
  emptyButton: {
    backgroundColor: "#3B82F6",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyButtonText: { color: "#FFF", fontSize: 13, fontWeight: "600" },

  // Form Modal
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

  formBody: { padding: 20 },

  // Fields
  fieldLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#94A3B8",
    marginBottom: 8,
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
    marginBottom: 20,
  },
  textArea: {
    minHeight: 80,
    paddingTop: 12,
  },

  // Date
  dateRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  dateBtn: {
    flex: 1,
    backgroundColor: "#1E293B",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dateBtnText: { fontSize: 15, color: "#F8FAFC" },
  clearDateBtn: {
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  clearDateText: { fontSize: 14, color: "#EF4444" },

  // Category
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
  },
  categoryChipActive: {
    backgroundColor: "#3B82F620",
    borderColor: "#3B82F6",
  },
  categoryChipText: { fontSize: 13, color: "#94A3B8" },
  categoryChipTextActive: { color: "#3B82F6", fontWeight: "600" },
});
