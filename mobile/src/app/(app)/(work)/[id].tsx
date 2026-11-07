import { useMemo, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";

import {
  useBacklogItems,
  useBacklogItem,
  useUpdateBacklogItem,
  useDeleteBacklogItem,
} from "@/services/hooks";
import { BacklogForm } from "@/components/BacklogForm";
import { useTheme } from "@/theme/ThemeProvider";

export default function BacklogEditScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  // Try cached list first, fall back to single fetch
  const { data: cachedItems } = useBacklogItems();
  const { data: fetchedItem, isLoading: fetchingSingle } = useBacklogItem(
    cachedItems ? null : id,
  );

  const item = useMemo(() => {
    if (cachedItems && id) {
      return cachedItems.find((i) => i.id === id) ?? null;
    }
    return fetchedItem ?? null;
  }, [cachedItems, id, fetchedItem]);

  const updateItem = useUpdateBacklogItem();
  const deleteItem = useDeleteBacklogItem();

  const handleSave = useCallback(
    async (data: Parameters<typeof updateItem.mutateAsync>[0]["payload"]) => {
      if (!id) return;
      await updateItem.mutateAsync({ id, payload: data });
      router.back();
    },
    [id, updateItem, router],
  );

  const handleDelete = useCallback(() => {
    Alert.alert("Delete Task", "This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (!id) return;
          await deleteItem.mutateAsync(id);
          router.back();
        },
      },
    ]);
  }, [id, deleteItem, router]);

  const isLoading = !cachedItems && fetchingSingle;

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centerContent}>
          <Text style={[styles.emptyTitle, { color: colors.primaryText }]}>Task not found</Text>
          <Text style={[styles.emptyBody, { color: colors.mutedText }]}>
            This task may have been deleted.
          </Text>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: colors.accent }]}
            onPress={() => router.back()}
          >
            <Text style={[styles.backButtonText, { color: colors.accentForeground }]}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.divider }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Text style={[styles.headerBack, { color: colors.accentText }]}>{"\u2190"} Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.primaryText }]}>Edit Task</Text>
        <TouchableOpacity
          onPress={handleDelete}
          style={styles.deleteButton}
          disabled={deleteItem.isPending}
        >
          {deleteItem.isPending ? (
            <ActivityIndicator size="small" color={colors.error} />
          ) : (
            <Text style={[styles.deleteText, { color: colors.error }]}>Delete</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Form */}
      <BacklogForm
        initial={item}
        saving={updateItem.isPending}
        submitLabel="Save Changes"
        onSubmit={handleSave}
      />

      {/* Error display */}
      {(updateItem.isError || deleteItem.isError) && (
        <View style={[styles.errorBar, { backgroundColor: `${colors.error}20` }]}>
          <Text style={[styles.errorText, { color: colors.error }]}>
            {(updateItem.error ?? deleteItem.error)?.message ??
              "Something went wrong. Please try again."}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  centerContent: {
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
  },
  emptyBody: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: "#3B82F6",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  backButtonText: { color: "#FFF", fontSize: 14, fontWeight: "600" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  headerButton: { padding: 4 },
  headerBack: { fontSize: 16, color: "#3B82F6" },
  headerTitle: { fontSize: 17, fontWeight: "600", color: "#F8FAFC" },
  deleteButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(239,68,68,0.15)",
  },
  deleteText: { fontSize: 14, color: "#EF4444", fontWeight: "600" },
  errorBar: {
    backgroundColor: "rgba(239,68,68,0.15)",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  errorText: { color: "#EF4444", fontSize: 14, textAlign: "center" },
});
