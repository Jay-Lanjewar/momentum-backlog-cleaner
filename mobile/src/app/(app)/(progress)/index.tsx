import { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAnalyticsProgress, useDashboard } from "@/services/hooks";

import { TodaySummaryCard } from "@/components/progress/TodaySummaryCard";
import { WeeklyOverviewCard } from "@/components/progress/WeeklyOverviewCard";
import { SubjectBreakdownCard } from "@/components/progress/SubjectBreakdownCard";
import { ProgressStreakCard } from "@/components/progress/ProgressStreakCard";

export default function ProgressScreen() {
  const { data, isLoading, refetch, isRefetching } = useAnalyticsProgress();
  const { data: dashboard } = useDashboard();
  const [retrying, setRetrying] = useState(false);
  const retryBusyRef = useRef(false);

  const dailyTarget = dashboard?.profile?.daily_target_minutes ?? null;

  async function handleRetry() {
    if (retryBusyRef.current) return;
    retryBusyRef.current = true;
    setRetrying(true);
    try {
      await refetch();
    } finally {
      retryBusyRef.current = false;
      setRetrying(false);
    }
  }

  if (isLoading || (retrying && !data)) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>Could not load progress data.</Text>
          <TouchableOpacity
            onPress={handleRetry}
            disabled={retrying}
            style={styles.retryButton}
            activeOpacity={0.8}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
      >
        <Text style={styles.header}>Progress</Text>

        <TodaySummaryCard today={data.today} dailyTarget={dailyTarget} />
        <WeeklyOverviewCard week={data.week} />
        <SubjectBreakdownCard subjects={data.subjects} />
        <ProgressStreakCard streaks={data.streaks} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    color: "#F8FAFC",
    fontSize: 26,
    fontWeight: "700",
    paddingTop: 16,
    paddingBottom: 20,
  },
  emptyText: {
    color: "#94A3B8",
    fontSize: 16,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "#2563EB",
    borderRadius: 8,
  },
  retryText: {
    color: "#FFF",
    fontWeight: "600",
  },
});
