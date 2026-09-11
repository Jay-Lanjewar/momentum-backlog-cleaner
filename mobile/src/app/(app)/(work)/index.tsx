import { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useBacklogItems, useCourses, useCreateBacklogItem, useUpdateBacklogItem } from "@/services/hooks";
import type { BacklogItem } from "@/services/types";
import { BacklogForm } from "@/components/BacklogForm";
import {
  difficultyFromPriority,
  courseMapFromList,
  formatDueDate,
  formatMinutes,
  isOverdue,
  type Difficulty,
} from "@/lib/coaching";

const TABS = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "completed", label: "Completed" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

const EMPTY_MESSAGES: Record<TabValue, { title: string; body: string }> = {
  all: {
    title: "No work yet.",
    body: "Add your homework and Momentum will automatically build today's study plan.",
  },
  upcoming: {
    title: "No upcoming work.",
    body: "Add homework and Momentum will plan it for you.",
  },
  completed: {
    title: "Nothing completed yet.",
    body: "Finish a focus session and Momentum will track it here.",
  },
};

function difficultyColor(d: Difficulty): string {
  switch (d) {
    case "hard":
      return "#EF4444";
    case "easy":
      return "#22C55E";
    default:
      return "#F59E0B";
  }
}

function BacklogCard({
  item,
  courseMap,
  onToggleComplete,
  onPress,
}: {
  item: BacklogItem;
  courseMap: Map<string, { name: string; color: string }>;
  onToggleComplete: (item: BacklogItem) => void;
  onPress: (item: BacklogItem) => void;
}) {
  const isCompleted = item.status === "completed";
  const diff = difficultyFromPriority(item.priority);
  const overdue = !isCompleted && isOverdue(item.due_date);
  const courseName = courseMap.get(item.course_id)?.name ?? "Unknown";
  const courseColor = courseMap.get(item.course_id)?.color ?? "#6b7280";

  return (
    <TouchableOpacity
      style={[styles.card, isCompleted && styles.cardCompleted]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <TouchableOpacity
        style={styles.completionCircle}
        onPress={() => onToggleComplete(item)}
        activeOpacity={0.6}
      >
        {isCompleted ? (
          <View style={styles.circleFilled}>
            <Text style={styles.checkmark}>{"\u2713"}</Text>
          </View>
        ) : (
          <View style={styles.circleEmpty} />
        )}
      </TouchableOpacity>

      <View style={styles.cardContent}>
        <Text
          style={[styles.cardTitle, isCompleted && styles.cardTitleCompleted]}
          numberOfLines={2}
        >
          {item.title}
        </Text>

        <View style={styles.cardMeta}>
          <View style={[styles.badge, { backgroundColor: courseColor + "20", borderColor: courseColor + "40" }]}>
            <View style={[styles.badgeDot, { backgroundColor: courseColor }]} />
            <Text style={[styles.badgeText, { color: courseColor }]}>{courseName}</Text>
          </View>

          <View style={[styles.badge, { backgroundColor: difficultyColor(diff) + "20", borderColor: difficultyColor(diff) + "40" }]}>
            <Text style={[styles.badgeText, { color: difficultyColor(diff) }]}>
              {diff.charAt(0).toUpperCase() + diff.slice(1)}
            </Text>
          </View>
        </View>

        <View style={styles.cardBottom}>
          {item.due_date ? (
            <Text style={[styles.dueText, overdue && styles.dueOverdue]}>
              {overdue ? "Overdue" : `Due ${formatDueDate(item.due_date)}`}
            </Text>
          ) : null}
          {item.estimated_minutes ? (
            <Text style={styles.estText}>
              {"\u23F1"} {formatMinutes(item.estimated_minutes)}
            </Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function BacklogScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabValue>("all");
  const [showCreate, setShowCreate] = useState(false);

  const {
    data: allItems = [],
    isLoading,
    isRefetching,
    refetch,
  } = useBacklogItems();
  const { data: courses = [] } = useCourses();
  const createItem = useCreateBacklogItem();
  const updateItem = useUpdateBacklogItem();

  const courseMap = useMemo(() => courseMapFromList(courses), [courses]);

  const items = useMemo(() => {
    if (activeTab === "all") return allItems;
    if (activeTab === "completed")
      return allItems.filter((i) => i.status === "completed");
    return allItems.filter((i) => i.status !== "completed");
  }, [allItems, activeTab]);

  const handleToggleComplete = useCallback(
    async (item: BacklogItem) => {
      const newStatus = item.status === "completed" ? "pending" : "completed";
      await updateItem.mutateAsync({ id: item.id, payload: { status: newStatus } });
    },
    [updateItem],
  );

  const handleCreate = useCallback(
    async (data: Parameters<ReturnType<typeof useCreateBacklogItem>["mutateAsync"]>[0]) => {
      await createItem.mutateAsync(data);
      setShowCreate(false);
    },
    [createItem],
  );

  const renderItem = useCallback(
    ({ item }: { item: BacklogItem }) => (
      <BacklogCard
        item={item}
        courseMap={courseMap}
        onToggleComplete={handleToggleComplete}
        onPress={(i) => router.push(`/(app)/(work)/${i.id}`)}
      />
    ),
    [courseMap, handleToggleComplete, router],
  );

  const keyExtractor = useCallback((item: BacklogItem) => item.id, []);

  const empty = EMPTY_MESSAGES[activeTab];

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Pending Work</Text>
          <Text style={styles.headerSubtitle}>
            Momentum turns these into study sessions automatically.
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowCreate(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => (
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

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          {[1, 2, 3].map((n) => (
            <View key={n} style={styles.skeletonCard}>
              <View style={styles.skeletonCircle} />
              <View style={styles.skeletonContent}>
                <View style={styles.skeletonLine} />
                <View style={[styles.skeletonLine, { width: "60%" }]} />
              </View>
            </View>
          ))}
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>{empty.title}</Text>
          <Text style={styles.emptyBody}>{empty.body}</Text>
          {activeTab !== "completed" && (
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => setShowCreate(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.emptyButtonText}>+ Add Work</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={items}
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
        visible={showCreate}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreate(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCreate(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Task</Text>
            <View style={{ width: 60 }} />
          </View>
          <BacklogForm
            saving={createItem.isPending}
            submitLabel="Add Task"
            onSubmit={handleCreate}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  headerTitle: { fontSize: 24, fontWeight: "700", color: "#F8FAFC" },
  headerSubtitle: { fontSize: 13, color: "#64748B", marginTop: 2 },
  addButton: {
    backgroundColor: "#3B82F6",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  addButtonText: { color: "#FFF", fontSize: 14, fontWeight: "600" },

  // Tabs
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
  },
  tabActive: { backgroundColor: "#334155" },
  tabText: { fontSize: 14, color: "#64748B" },
  tabTextActive: { color: "#F8FAFC", fontWeight: "600" },

  // List
  listContent: { paddingHorizontal: 20, paddingBottom: 80 },
  separator: { height: 8 },

  // Card
  card: {
    flexDirection: "row",
    backgroundColor: "#1E293B",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },
  cardCompleted: { opacity: 0.6 },
  completionCircle: { marginRight: 14, paddingTop: 2 },
  circleEmpty: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#475569",
  },
  circleFilled: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
  },
  checkmark: { color: "#FFF", fontSize: 14, fontWeight: "700" },
  cardContent: { flex: 1 },
  cardTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: "#F8FAFC",
    marginBottom: 8,
  },
  cardTitleCompleted: {
    textDecorationLine: "line-through",
    color: "#64748B",
  },
  cardMeta: { flexDirection: "row", gap: 8, marginBottom: 8, flexWrap: "wrap" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 12, fontWeight: "500" },
  cardBottom: { flexDirection: "row", gap: 12 },
  dueText: { fontSize: 12, color: "#94A3B8" },
  dueOverdue: { color: "#EF4444", fontWeight: "600" },
  estText: { fontSize: 12, color: "#94A3B8" },

  // Loading
  loadingContainer: { paddingHorizontal: 20, paddingTop: 8 },
  skeletonCard: {
    flexDirection: "row",
    backgroundColor: "#1E293B",
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
  },
  skeletonCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#334155",
    marginRight: 14,
  },
  skeletonContent: { flex: 1, gap: 8 },
  skeletonLine: {
    height: 14,
    backgroundColor: "#334155",
    borderRadius: 6,
    width: "80%",
  },

  // Empty
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#F8FAFC",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: "#3B82F6",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  emptyButtonText: { color: "#FFF", fontSize: 14, fontWeight: "600" },

  // Modal
  modalContainer: { flex: 1, backgroundColor: "#0F172A" },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  modalCancel: { fontSize: 16, color: "#3B82F6" },
  modalTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#F8FAFC",
  },
});
