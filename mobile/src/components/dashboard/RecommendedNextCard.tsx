import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { PlanSession, PrioritizedBacklogItem } from "@/services/types";
import { formatMinutes, formatTimeRange, buildRecommendationReason } from "@/lib/coaching";

interface RecommendedNextCardProps {
  session: PlanSession;
  backlogItem: PrioritizedBacklogItem | undefined;
  isCurrent: boolean;
  healthScore: string;
  onStart: () => void;
}

export function RecommendedNextCard({
  session,
  backlogItem,
  isCurrent,
  healthScore,
  onStart,
}: RecommendedNextCardProps) {
  const courseColor = backlogItem?.course_color ?? "#6B7280";
  const subject = backlogItem?.course_name ?? "Unknown Subject";
  const overdue = backlogItem?.overdue ?? false;
  const reason = buildRecommendationReason(
    { overdue, due_date: backlogItem?.due_date ?? null, priority: backlogItem?.priority ?? 3 },
    healthScore,
  );

  return (
    <View style={styles.card}>
      {/* Accent bar */}
      <View style={[styles.accentBar, { backgroundColor: courseColor }]} />

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
          <View style={[styles.subjectDot, { backgroundColor: courseColor }]} />
          <Text style={styles.subjectText} numberOfLines={1}>
            {subject}
          </Text>
        </View>

        {/* Title */}
        <Text style={styles.title} numberOfLines={2}>
          {session.reason}
        </Text>

        {/* Time + Duration */}
        <View style={styles.metaRow}>
          <Text style={styles.timeText}>
            {formatTimeRange(session.start_time, session.end_time)}
          </Text>
          {session.remaining_minutes > 0 && (
            <Text style={styles.durationText}>
              ~{formatMinutes(session.remaining_minutes)}
            </Text>
          )}
        </View>

        {/* Reason */}
        <Text style={styles.reasonText} numberOfLines={2}>
          {reason}
        </Text>

        {/* CTA */}
        <TouchableOpacity
          style={[styles.startButton, { backgroundColor: courseColor }]}
          onPress={onStart}
          activeOpacity={0.8}
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
    marginBottom: 16,
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
    color: "#DC2626",
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
    color: "#666",
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
    gap: 12,
    marginBottom: 8,
  },
  timeText: {
    fontSize: 14,
    color: "#666",
  },
  durationText: {
    fontSize: 14,
    color: "#999",
  },
  reasonText: {
    fontSize: 13,
    color: "#888",
    fontStyle: "italic",
    marginBottom: 16,
    lineHeight: 18,
  },
  startButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  startButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
