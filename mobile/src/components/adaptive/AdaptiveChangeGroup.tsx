import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { AdaptiveChangeRow } from "./AdaptiveChangeRow";
import type { PlanChange } from "@/services/types";

interface AdaptiveChangeGroupProps {
  changes: PlanChange[];
}

const MAX_VISIBLE = 2;

const GROUP_LABELS: Record<string, string> = {
  rescheduled: "Rescheduled",
  moved_to_overflow: "Moved to overflow",
  removed: "Removed",
  shortened: "Shortened",
};

function groupChanges(changes: PlanChange[]): Map<string, PlanChange[]> {
  const groups = new Map<string, PlanChange[]>();
  for (const change of changes) {
    const existing = groups.get(change.change_type) ?? [];
    existing.push(change);
    groups.set(change.change_type, existing);
  }
  return groups;
}

export function AdaptiveChangeGroup({ changes }: AdaptiveChangeGroupProps) {
  const [expanded, setExpanded] = useState(false);

  if (changes.length === 0) return null;

  const visibleChanges = expanded
    ? changes
    : changes.slice(0, MAX_VISIBLE);
  const hiddenCount = changes.length - visibleChanges.length;
  const groups = groupChanges(visibleChanges);

  return (
    <View style={styles.container}>
      {Array.from(groups.entries()).map(([type, typeChanges]) => (
        <View key={type} style={styles.group}>
          <Text style={styles.groupLabel}>
            {GROUP_LABELS[type] ?? type.replace(/_/g, " ")}
          </Text>
          <View style={styles.divider} />
          {typeChanges.map((change) => (
            <AdaptiveChangeRow key={change.session_id} change={change} />
          ))}
        </View>
      ))}

      {hiddenCount > 0 && (
        <TouchableOpacity
          style={styles.expandButton}
          onPress={() => setExpanded(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.expandText}>
            Show {hiddenCount} more change{hiddenCount > 1 ? "s" : ""}
          </Text>
        </TouchableOpacity>
      )}

      {expanded && changes.length > MAX_VISIBLE && (
        <TouchableOpacity
          style={styles.expandButton}
          onPress={() => setExpanded(false)}
          activeOpacity={0.7}
        >
          <Text style={styles.expandText}>Show less</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
  },
  group: {
    marginBottom: 8,
  },
  groupLabel: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#334155",
    marginBottom: 2,
  },
  expandButton: {
    paddingVertical: 6,
    alignItems: "center",
  },
  expandText: {
    color: "#64748B",
    fontSize: 12,
  },
});
