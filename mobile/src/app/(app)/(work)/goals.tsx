import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
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
import { useTheme } from "@/theme/ThemeProvider";

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
  const { colors } = useTheme();
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
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, activeTab === "achieved" && styles.cardAchieved]}
          onPress={() => setEditingGoal(item)}
          activeOpacity={0.7}
        >
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.primaryText }]} numberOfLines={2}>
              {item.title}
            </Text>
            {activeTab === "active" && (
              <TouchableOpacity
                style={[styles.achieveBtn, { backgroundColor: `${colors.success}20` }]}
                onPress={() => handleMarkAchieved(item)}
                activeOpacity={0.7}
              >
                <Text style={[styles.achieveBtnText, { color: colors.success }]}>Achieve</Text>
              </TouchableOpacity>
            )}
          </View>

          {item.description ? (
            <Text style={[styles.cardDesc, { color: colors.secondaryText }]} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}

          <View style={styles.cardMeta}>
            {item.category ? (
              <View style={[styles.categoryBadge, { backgroundColor: colors.pressed }]}>
                <Text style={[styles.categoryText, { color: colors.secondaryText }]}>{item.category}</Text>
              </View>
            ) : null}
            {item.target_date ? (
              <Text
                style={[styles.dateText, { color: colors.mutedText }, overdue && styles.dateOverdue]}
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
            <Text style={[styles.deleteBtnText, { color: colors.error }]}>Delete</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      );
    },
    [activeTab, handleMarkAchieved, handleDelete, colors],
  );

  const keyExtractor = useCallback((item: Goal) => item.id, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Text style={[styles.backText, { color: colors.accentText }]}>{"< Back"}</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.primaryText }]}>Goals</Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.accent }]}
          onPress={() => setShowForm(true)}
          activeOpacity={0.8}
        >
          <Text style={[styles.addBtnText, { color: colors.accentForeground }]}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {GOAL_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.value}
            testID={`goals-tab-${tab.value}`}
            style={[
              styles.tab,
              { backgroundColor: colors.tabBar },
              activeTab === tab.value && { backgroundColor: colors.accentSoft },
            ]}
            onPress={() => setActiveTab(tab.value)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.tabText,
                { color: colors.mutedText },
                activeTab === tab.value && { color: colors.accentSoftForeground },
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
            <View key={n} style={[styles.skeletonCard, { backgroundColor: colors.card }]}>
              <View style={[styles.skeletonLine, { width: "70%", backgroundColor: colors.pressed }]} />
              <View style={[styles.skeletonLine, { width: "40%", backgroundColor: colors.pressed }]} />
            </View>
          ))}
        </View>
      ) : goals.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyTitle, { color: colors.primaryText }]}>
            {activeTab === "active"
              ? "No active goals."
              : "No achieved goals yet."}
          </Text>
          <Text style={[styles.emptyBody, { color: colors.mutedText }]}>
            {activeTab === "active"
              ? "Set goals to stay motivated and track your progress."
              : "Achieve a goal and it will appear here."}
          </Text>
          {activeTab === "active" && (
            <TouchableOpacity
              style={[styles.emptyButton, { backgroundColor: colors.accent }]}
              onPress={() => setShowForm(true)}
              activeOpacity={0.8}
            >
              <Text style={[styles.emptyButtonText, { color: colors.accentForeground }]}>+ Add Goal</Text>
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
              tintColor={colors.mutedText}
              colors={[colors.accent]}
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
  const { colors } = useTheme();
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
    <SafeAreaView style={[styles.formContainer, { backgroundColor: colors.background }]}>
      <View style={[styles.formHeader, { borderBottomColor: colors.divider }]}>
        <TouchableOpacity onPress={onClose}>
          <Text style={[styles.formCancel, { color: colors.accentText }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.formTitle, { color: colors.primaryText }]}>{title}</Text>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!canSave}
          activeOpacity={0.7}
        >
          <Text style={[styles.formSave, { color: colors.accentText }, !canSave && styles.formSaveDisabled]}>
            {saving ? "Saving..." : "Save"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.formBody}>
        {/* Title */}
        <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>Title</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.primaryText }]}
          value={goalTitle}
          onChangeText={setGoalTitle}
          placeholder="e.g. Score 90% in finals"
          placeholderTextColor={colors.placeholder}
          maxLength={255}
          autoFocus
        />

        {/* Description */}
        <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>Description (optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.primaryText }]}
          value={description}
          onChangeText={setDescription}
          placeholder="What does achieving this look like?"
          placeholderTextColor={colors.placeholder}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        {/* Target Date */}
        <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>Target Date (optional)</Text>
        <View style={styles.dateRow}>
          <TouchableOpacity
            style={[styles.dateBtn, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}
            onPress={() => setShowDatePicker(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.dateBtnText, { color: colors.primaryText }]}>
              {targetDate ? formatDate(targetDate.toISOString()) : "Pick a date"}
            </Text>
          </TouchableOpacity>
          {targetDate && (
            <TouchableOpacity
              style={styles.clearDateBtn}
              onPress={clearDate}
              activeOpacity={0.7}
            >
              <Text style={[styles.clearDateText, { color: colors.error }]}>Clear</Text>
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
        <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>Category (optional)</Text>
        <View style={styles.categoryGrid}>
          {GOAL_CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.categoryChip,
                { backgroundColor: colors.inputBackground, borderColor: colors.border },
                category === cat && { backgroundColor: colors.accentSoft, borderColor: colors.accent },
              ]}
              onPress={() => setCategory(category === cat ? null : cat)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  { color: category === cat ? colors.accentSoftForeground : colors.mutedText },
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
