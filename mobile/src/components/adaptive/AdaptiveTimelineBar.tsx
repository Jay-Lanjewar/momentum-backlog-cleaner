import { View, Text, StyleSheet } from "react-native";
import type { PlanSession } from "@/services/types";

interface AdaptiveTimelineBarProps {
  sessions: PlanSession[];
  changedSessionIds: Set<string>;
  minStart: number;
  span: number;
  overflowIds?: Set<string>;
}

function topicFromSession(session: PlanSession): string {
  return session.reason.replace(/^Work on\s+/, "");
}

export function AdaptiveTimelineBar({
  sessions,
  changedSessionIds,
  minStart,
  span,
  overflowIds,
}: AdaptiveTimelineBarProps) {
  if (sessions.length === 0 || span <= 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.track} />
      {sessions.map((session) => {
        const [sh, sm] = session.start_time.split(":").map(Number);
        const [eh, em] = session.end_time.split(":").map(Number);
        const startMin = sh * 60 + sm;
        const endMin = eh * 60 + em;
        const leftPct = ((startMin - minStart) / span) * 100;
        const widthPct = Math.max(4, ((endMin - startMin) / span) * 100);
        const isChanged = changedSessionIds.has(session.session_id);

        return (
          <View
            key={session.session_id}
            style={[
              styles.segment,
              {
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                backgroundColor: isChanged ? "#2563EB" : "#64748B",
                opacity: isChanged ? 0.9 : 0.5,
              },
              isChanged && styles.segmentChanged,
            ]}
            accessibilityLabel={`${topicFromSession(session)}, ${session.start_time} to ${session.end_time}`}
          />
        );
      })}
      {overflowIds && overflowIds.size > 0 && (
        <View style={styles.overflowBadge}>
          <Text style={styles.overflowText}>+{overflowIds.size} tomorrow</Text>
        </View>
      )}
    </View>
  );
}

export function computeTimelineBounds(
  previousSessions: PlanSession[],
  currentSessions: PlanSession[],
): { minStart: number; span: number } {
  let allMin = Infinity;
  let allMax = 0;
  for (const s of previousSessions) {
    const [sh, sm] = s.start_time.split(":").map(Number);
    const [eh, em] = s.end_time.split(":").map(Number);
    allMin = Math.min(allMin, sh * 60 + sm);
    allMax = Math.max(allMax, eh * 60 + em);
  }
  for (const s of currentSessions) {
    const [sh, sm] = s.start_time.split(":").map(Number);
    const [eh, em] = s.end_time.split(":").map(Number);
    allMin = Math.min(allMin, sh * 60 + sm);
    allMax = Math.max(allMax, eh * 60 + em);
  }
  if (!isFinite(allMin)) {
    allMin = 0;
    allMax = 60;
  }
  const padding = Math.max(5, (allMax - allMin) * 0.05);
  return {
    minStart: allMin - padding,
    span: allMax - allMin + padding * 2,
  };
}

const styles = StyleSheet.create({
  container: {
    height: 20,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
  },
  track: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#1E293B",
    borderRadius: 10,
  },
  segment: {
    position: "absolute",
    top: 2,
    bottom: 2,
    borderRadius: 8,
  },
  segmentChanged: {
    borderWidth: 2,
    borderColor: "rgba(37, 99, 235, 0.5)",
  },
  overflowBadge: {
    position: "absolute",
    right: -2,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  overflowText: {
    color: "#F0B429",
    fontSize: 9,
    fontWeight: "600",
  },
});
