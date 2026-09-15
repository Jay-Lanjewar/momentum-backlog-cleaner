import { View, Text, StyleSheet } from "react-native";

import type { StreakProgress } from "@/services/types";

interface Props {
  streaks: StreakProgress;
}

export function ProgressStreakCard({ streaks }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Streaks</Text>

      <View style={styles.row}>
        <View style={styles.stat}>
          <Text style={styles.statEmoji}>{"\uD83D\uDD25"}</Text>
          <Text style={styles.statValue}>{streaks.current}</Text>
          <Text style={styles.statLabel}>Current</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.stat}>
          <Text style={styles.statEmoji}>{"\uD83C\uDFC6"}</Text>
          <Text style={styles.statValue}>{streaks.best}</Text>
          <Text style={styles.statLabel}>Best</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.stat}>
          <Text style={styles.statEmoji}>{"\uD83D\uDCC5"}</Text>
          <Text style={styles.statValue}>{streaks.total_study_days}</Text>
          <Text style={styles.statLabel}>Total Days</Text>
        </View>
      </View>

      {streaks.milestones.length > 0 && (
        <View style={styles.milestones}>
          <Text style={styles.milestonesTitle}>Milestones</Text>
          <View style={styles.milestoneRow}>
            {streaks.milestones.map((m) => (
              <View
                key={m.days}
                style={[
                  styles.milestoneChip,
                  m.achieved && styles.milestoneChipAchieved,
                ]}
              >
                <Text
                  style={[
                    styles.milestoneText,
                    m.achieved && styles.milestoneTextAchieved,
                  ]}
                >
                  {m.days}d
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1E293B",
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
  },
  title: {
    color: "#F8FAFC",
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 16,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  stat: {
    alignItems: "center",
    flex: 1,
  },
  statEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  statValue: {
    color: "#F8FAFC",
    fontSize: 22,
    fontWeight: "700",
  },
  statLabel: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: "#334155",
  },
  milestones: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#334155",
    paddingTop: 14,
  },
  milestonesTitle: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  milestoneRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  milestoneChip: {
    backgroundColor: "#334155",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  milestoneChipAchieved: {
    backgroundColor: "rgba(37, 99, 235, 0.2)",
  },
  milestoneText: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
  },
  milestoneTextAchieved: {
    color: "#60A5FA",
  },
});
