import { View, Text, StyleSheet } from "react-native";

import type { TodayMetrics } from "@/services/types";
import { formatMinutes } from "@/lib/coaching";
import { useTheme } from "@/theme/ThemeProvider";

interface Props {
  today: TodayMetrics;
  dailyTarget: number | null;
}

export function TodaySummaryCard({ today, dailyTarget }: Props) {
  const { colors } = useTheme();
  const ratio =
    today.estimated_minutes > 0
      ? Math.round((today.study_minutes / today.estimated_minutes) * 100)
      : 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <Text style={[styles.title, { color: colors.primaryText }]}>Today</Text>

      <View style={styles.row}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.primaryText }]}>{formatMinutes(today.study_minutes)}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedText }]}>Studied</Text>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.divider }]} />

        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.primaryText }]}>{today.sessions_completed}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedText }]}>Sessions</Text>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.divider }]} />

        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.primaryText }]}>
            {today.estimated_minutes > 0 ? `${ratio}%` : "--"}
          </Text>
          <Text style={[styles.statLabel, { color: colors.mutedText }]}>vs Estimated</Text>
        </View>
      </View>

      {dailyTarget != null && dailyTarget > 0 && (
        <View style={styles.targetRow}>
          <Text style={[styles.targetText, { color: colors.mutedText }]}>
            {formatMinutes(today.study_minutes)} / {formatMinutes(dailyTarget)} target
          </Text>
          <View style={[styles.targetTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.targetFill,
                {
                  width: `${Math.min(100, (today.study_minutes / dailyTarget) * 100)}%`,
                  backgroundColor: colors.accent,
                },
              ]}
              testID="today-target-fill"
            />
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
  statValue: {
    color: "#F8FAFC",
    fontSize: 22,
    fontWeight: "700",
  },
  statLabel: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 4,
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: "#334155",
  },
  targetRow: {
    marginTop: 16,
    gap: 6,
  },
  targetText: {
    color: "#94A3B8",
    fontSize: 12,
  },
  targetTrack: {
    height: 6,
    backgroundColor: "#334155",
    borderRadius: 3,
    overflow: "hidden",
  },
  targetFill: {
    height: "100%",
    backgroundColor: "#2563EB",
    borderRadius: 3,
  },
});
