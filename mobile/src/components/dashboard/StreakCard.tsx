import { View, Text, StyleSheet } from "react-native";
import type { StreakAllData, SubjectStreakData } from "@/services/types";

interface StreakCardProps {
  streaks: StreakAllData;
}

function SubjectRow({ subject }: { subject: SubjectStreakData }) {
  const progress = subject.longest_streak > 0
    ? Math.min((subject.current_streak / subject.longest_streak) * 100, 100)
    : 0;

  return (
    <View style={styles.subjectRow}>
      <View style={[styles.subjectDot, { backgroundColor: subject.course_color }]} />
      <View style={styles.subjectInfo}>
        <Text style={styles.subjectName} numberOfLines={1}>
          {subject.course_name}
        </Text>
        <View style={styles.subjectMeta}>
          <Text style={styles.subjectStreak}>🔥 {subject.current_streak}</Text>
          {subject.longest_streak > 0 && (
            <Text style={styles.subjectBest}>best: {subject.longest_streak}</Text>
          )}
        </View>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${progress}%`, backgroundColor: subject.course_color },
          ]}
        />
      </View>
    </View>
  );
}

export function StreakCard({ streaks }: StreakCardProps) {
  const { momentum, subjects } = streaks;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Momentum</Text>
          <Text style={styles.streakCount}>
            🔥 {momentum.current_streak} day{momentum.current_streak !== 1 ? "s" : ""}
          </Text>
        </View>
        <View style={styles.statsSide}>
          <View style={styles.miniStat}>
            <Text style={styles.miniStatValue}>{momentum.total_study_days}</Text>
            <Text style={styles.miniStatLabel}>total days</Text>
          </View>
          <View style={styles.miniStat}>
            <Text style={styles.miniStatValue}>{momentum.longest_streak}</Text>
            <Text style={styles.miniStatLabel}>best streak</Text>
          </View>
        </View>
      </View>

      {/* Recovery Tokens */}
      <View style={styles.tokenSection}>
        <View style={styles.tokenHeader}>
          <Text style={styles.tokenLabel}>Recovery Tokens</Text>
          <Text style={styles.tokenCount}>
            {momentum.recovery_tokens_current}/{momentum.recovery_tokens_current + momentum.recovery_tokens_used}
          </Text>
        </View>
        <View style={styles.tokenTrack}>
          <View
            style={[
              styles.tokenFill,
              {
                width: `${momentum.recovery_tokens_current + momentum.recovery_tokens_used > 0
                  ? (momentum.recovery_tokens_current / (momentum.recovery_tokens_current + momentum.recovery_tokens_used)) * 100
                  : 0}%`,
              },
            ]}
          />
        </View>
      </View>

      {/* Subject Streaks */}
      {subjects.length > 0 && (
        <View style={styles.subjectsSection}>
          <Text style={styles.subjectsTitle}>Subject Streaks</Text>
          {subjects.slice(0, 5).map((s) => (
            <SubjectRow key={s.id} subject={s} />
          ))}
        </View>
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
    alignItems: "flex-start",
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A1A",
    marginBottom: 4,
  },
  streakCount: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F97316",
  },
  statsSide: {
    flexDirection: "row",
    gap: 16,
  },
  miniStat: {
    alignItems: "center",
  },
  miniStatValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  miniStatLabel: {
    fontSize: 11,
    color: "#999",
  },
  tokenSection: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  tokenHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  tokenLabel: {
    fontSize: 13,
    color: "#666",
  },
  tokenCount: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },
  tokenTrack: {
    height: 6,
    backgroundColor: "#E8E8E8",
    borderRadius: 3,
    overflow: "hidden",
  },
  tokenFill: {
    height: "100%",
    backgroundColor: "#818CF8",
    borderRadius: 3,
  },
  subjectsSection: {
    gap: 10,
  },
  subjectsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  subjectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  subjectDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  subjectInfo: {
    flex: 1,
  },
  subjectName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
  },
  subjectMeta: {
    flexDirection: "row",
    gap: 8,
  },
  subjectStreak: {
    fontSize: 12,
    color: "#F97316",
  },
  subjectBest: {
    fontSize: 12,
    color: "#999",
  },
  progressTrack: {
    width: 40,
    height: 4,
    backgroundColor: "#E8E8E8",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
});
