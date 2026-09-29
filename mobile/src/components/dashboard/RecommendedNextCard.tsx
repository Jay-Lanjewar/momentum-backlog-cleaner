import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { PlanSession, PrioritizedBacklogItem } from "@/services/types";
import {
  formatMinutes,
  formatTimeRange,
  nowMinutes,
  sessionDurationMinutes,
  sessionRemainingMinutes,
  buildRecommendationReason,
  topicFromSession,
} from "@/lib/coaching";

interface RecommendedNextCardProps {
  session: PlanSession;
  backlogItem: PrioritizedBacklogItem | undefined;
  isCurrent: boolean;
  healthScore: string;
  isTopPriority?: boolean;
  /** Minutes since midnight used for the running-session countdown. */
  nowMin?: number;
  onStart: () => void;
}

export function RecommendedNextCard({
  session,
  backlogItem,
  isCurrent,
  healthScore,
  isTopPriority = false,
  nowMin,
  onStart,
}: RecommendedNextCardProps) {
  const courseColor = backlogItem?.course_color ?? "#6B7280";
  const subject = backlogItem?.course_name ?? "Unknown Subject";
  const overdue = backlogItem?.overdue ?? false;
  const reason = buildRecommendationReason(
    { overdue, due_date: backlogItem?.due_date ?? null, priority: backlogItem?.priority ?? 3 },
    healthScore,
    { isTopPriority },
  );

  const topic = topicFromSession(session);
  const effectiveNow = nowMin ?? nowMinutes();
  const plannedMinutes = sessionDurationMinutes(session);
  const remainingMinutes = isCurrent
    ? sessionRemainingMinutes(session, effectiveNow)
    : 0;
  // Duration always comes from end_time - start_time. A running session shows
  // how much time is left instead; never the backlog-remainder field.
  const durationLabel =
    remainingMinutes > 0
      ? `${formatMinutes(remainingMinutes)} left`
      : plannedMinutes > 0
        ? `~${formatMinutes(plannedMinutes)}`
        : "";

  return (
    <View style={styles.card}>
      {/* Accent bar */}
      <View
        style={[styles.accentBar, { backgroundColor: courseColor }]}
        accessible={false}
      />

      <View style={styles.content}>
        {/* Eyebrow */}
        <View style={styles.eyebrowRow}>
          <Text style={styles.eyebrow}>
            {isCurrent ? "NOW" : "NEXT UP"}
          </Text>
          {overdue && (
            <View style={styles.overdueBadge}>
              <Text style={styles.overdueText}>OVERDUE</Text>
            </View>
          )}
        </View>

        {/* Subject */}
        <View style={styles.subjectRow}>
          <View
            style={[styles.subjectDot, { backgroundColor: courseColor }]}
            accessible={false}
          />
          <Text style={styles.subjectText} numberOfLines={1}>
            {subject}
          </Text>
        </View>

        {/* Title — concrete topic from backend reason string */}
        <Text
          style={styles.title}
          numberOfLines={2}
          accessibilityRole="header"
        >
          {topic}
        </Text>

        {/* Time + Duration */}
        <View style={styles.metaRow}>
          <Text style={styles.timeText}>
            {formatTimeRange(session.start_time, session.end_time)}
          </Text>
          {durationLabel ? (
            <Text
              style={styles.durationText}
              accessibilityLabel={
                isCurrent && remainingMinutes > 0
                  ? `${formatMinutes(remainingMinutes)} left in this session`
                  : `About ${formatMinutes(plannedMinutes)} planned`
              }
            >
              {durationLabel}
            </Text>
          ) : null}
        </View>

        {/* Reason */}
        <Text style={styles.reasonText} numberOfLines={3}>
          {reason}
        </Text>

        {/* CTA */}
        <TouchableOpacity
          style={[styles.startButton, { backgroundColor: courseColor }]}
          onPress={onStart}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${isCurrent ? "Start focus session" : "Start next session"}: ${topic}`}
          testID="recommended-next-start"
        >
          <Text style={styles.startButtonText}>
            {isCurrent ? "Start Focus Session" : "Start Next Session"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    overflow: "hidden",
    flexDirection: "row",
  },
  accentBar: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2563EB",
    letterSpacing: 1,
  },
  overdueBadge: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  overdueText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#B91C1C",
    letterSpacing: 0.5,
  },
  subjectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  subjectDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  subjectText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: "#1A1A1A",
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  timeText: {
    fontSize: 14,
    color: "#6B7280",
  },
  durationText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  reasonText: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 16,
    lineHeight: 20,
  },
  startButton: {
    borderRadius: 12,
    minHeight: 48,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  startButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
