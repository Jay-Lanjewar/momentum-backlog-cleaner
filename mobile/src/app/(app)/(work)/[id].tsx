import { useMemo, useState, useCallback } from "react";
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
import type { BacklogItem } from "@/services/types";
import { BacklogForm } from "@/components/BacklogForm";

export default function BacklogEditScreen() {
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
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.emptyTitle}>Task not found</Text>
          <Text style={styles.emptyBody}>
            This task may have been deleted.
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Text style={styles.headerBack}>{"\u2190"} Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Task</Text>
        <TouchableOpacity
          onPress={handleDelete}
          style={styles.headerButton}
          disabled={deleteItem.isPending}
        >
          <Text style={styles.deleteText}>
            {deleteItem.isPending ? "..." : "\uD83D\uDDD1"}
          </Text>
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
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>
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
  deleteText: { fontSize: 20 },
  errorBar: {
    backgroundColor: "rgba(239,68,68,0.15)",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  errorText: { color: "#EF4444", fontSize: 14, textAlign: "center" },
});
