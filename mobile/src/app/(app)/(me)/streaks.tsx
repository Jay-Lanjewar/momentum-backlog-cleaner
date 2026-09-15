import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useStreaks } from "@/services/hooks";

const MILESTONES = [3, 7, 14, 30, 100, 365];

export default function StreaksScreen() {
  const router = useRouter();
  const { data: streaks } = useStreaks();

  const momentum = streaks?.momentum;
  const subjects = streaks?.subjects ?? [];
  const current = momentum?.current_streak ?? 0;
  const best = momentum?.longest_streak ?? 0;
  const totalDays = momentum?.total_study_days ?? 0;
  const tokensCurrent = momentum?.recovery_tokens_current ?? 0;
  const tokensEarned = momentum?.recovery_tokens_earned ?? 0;
  const tokensUsed = momentum?.recovery_tokens_used ?? 0;

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <View style={{ width: 24 }} />
          <Text style={styles.header}>Streaks</Text>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.6}>
            <Text style={styles.backText}>{"\u2192"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statEmoji}>{"\uD83D\uDD25"}</Text>
            <Text style={styles.statValue}>{current}</Text>
            <Text style={styles.statLabel}>Current</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statEmoji}>{"\uD83C\uDFC6"}</Text>
            <Text style={styles.statValue}>{best}</Text>
            <Text style={styles.statLabel}>Best</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statEmoji}>{"\uD83D\uDCC5"}</Text>
            <Text style={styles.statValue}>{totalDays}</Text>
            <Text style={styles.statLabel}>Total Days</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Milestone Progress</Text>
          <View style={styles.milestoneRow}>
            {MILESTONES.map((days) => {
              const achieved = current >= days;
              return (
                <View
                  key={days}
                  style={[styles.milestoneChip, achieved && styles.milestoneChipAchieved]}
                >
                  <Text style={[styles.milestoneText, achieved && styles.milestoneTextAchieved]}>
                    {days}d
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recovery Tokens</Text>
          <View style={styles.tokenRow}>
            <View style={styles.tokenStat}>
              <Text style={styles.tokenValue}>{tokensCurrent}</Text>
              <Text style={styles.tokenLabel}>Available</Text>
            </View>
            <View style={styles.tokenStat}>
              <Text style={styles.tokenValue}>{tokensEarned}</Text>
              <Text style={styles.tokenLabel}>Earned</Text>
            </View>
            <View style={styles.tokenStat}>
              <Text style={styles.tokenValue}>{tokensUsed}</Text>
              <Text style={styles.tokenLabel}>Used</Text>
            </View>
          </View>
        </View>

        {subjects.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Subject Streaks</Text>
            {subjects.map((sub) => (
              <View key={sub.id} style={styles.subjectRow}>
                <View style={[styles.subjectDot, { backgroundColor: sub.course_color }]} />
                <View style={styles.subjectInfo}>
                  <Text style={styles.subjectName} numberOfLines={1}>
                    {sub.course_name}
                  </Text>
                  <Text style={styles.subjectMeta}>
                    {sub.current_streak}d current · {sub.longest_streak}d best
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
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
  backText: {
    color: "#64748B",
    fontSize: 22,
  },
  header: {
    color: "#F8FAFC",
    fontSize: 26,
    fontWeight: "700",
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#1E293B",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  statEmoji: {
    fontSize: 22,
    marginBottom: 6,
  },
  statValue: {
    color: "#F8FAFC",
    fontSize: 22,
    fontWeight: "700",
  },
  statLabel: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 2,
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
  milestoneRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  milestoneChip: {
    backgroundColor: "#334155",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  milestoneChipAchieved: {
    backgroundColor: "rgba(37, 99, 235, 0.2)",
  },
  milestoneText: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "600",
  },
  milestoneTextAchieved: {
    color: "#60A5FA",
  },
  tokenRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  tokenStat: {
    alignItems: "center",
  },
  tokenValue: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "700",
  },
  tokenLabel: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 2,
  },
  subjectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  subjectDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  subjectInfo: {
    flex: 1,
  },
  subjectName: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "500",
  },
  subjectMeta: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 1,
  },
});
