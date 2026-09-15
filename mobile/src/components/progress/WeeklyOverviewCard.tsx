import { View, Text, StyleSheet } from "react-native";

import type { WeekMetrics } from "@/services/types";
import { formatMinutes } from "@/lib/coaching";

interface Props {
  week: WeekMetrics;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function WeeklyOverviewCard({ week }: Props) {
  const maxMinutes = Math.max(1, ...week.daily.map((d) => d.study_minutes));

  return (
    <View style={styles.card}>
      <Text style={styles.title}>This Week</Text>

      <View style={styles.barChart}>
        {week.daily.map((day, i) => {
          const height =
            day.study_minutes > 0
              ? Math.max(4, (day.study_minutes / maxMinutes) * 80)
              : 0;
          return (
            <View key={day.date} style={styles.barColumn}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      height,
                      backgroundColor:
                        day.study_minutes > 0 ? "#2563EB" : "#334155",
                    },
                  ]}
                />
              </View>
              <Text style={styles.barLabel}>{DAY_LABELS[i]}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryStat}>
          <Text style={styles.summaryValue}>
            {formatMinutes(week.total_study_minutes)}
          </Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
        <View style={styles.summaryStat}>
          <Text style={styles.summaryValue}>{week.total_sessions}</Text>
          <Text style={styles.summaryLabel}>Sessions</Text>
        </View>
        <View style={styles.summaryStat}>
          <Text style={styles.summaryValue}>
            {week.total_estimated_minutes > 0
              ? `${Math.round((week.total_study_minutes / week.total_estimated_minutes) * 100)}%`
              : "--"}
          </Text>
          <Text style={styles.summaryLabel}>Completion</Text>
        </View>
      </View>
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
  barChart: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    height: 110,
    marginBottom: 16,
  },
  barColumn: {
    alignItems: "center",
    flex: 1,
  },
  barTrack: {
    height: 80,
    width: 20,
    justifyContent: "flex-end",
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: {
    width: "100%",
    borderRadius: 4,
  },
  barLabel: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 6,
    fontWeight: "500",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderTopWidth: 1,
    borderTopColor: "#334155",
    paddingTop: 12,
  },
  summaryStat: {
    alignItems: "center",
  },
  summaryValue: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "700",
  },
  summaryLabel: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 2,
  },
});
