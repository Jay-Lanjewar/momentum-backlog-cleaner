import { View, Text, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MeHeader } from "@/components/MeHeader";
import { useBalanceScore, useStreaks, useDashboard } from "@/services/hooks";
import { useTheme } from "@/theme/ThemeProvider";

export default function HealthScreen() {
  const { colors } = useTheme();
  const { data: balance } = useBalanceScore();
  const { data: streaks } = useStreaks();
  const { data: dashboard } = useDashboard();

  const score = balance?.score ?? null;
  const message = balance?.message;
  const neglected = balance?.neglected_subjects ?? [];
  const planning = dashboard?.planning;
  const backlogHealth = planning?.backlog_health;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <MeHeader screen="health" title="Health" />

        <View style={[styles.scoreCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.scoreLabel, { color: colors.mutedText }]}>Study Balance</Text>
          <Text style={[styles.scoreValue, { color: colors.primaryText }]}>
            {score != null ? `${score}%` : "--"}
          </Text>
          {message && <Text style={[styles.scoreMessage, { color: colors.secondaryText }]}>{message}</Text>}
        </View>

        {neglected.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.primaryText }]}>Neglected Subjects</Text>
            {neglected.map((name, i) => (
              <View key={i} style={styles.neglectedRow}>
                <View style={styles.neglectedDot} />
                <Text style={[styles.neglectedText, { color: colors.primaryText }]}>{name}</Text>
              </View>
            ))}
          </View>
        )}

        {backlogHealth && (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.primaryText }]}>Backlog Health</Text>
            <View style={styles.healthRow}>
              <View style={styles.healthStat}>
                <Text style={[styles.healthValue, { color: colors.primaryText }]}>{backlogHealth.total_items}</Text>
                <Text style={[styles.healthLabel, { color: colors.mutedText }]}>Total</Text>
              </View>
              <View style={styles.healthStat}>
                <Text style={[styles.healthValue, { color: colors.primaryText }]}>{backlogHealth.completed_items}</Text>
                <Text style={[styles.healthLabel, { color: colors.mutedText }]}>Done</Text>
              </View>
              <View style={styles.healthStat}>
                <Text style={[styles.healthValue, { color: colors.error }]}>
                  {backlogHealth.overdue_items}
                </Text>
                <Text style={[styles.healthLabel, { color: colors.mutedText }]}>Overdue</Text>
              </View>
              <View style={styles.healthStat}>
                <Text style={[styles.healthValue, { color: colors.primaryText }]}>{backlogHealth.pending_items}</Text>
                <Text style={[styles.healthLabel, { color: colors.mutedText }]}>Pending</Text>
              </View>
            </View>
            {backlogHealth.estimated_completion_date && (
              <Text style={[styles.estimateText, { color: colors.mutedText }]}>
                Est. completion: {backlogHealth.estimated_completion_date}
              </Text>
            )}
          </View>
        )}

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.primaryText }]}>Quick Stats</Text>
          <View style={styles.healthRow}>
            <View style={styles.healthStat}>
              <Text style={[styles.healthValue, { color: colors.primaryText }]}>
                {streaks?.momentum?.current_streak ?? 0}
              </Text>
              <Text style={[styles.healthLabel, { color: colors.mutedText }]}>Streak</Text>
            </View>
            <View style={styles.healthStat}>
              <Text style={[styles.healthValue, { color: colors.primaryText }]}>
                {streaks?.momentum?.total_study_days ?? 0}
              </Text>
              <Text style={[styles.healthLabel, { color: colors.mutedText }]}>Study Days</Text>
            </View>
            <View style={styles.healthStat}>
              <Text style={[styles.healthValue, { color: colors.primaryText }]}>
                {streaks?.momentum?.recovery_tokens_current ?? 0}
              </Text>
              <Text style={[styles.healthLabel, { color: colors.mutedText }]}>Recovery</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  scoreCard: {
    backgroundColor: "#1E293B",
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
  },
  scoreLabel: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  scoreValue: {
    color: "#F8FAFC",
    fontSize: 36,
    fontWeight: "700",
  },
  scoreMessage: {
    color: "#94A3B8",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  card: {
    backgroundColor: "#1E293B",
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
  },
  cardTitle: {
    color: "#F8FAFC",
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 14,
  },
  neglectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  neglectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  neglectedText: {
    color: "#F8FAFC",
    fontSize: 14,
  },
  healthRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  healthStat: {
    alignItems: "center",
  },
  healthValue: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "700",
  },
  healthWarning: {
    color: "#EF4444",
  },
  healthLabel: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 2,
  },
  estimateText: {
    color: "#94A3B8",
    fontSize: 13,
    textAlign: "center",
    marginTop: 12,
  },
});
