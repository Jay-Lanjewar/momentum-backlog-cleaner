import { View, Text, StyleSheet } from "react-native";

import type { SubjectMetrics } from "@/services/types";
import { formatMinutes } from "@/lib/coaching";

interface Props {
  subjects: SubjectMetrics[];
}

export function SubjectBreakdownCard({ subjects }: Props) {
  const totalMinutes = subjects.reduce((s, sub) => s + sub.study_minutes, 0);

  if (subjects.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Subject Progress</Text>
        <Text style={styles.empty}>No subject data yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Subject Progress</Text>

      {subjects.map((sub) => {
        const pct = totalMinutes > 0 ? (sub.study_minutes / totalMinutes) * 100 : 0;
        return (
          <View key={sub.course_id} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: sub.course_color }]} />
            <View style={styles.info}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {sub.course_name}
                </Text>
                <Text style={styles.minutes}>
                  {formatMinutes(sub.study_minutes)}
                </Text>
              </View>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${pct}%`,
                      backgroundColor: sub.course_color,
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        );
      })}
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
  empty: {
    color: "#64748B",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  minutes: {
    color: "#94A3B8",
    fontSize: 13,
  },
  barTrack: {
    height: 4,
    backgroundColor: "#334155",
    borderRadius: 2,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 2,
  },
});
