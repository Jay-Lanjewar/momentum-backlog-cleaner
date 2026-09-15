import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAnalyticsProgress } from "@/services/hooks";
import { useDashboard } from "@/services/hooks";

import { TodaySummaryCard } from "@/components/progress/TodaySummaryCard";
import { WeeklyOverviewCard } from "@/components/progress/WeeklyOverviewCard";
import { SubjectBreakdownCard } from "@/components/progress/SubjectBreakdownCard";
import { ProgressStreakCard } from "@/components/progress/ProgressStreakCard";

export default function ProgressScreen() {
  const { data, isLoading, refetch, isRefetching } = useAnalyticsProgress();
  const { data: dashboard } = useDashboard();

  const dailyTarget = dashboard?.profile?.daily_target_minutes ?? null;

  if (isLoading) {
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
});
