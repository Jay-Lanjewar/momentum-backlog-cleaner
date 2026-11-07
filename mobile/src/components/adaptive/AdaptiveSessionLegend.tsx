import { View, Text, StyleSheet } from "react-native";
import type { PlanSession } from "@/services/types";
import { useTheme } from "@/theme/ThemeProvider";

interface AdaptiveSessionLegendProps {
  sessions: PlanSession[];
  changedSessionIds: Set<string>;
  overflowIds?: Set<string>;
}

function topicFromSession(session: PlanSession): string {
  return session.reason.replace(/^Work on\s+/, "");
}

export function AdaptiveSessionLegend({
  sessions,
  changedSessionIds,
  overflowIds,
}: AdaptiveSessionLegendProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      {sessions.map((session) => {
        const isChanged = changedSessionIds.has(session.session_id);
        const isOverflow = overflowIds?.has(session.backlog_item_id) ?? false;
        const dotColor = isChanged
          ? colors.info
          : isOverflow
            ? colors.warning
            : colors.mutedText;

        return (
          <View key={session.session_id} style={styles.item}>
            <View
              style={[
                styles.dot,
                { backgroundColor: dotColor },
                isChanged && { borderColor: `${colors.info}80` },
                !isChanged && styles.dotMuted,
              ]}
            />
            <Text
            style={[
              styles.label,
              { color: isChanged ? colors.primaryText : colors.mutedText },
              isChanged && styles.labelChanged,
            ]}
              numberOfLines={1}
            >
              {topicFromSession(session)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotChanged: {
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.5)",
  },
  dotMuted: {
    opacity: 0.5,
  },
  label: {
    color: "#94A3B8",
    fontSize: 10,
  },
  labelChanged: {
    color: "#F8FAFC",
    fontWeight: "600",
  },
});
