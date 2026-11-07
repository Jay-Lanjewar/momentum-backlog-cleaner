import { View, Text, StyleSheet } from "react-native";
import type { BacklogHealth, StudyStreakData } from "@/services/types";
import { formatMinutes } from "@/lib/coaching";
import { useTheme } from "@/theme/ThemeProvider";

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
  const { colors } = useTheme();
  const donePercent = totalTasks > 0
    ? Math.round((completedTasks / totalTasks) * 100)
    : 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.primaryText }]}>Progress</Text>

      {/* 2x2 Grid */}
      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <View style={[styles.statBox, { backgroundColor: colors.inputBackground }]}>
            <Text style={[styles.statValue, { color: colors.primaryText }]}>{donePercent}%</Text>
            <Text style={[styles.statLabel, { color: colors.mutedText }]}>Completed</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.inputBackground }]}>
            <Text style={[styles.statValue, { color: colors.primaryText }]}>{formatMinutes(studyMinutes)}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedText }]}>Study Time</Text>
          </View>
        </View>
        <View style={styles.gridRow}>
          <View style={[styles.statBox, { backgroundColor: colors.inputBackground }]}>
            <Text style={[styles.statValue, { color: colors.primaryText }]}>🔥 {streak.current_streak}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedText }]}>Day Streak</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.inputBackground }]}>
            <Text style={[styles.statValue, { color: colors.primaryText }]}>
              {deadlineLabel ?? "None"}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedText }]}>Next Deadline</Text>
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
    color: "#6B7280",
  },
});
