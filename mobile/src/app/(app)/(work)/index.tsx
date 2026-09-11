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

const SECTION_TABS = [
  { value: "backlog", label: "Backlog" },
  { value: "courses", label: "Courses" },
  { value: "goals", label: "Goals" },
] as const;

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
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Work</Text>
          <Text style={styles.headerSubtitle}>
            Momentum turns these into study sessions automatically.
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowCreate(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.addButtonText}>+ Add Work</Text>
        </TouchableOpacity>
      </View>

      {/* Section Nav */}
      <View style={styles.sectionNav}>
        {SECTION_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.value}
            style={[
              styles.sectionTab,
              tab.value === "backlog" && styles.sectionTabActive,
            ]}
            onPress={() => {
              if (tab.value === "courses") router.push("/(app)/(work)/courses");
              else if (tab.value === "goals") router.push("/(app)/(work)/goals");
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.sectionTabText,
                tab.value === "backlog" && styles.sectionTabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
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
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  headerLeft: { flex: 1, marginRight: 12 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#F8FAFC" },
  headerSubtitle: { fontSize: 12, color: "#64748B", marginTop: 2 },
  addButton: {
    backgroundColor: "#3B82F6",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: { color: "#FFF", fontSize: 13, fontWeight: "600" },

  // Section Nav
  sectionNav: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 10,
    gap: 4,
  },
  sectionTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#1E293B",
  },
  sectionTabActive: { backgroundColor: "#334155" },
  sectionTabText: { fontSize: 13, color: "#64748B" },
  sectionTabTextActive: { color: "#F8FAFC", fontWeight: "600" },

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
    flexDirection: "row",
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  cardCompleted: { opacity: 0.7 },
  completionCircle: { marginRight: 12, paddingTop: 1 },
  circleEmpty: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#475569",
  },
  circleFilled: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
  },
  checkmark: { color: "#FFF", fontSize: 12, fontWeight: "700" },
  cardContent: { flex: 1 },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#F8FAFC",
    marginBottom: 4,
  },
  cardTitleCompleted: {
    textDecorationLine: "line-through",
    color: "#94A3B8",
  },
  cardMeta: { flexDirection: "row", gap: 6, marginBottom: 4, flexWrap: "wrap" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  badgeDot: { width: 5, height: 5, borderRadius: 3 },
  badgeText: { fontSize: 11, fontWeight: "500" },
  cardBottom: { flexDirection: "row", gap: 10 },
  dueText: { fontSize: 11, color: "#94A3B8" },
  dueOverdue: { color: "#EF4444", fontWeight: "600" },
  estText: { fontSize: 11, color: "#64748B" },

  // Loading
  loadingContainer: { paddingHorizontal: 20, paddingTop: 8 },
  skeletonCard: {
    flexDirection: "row",
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
  },
  skeletonCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#334155",
    marginRight: 12,
  },
  skeletonContent: { flex: 1, gap: 6 },
  skeletonLine: {
    height: 12,
    backgroundColor: "#334155",
    borderRadius: 4,
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

  // Modal
  modalContainer: { flex: 1, backgroundColor: "#0F172A" },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
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
