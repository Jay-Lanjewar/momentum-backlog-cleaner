import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuthStore } from "@/store/useAuthStore";
import { useProfile, useStreaks, useBalanceScore } from "@/services/hooks";
import { useTheme } from "@/theme/ThemeProvider";

export default function ProfileScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuthStore();
  const { data: profile } = useProfile();
  const { data: streaks } = useStreaks();
  const { data: balance } = useBalanceScore();

  const displayName = profile?.name || user?.name || "Student";
  const initials = displayName.charAt(0).toUpperCase();
  const className = profile?.class_name;
  const board = profile?.board;

  const currentStreak = streaks?.momentum?.current_streak ?? 0;
  const balanceScore = balance?.score ?? null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.header, { color: colors.primaryText }]}>Me</Text>

        <View style={[styles.profileCard, { backgroundColor: colors.card }]}>
          <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
            <Text style={[styles.avatarText, { color: colors.accentForeground }]}>{initials}</Text>
          </View>
          <Text style={[styles.name, { color: colors.primaryText }]}>{displayName}</Text>
          {(className || board) && (
            <Text style={[styles.subtitle, { color: colors.mutedText }]}>
              {[className, board].filter(Boolean).join(" \u00B7 ")}
            </Text>
          )}
        </View>

        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.summaryValue, { color: colors.primaryText }]}>{currentStreak}</Text>
            <Text style={[styles.summaryLabel, { color: colors.mutedText }]}>Day Streak</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.summaryValue, { color: colors.primaryText }]}>
              {balanceScore != null ? `${balanceScore}%` : "--"}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.mutedText }]}>Balance</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.summaryValue, { color: colors.primaryText }]}>
              {streaks?.momentum?.total_study_days ?? 0}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.mutedText }]}>Total Days</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.mutedText }]}>Account</Text>
          <TouchableOpacity
            style={[styles.row, { backgroundColor: colors.card }]}
            activeOpacity={0.6}
            onPress={() => router.push("/(me)/profile")}
          >
            <Text style={[styles.rowText, { color: colors.primaryText }]}>Profile</Text>
            <Text style={[styles.arrow, { color: colors.mutedText }]}>{"\u2192"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.row, { backgroundColor: colors.card }]}
            activeOpacity={0.6}
            onPress={() => router.push("/(me)/settings")}
          >
            <Text style={[styles.rowText, { color: colors.primaryText }]}>Settings</Text>
            <Text style={[styles.arrow, { color: colors.mutedText }]}>{"\u2192"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.mutedText }]}>Progress & Health</Text>
          <TouchableOpacity
            style={[styles.row, { backgroundColor: colors.card }]}
            activeOpacity={0.6}
            onPress={() => router.push("/(me)/streaks")}
          >
            <Text style={[styles.rowText, { color: colors.primaryText }]}>Streaks</Text>
            <Text style={[styles.arrow, { color: colors.mutedText }]}>{"\u2192"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.row, { backgroundColor: colors.card }]}
            activeOpacity={0.6}
            onPress={() => router.push("/(me)/health")}
          >
            <Text style={[styles.rowText, { color: colors.primaryText }]}>Health</Text>
            <Text style={[styles.arrow, { color: colors.mutedText }]}>{"\u2192"}</Text>
          </TouchableOpacity>
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
  header: {
    color: "#F8FAFC",
    fontSize: 26,
    fontWeight: "700",
    paddingTop: 16,
    paddingBottom: 20,
  },
  profileCard: {
    backgroundColor: "#1E293B",
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarText: {
    color: "#FFF",
    fontSize: 28,
    fontWeight: "700",
  },
  name: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "700",
  },
  subtitle: {
    color: "#94A3B8",
    fontSize: 14,
    marginTop: 4,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  summaryValue: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "700",
  },
  summaryLabel: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 2,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 16,
    marginBottom: 4,
  },
  rowText: {
    color: "#F8FAFC",
    fontSize: 16,
  },
  arrow: {
    color: "#64748B",
    fontSize: 16,
  },
});
