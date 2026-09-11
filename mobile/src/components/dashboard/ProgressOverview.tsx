import { View, Text, StyleSheet } from "react-native";
import type { BacklogHealth, StudyStreakData } from "@/services/types";
import { formatMinutes } from "@/lib/coaching";

interface ProgressOverviewProps {
  totalTasks: number;
  completedTasks: number;
  studyMinutes: number;
  streak: StudyStreakData;
  deadlineLabel?: string;
  deadlineDate?: string;
}

export function ProgressOverview({
  totalTasks,
  completedTasks,
  studyMinutes,
  streak,
  deadlineLabel,
  deadlineDate,
}: ProgressOverviewProps) {
  const donePercent = totalTasks > 0
    ? Math.round((completedTasks / totalTasks) * 100)
    : 0;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Progress</Text>

      {/* 2x2 Grid */}
      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{donePercent}%</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{formatMinutes(studyMinutes)}</Text>
            <Text style={styles.statLabel}>Study Time</Text>
          </View>
        </View>
        <View style={styles.gridRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>🔥 {streak.current_streak}</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>
              {deadlineLabel ?? "None"}
            </Text>
            <Text style={styles.statLabel}>Next Deadline</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A1A",
    marginBottom: 16,
  },
  grid: {
    gap: 12,
  },
  gridRow: {
    flexDirection: "row",
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "#999",
  },
});
