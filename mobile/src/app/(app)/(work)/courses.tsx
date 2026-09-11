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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import {
  useCourses,
  useCreateCourse,
  useUpdateCourse,
  useDeleteCourse,
  useBacklogItems,
} from "@/services/hooks";
import type { Course } from "@/services/types";
import { COURSE_COLORS } from "@/lib/onboarding";

const PRESET_COLORS = COURSE_COLORS;

export default function CoursesScreen() {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [deletingCourse, setDeletingCourse] = useState<Course | null>(null);

  const {
    data: courses = [],
    isLoading,
    isRefetching,
    refetch,
  } = useCourses();
  const { data: backlogItems = [] } = useBacklogItems();
  const createCourse = useCreateCourse();
  const updateCourse = useUpdateCourse();
  const deleteCourse = useDeleteCourse();

  const handleCreate = useCallback(
    async (data: { name: string; color: string }) => {
      await createCourse.mutateAsync(data);
      setShowForm(false);
    },
    [createCourse],
  );

  const handleUpdate = useCallback(
    async (data: { name: string; color: string }) => {
      if (!editingCourse) return;
      await updateCourse.mutateAsync({ id: editingCourse.id, payload: data });
      setEditingCourse(null);
    },
    [editingCourse, updateCourse],
  );

  const handleDelete = useCallback(async () => {
    if (!deletingCourse) return;
    await deleteCourse.mutateAsync(deletingCourse.id);
    setDeletingCourse(null);
  }, [deletingCourse, deleteCourse]);

  const openEdit = useCallback((course: Course) => {
    setEditingCourse(course);
  }, []);

  const openDelete = useCallback((course: Course) => {
    Alert.alert(
      "Delete Course",
      `Are you sure you want to delete "${course.name}"? Backlog items in this course will become uncategorized.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => setDeletingCourse(course),
        },
      ],
    );
  }, []);

  const backlogCountForCourse = useCallback(
    (courseId: string) =>
      backlogItems.filter((item) => item.course_id === courseId).length,
    [backlogItems],
  );

  const renderItem = useCallback(
    ({ item }: { item: Course }) => (
      <TouchableOpacity
        style={styles.card}
        onPress={() => openEdit(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.cardColorBar, { backgroundColor: item.color }]} />
        <View style={styles.cardContent}>
          <View style={styles.cardRow}>
            <View style={[styles.colorDot, { backgroundColor: item.color }]} />
            <Text style={styles.cardName} numberOfLines={1}>
              {item.name}
            </Text>
          </View>
          <Text style={styles.cardMeta}>
            {backlogCountForCourse(item.id)} task
            {backlogCountForCourse(item.id) !== 1 ? "s" : ""}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => openDelete(item)}
          activeOpacity={0.7}
        >
          <Text style={styles.deleteBtnText}>Delete</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    ),
    [openEdit, openDelete, backlogCountForCourse],
  );

  const keyExtractor = useCallback((item: Course) => item.id, []);

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
        <Text style={styles.headerTitle}>Courses</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowForm(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          {[1, 2, 3].map((n) => (
            <View key={n} style={styles.skeletonCard}>
              <View style={styles.skeletonColor} />
              <View style={styles.skeletonContent}>
                <View style={styles.skeletonLine} />
                <View style={[styles.skeletonLine, { width: "40%" }]} />
              </View>
            </View>
          ))}
        </View>
      ) : courses.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No courses yet.</Text>
          <Text style={styles.emptyBody}>
            Add your subjects and Momentum will organize your work by course.
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => setShowForm(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.emptyButtonText}>+ Add Course</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={courses}
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
        <CourseFormModal
          title="Add Course"
          saving={createCourse.isPending}
          onSave={handleCreate}
          onClose={() => setShowForm(false)}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal
        visible={!!editingCourse}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditingCourse(null)}
      >
        <CourseFormModal
          title="Edit Course"
          initial={editingCourse}
          saving={updateCourse.isPending}
          onSave={handleUpdate}
          onClose={() => setEditingCourse(null)}
        />
      </Modal>

      {/* Delete confirmation handled by Alert.alert in openDelete */}
      {deletingCourse && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setDeletingCourse(null)}
        >
          <View style={styles.deleteOverlay}>
            <View style={styles.deleteDialog}>
              <Text style={styles.deleteDialogTitle}>Delete Course</Text>
              <Text style={styles.deleteDialogBody}>
                {`Are you sure you want to delete "${deletingCourse.name}"? This action cannot be undone.`}
              </Text>
              <View style={styles.deleteDialogActions}>
                <TouchableOpacity
                  style={styles.deleteDialogCancel}
                  onPress={() => setDeletingCourse(null)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.deleteDialogCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.deleteDialogConfirm,
                    deleteCourse.isPending && styles.deleteDialogConfirmDisabled,
                  ]}
                  onPress={handleDelete}
                  disabled={deleteCourse.isPending}
                  activeOpacity={0.8}
                >
                  {deleteCourse.isPending ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.deleteDialogConfirmText}>Delete</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

// ─── Course Form Modal ───

function CourseFormModal({
  title,
  initial,
  saving,
  onSave,
  onClose,
}: {
  title: string;
  initial?: Course | null;
  saving: boolean;
  onSave: (data: { name: string; color: string }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? PRESET_COLORS[0]);

  const canSave = name.trim().length > 0 && !saving;

  return (
    <SafeAreaView style={styles.formContainer}>
      <View style={styles.formHeader}>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.formCancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.formTitle}>{title}</Text>
        <TouchableOpacity
          onPress={() => onSave({ name: name.trim(), color })}
          disabled={!canSave}
          activeOpacity={0.7}
        >
          <Text style={[styles.formSave, !canSave && styles.formSaveDisabled]}>
            {saving ? "Saving..." : "Save"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.formBody}>
        {/* Preview */}
        <View style={styles.previewRow}>
          <View style={[styles.previewCircle, { backgroundColor: color }]} />
          <Text style={styles.previewName} numberOfLines={1}>
            {name.trim() || "Course Name"}
          </Text>
        </View>

        {/* Name Input */}
        <Text style={styles.fieldLabel}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Mathematics"
          placeholderTextColor="#64748B"
          maxLength={255}
          autoFocus
        />

        {/* Color Picker */}
        <Text style={styles.fieldLabel}>Color</Text>
        <View style={styles.colorGrid}>
          {PRESET_COLORS.map((c) => (
            <TouchableOpacity
              key={c}
              style={[
                styles.colorSwatch,
                { backgroundColor: c },
                color === c && styles.colorSwatchSelected,
              ]}
              onPress={() => setColor(c)}
              activeOpacity={0.7}
            />
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

  // List
  listContent: { paddingHorizontal: 20, paddingBottom: 80 },
  separator: { height: 6 },

  // Card
  card: {
    flexDirection: "row",
    backgroundColor: "#1E293B",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    overflow: "hidden",
  },
  cardColorBar: { width: 4 },
  cardContent: { flex: 1, padding: 12 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  cardName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#F8FAFC",
    flex: 1,
  },
  cardMeta: { fontSize: 12, color: "#64748B", marginLeft: 18 },
  deleteBtn: {
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  deleteBtnText: { fontSize: 13, color: "#EF4444", fontWeight: "500" },

  // Loading
  loadingContainer: { paddingHorizontal: 20, paddingTop: 8 },
  skeletonCard: {
    flexDirection: "row",
    backgroundColor: "#1E293B",
    borderRadius: 12,
    marginBottom: 6,
    overflow: "hidden",
  },
  skeletonColor: { width: 4, backgroundColor: "#334155" },
  skeletonContent: { flex: 1, padding: 12, gap: 8 },
  skeletonLine: {
    height: 12,
    backgroundColor: "#334155",
    borderRadius: 4,
    width: "70%",
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

  // Preview
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  previewCircle: { width: 28, height: 28, borderRadius: 14 },
  previewName: { fontSize: 16, fontWeight: "600", color: "#F8FAFC" },

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

  // Color grid
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  colorSwatchSelected: {
    borderWidth: 3,
    borderColor: "#F8FAFC",
  },

  // Delete dialog
  deleteOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  deleteDialog: {
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 340,
  },
  deleteDialogTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F8FAFC",
    marginBottom: 8,
  },
  deleteDialogBody: {
    fontSize: 14,
    color: "#94A3B8",
    lineHeight: 20,
    marginBottom: 20,
  },
  deleteDialogActions: { flexDirection: "row", gap: 10 },
  deleteDialogCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#334155",
  },
  deleteDialogCancelText: { fontSize: 14, color: "#CBD5E1", fontWeight: "500" },
  deleteDialogConfirm: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#EF4444",
  },
  deleteDialogConfirmDisabled: { opacity: 0.5 },
  deleteDialogConfirmText: { fontSize: 14, color: "#FFF", fontWeight: "600" },
});
