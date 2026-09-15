import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useBalanceScore, useStreaks, useDashboard } from "@/services/hooks";

export default function HealthScreen() {
  const router = useRouter();
  const { data: balance } = useBalanceScore();
  const { data: streaks } = useStreaks();
  const { data: dashboard } = useDashboard();

  const score = balance?.score ?? null;
  const message = balance?.message;
  const neglected = balance?.neglected_subjects ?? [];
  const planning = dashboard?.planning;
  const backlogHealth = planning?.backlog_health;

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <View style={{ width: 24 }} />
          <Text style={styles.header}>Health</Text>
          <Text style={{ width: 24 }} />
        </View>

        <View style={styles.scoreCard}>
          <Text style={styles.scoreLabel}>Study Balance</Text>
          <Text style={styles.scoreValue}>
            {score != null ? `${score}%` : "--"}
          </Text>
          {message && <Text style={styles.scoreMessage}>{message}</Text>}
        </View>

        {neglected.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Neglected Subjects</Text>
            {neglected.map((name, i) => (
              <View key={i} style={styles.neglectedRow}>
                <View style={styles.neglectedDot} />
                <Text style={styles.neglectedText}>{name}</Text>
              </View>
            ))}
          </View>
        )}

        {backlogHealth && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Backlog Health</Text>
            <View style={styles.healthRow}>
              <View style={styles.healthStat}>
                <Text style={styles.healthValue}>{backlogHealth.total_items}</Text>
                <Text style={styles.healthLabel}>Total</Text>
              </View>
              <View style={styles.healthStat}>
                <Text style={styles.healthValue}>{backlogHealth.completed_items}</Text>
                <Text style={styles.healthLabel}>Done</Text>
              </View>
              <View style={styles.healthStat}>
                <Text style={[styles.healthValue, styles.healthWarning]}>
                  {backlogHealth.overdue_items}
                </Text>
                <Text style={styles.healthLabel}>Overdue</Text>
              </View>
              <View style={styles.healthStat}>
                <Text style={styles.healthValue}>{backlogHealth.pending_items}</Text>
                <Text style={styles.healthLabel}>Pending</Text>
              </View>
            </View>
            {backlogHealth.estimated_completion_date && (
              <Text style={styles.estimateText}>
                Est. completion: {backlogHealth.estimated_completion_date}
              </Text>
            )}
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Quick Stats</Text>
          <View style={styles.healthRow}>
            <View style={styles.healthStat}>
              <Text style={styles.healthValue}>
                {streaks?.momentum?.current_streak ?? 0}
              </Text>
              <Text style={styles.healthLabel}>Streak</Text>
            </View>
            <View style={styles.healthStat}>
              <Text style={styles.healthValue}>
                {streaks?.momentum?.total_study_days ?? 0}
              </Text>
              <Text style={styles.healthLabel}>Study Days</Text>
            </View>
            <View style={styles.healthStat}>
              <Text style={styles.healthValue}>
                {streaks?.momentum?.recovery_tokens_current ?? 0}
              </Text>
              <Text style={styles.healthLabel}>Recovery</Text>
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 16,
    paddingBottom: 20,
  },
  header: {
    color: "#F8FAFC",
    fontSize: 26,
    fontWeight: "700",
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
