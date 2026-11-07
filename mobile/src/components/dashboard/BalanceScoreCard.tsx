import { View, Text, StyleSheet } from "react-native";
import type { BalanceScoreData } from "@/services/types";
import { useTheme } from "@/theme/ThemeProvider";

interface BalanceScoreCardProps {
  balance: BalanceScoreData;
}

function scoreColor(score: number): string {
  if (score >= 80) return "#16A34A";
  if (score >= 50) return "#D97706";
  return "#DC2626";
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Well balanced";
  if (score >= 50) return "Needs attention";
  return "Imbalanced";
}

export function BalanceScoreCard({ balance }: BalanceScoreCardProps) {
  const { colors } = useTheme();
  const color = scoreColor(balance.score);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.primaryText }]}>Study Balance</Text>
        <View style={[styles.badge, { backgroundColor: color + "20" }]}>
          <Text style={[styles.badgeText, { color }]}>
            {scoreLabel(balance.score)}
          </Text>
        </View>
      </View>

      {/* Score Bar */}
      <View style={styles.scoreRow}>
        <Text style={[styles.scoreValue, { color }]}>{balance.score}</Text>
        <View style={styles.barContainer}>
          <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.barFill,
                { width: `${Math.min(balance.score, 100)}%`, backgroundColor: color },
              ]}
            />
          </View>
        </View>
      </View>

      {/* Message */}
      {balance.message && (
        <Text style={[styles.message, { color: colors.secondaryText }]}>{balance.message}</Text>
      )}

      {/* Neglected Subjects */}
      {balance.neglected_subjects.length > 0 && (
        <View style={[styles.neglectedSection, { borderTopColor: colors.divider }]}>
          <Text style={[styles.neglectedLabel, { color: colors.mutedText }]}>Needs more focus:</Text>
          <View style={styles.neglectedList}>
            {balance.neglected_subjects.map((subject) => (
              <View key={subject} style={styles.neglectedTag}>
                <Text style={styles.neglectedTagText}>{subject}</Text>
              </View>
            ))}
          </View>
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
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A1A",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: "600",
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  scoreValue: {
    fontSize: 32,
    fontWeight: "700",
    width: 50,
  },
  barContainer: {
    flex: 1,
  },
  barTrack: {
    height: 8,
    backgroundColor: "#E8E8E8",
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 4,
  },
  message: {
    fontSize: 13,
    color: "#666",
    marginBottom: 12,
    lineHeight: 18,
  },
  neglectedSection: {
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
    paddingTop: 12,
  },
  neglectedLabel: {
    fontSize: 13,
    color: "#888",
    marginBottom: 8,
  },
  neglectedList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  neglectedTag: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  neglectedTagText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#92400E",
  },
});
