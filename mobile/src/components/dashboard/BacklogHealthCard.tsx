import { View, Text, StyleSheet } from "react-native";
import type { BacklogHealth } from "@/services/types";

interface BacklogHealthCardProps {
  health: BacklogHealth;
}

function healthColor(score: string): string {
  switch (score) {
    case "good":
      return "#16A34A";
    case "fair":
      return "#D97706";
    case "critical":
      return "#DC2626";
    default:
      return "#666";
  }
}

function healthLabel(score: string): string {
  switch (score) {
    case "good":
      return "Good";
    case "fair":
      return "Fair";
    case "critical":
      return "Critical";
    default:
      return score;
  }
}

export function BacklogHealthCard({ health }: BacklogHealthCardProps) {
  const color = healthColor(health.health_score);
  const clearRate = Math.round(health.clear_rate_7d * 100);
  const donePercent = health.total_items > 0
    ? Math.round((health.completed_items / health.total_items) * 100)
    : 0;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Backlog Health</Text>
        <View style={[styles.badge, { backgroundColor: color + "20" }]}>
          <Text style={[styles.badgeText, { color }]}>
            {healthLabel(health.health_score)}
          </Text>
        </View>
      </View>

      {/* Clear Rate Bar */}
      <View style={styles.rateSection}>
        <View style={styles.rateHeader}>
          <Text style={styles.rateLabel}>7-day clear rate</Text>
          <Text style={styles.rateValue}>{clearRate}%</Text>
        </View>
        <View style={styles.rateTrack}>
          <View
            style={[
              styles.rateFill,
              { width: `${Math.min(clearRate, 100)}%`, backgroundColor: color },
            ]}
          />
        </View>
      </View>

      {/* Counts */}
      <View style={styles.countsRow}>
        <View style={styles.countItem}>
          <Text style={styles.countValue}>{health.pending_items}</Text>
          <Text style={styles.countLabel}>Pending</Text>
        </View>
        <View style={styles.countDivider} />
        <View style={styles.countItem}>
          <Text style={[styles.countValue, health.overdue_items > 0 && styles.countCritical]}>
            {health.overdue_items}
          </Text>
          <Text style={styles.countLabel}>Overdue</Text>
        </View>
        <View style={styles.countDivider} />
        <View style={styles.countItem}>
          <Text style={styles.countValue}>{donePercent}%</Text>
          <Text style={styles.countLabel}>Done</Text>
        </View>
      </View>

      {/* Estimated completion */}
      {health.estimated_completion_date && (
        <Text style={styles.estimate}>
          Est. clear: {new Date(health.estimated_completion_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </Text>
      )}
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A1A",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: "600",
  },
  rateSection: {
    marginBottom: 16,
  },
  rateHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  rateLabel: {
    fontSize: 13,
    color: "#666",
  },
  rateValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },
  rateTrack: {
    height: 6,
    backgroundColor: "#E8E8E8",
    borderRadius: 3,
    overflow: "hidden",
  },
  rateFill: {
    height: "100%",
    borderRadius: 3,
  },
  countsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  countItem: {
    flex: 1,
    alignItems: "center",
  },
  countDivider: {
    width: 1,
    height: 24,
    backgroundColor: "#E8E8E8",
  },
  countValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 2,
  },
  countCritical: {
    color: "#DC2626",
  },
  countLabel: {
    fontSize: 12,
    color: "#999",
  },
  estimate: {
    fontSize: 13,
    color: "#888",
    textAlign: "center",
  },
});
