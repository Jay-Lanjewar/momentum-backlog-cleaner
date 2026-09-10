import { View, Text, StyleSheet } from "react-native";
import { formatHourMinute } from "@/lib/coaching";
import type { PlanChange } from "@/services/types";

interface AdaptiveChangeRowProps {
  change: PlanChange;
}

export function AdaptiveChangeRow({ change }: AdaptiveChangeRowProps) {
  const isOverflow = change.change_type === "moved_to_overflow";
  const isRemoved = change.change_type === "removed";
  const isDanger = isOverflow || isRemoved;

  const iconBg = isDanger ? "#78350F" : "#1E3A5F";
  const iconColor = isDanger ? "#F0B429" : "#60A5FA";
  const iconSymbol = isDanger ? "clock" : "arrow";

  return (
    <View style={styles.row}>
      <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
        <Text style={[styles.iconText, { color: iconColor }]}>
          {iconSymbol === "clock" ? "\u223D" : "\u2192"}
        </Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {change.title}
        </Text>
        <View style={styles.timeRow}>
          {change.previous_start && change.previous_end && (
            <Text style={styles.timePrevious}>
              {formatHourMinute(change.previous_start)} –{" "}
              {formatHourMinute(change.previous_end)}
            </Text>
          )}
          {change.previous_start &&
            change.previous_end &&
            (change.new_start || isOverflow || isRemoved) && (
              <Text style={styles.timeArrow}>{" \u2192 "}</Text>
            )}
          {change.new_start && change.new_end ? (
            <Text style={styles.timeNew}>
              {formatHourMinute(change.new_start)} –{" "}
              {formatHourMinute(change.new_end)}
            </Text>
          ) : isOverflow ? (
            <Text style={styles.timeOverflow}>Next available day</Text>
          ) : isRemoved ? (
            <Text style={styles.timeRemoved}>Completed</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 8,
  },
  iconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  iconText: {
    fontSize: 12,
    fontWeight: "700",
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "500",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
    flexWrap: "wrap",
  },
  timePrevious: {
    color: "#94A3B8",
    fontSize: 12,
    textDecorationLine: "line-through",
  },
  timeArrow: {
    color: "#94A3B8",
    fontSize: 12,
  },
  timeNew: {
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "600",
  },
  timeOverflow: {
    color: "#F0B429",
    fontSize: 12,
    fontWeight: "600",
  },
  timeRemoved: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "500",
  },
});
