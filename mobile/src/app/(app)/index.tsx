import { useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useDashboard } from "@/services/hooks";
import { useAuth } from "@/hooks/useAuth";
import {
  getGreeting,
  formatMinutes,
  formatHourMinute,
  formatTimeRange,
  buildRecommendationReason,
} from "@/lib/coaching";
import type { PlanSession, DashboardData } from "@/services/types";

function getCurrentSession(
  sessions: PlanSession[],
): PlanSession | null {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return (
    sessions.find((s) => {
      const [sh, sm] = s.start_time.split(":").map(Number);
      const [eh, em] = s.end_time.split(":").map(Number);
      return nowMin >= sh * 60 + sm && nowMin < eh * 60 + em;
    }) ?? null
  );
}

function getNextSession(sessions: PlanSession[]): PlanSession | null {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const upcoming = sessions
    .filter((s) => {
      const [sh, sm] = s.start_time.split(":").map(Number);
      return sh * 60 + sm > nowMin;
    })
    .sort((a, b) => {
      const [ah, am] = a.start_time.split(":").map(Number);
      const [bh, bm] = b.start_time.split(":").map(Number);
      return ah * 60 + am - (bh * 60 + bm);
    });
  return upcoming[0] ?? null;
}

export default function TodayMissionPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { data, isLoading, refetch, isRefetching } = useDashboard();

  const handleStartStudy = useCallback(
    (session: PlanSession, dashboard: DashboardData) => {
      router.push({
        pathname: "/(app)/focus",
        params: {
          sessionId: session.session_id,
          backlogItemId: session.backlog_item_id,
          startTime: session.start_time,
          endTime: session.end_time,
          reason: session.reason,
          remainingMinutes: String(session.remaining_minutes),
          sessions: JSON.stringify(dashboard.plan.plan.sessions),
          snapshotId: dashboard.plan.snapshot_id ?? "",
          dailyMessage: dashboard.plan.plan.daily_message,
        },
      });
    },
    [router],
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Could not load dashboard.</Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const activeSessions = data.plan.plan.sessions;
  const currentSession = getCurrentSession(activeSessions);
  const nextSession = getNextSession(activeSessions);
  const missionSession = currentSession ?? nextSession;

  const healthScore = data.planning.backlog_health.health_score;
  const streak = data.streaks.momentum.current_streak;
  const targetMinutes = data.profile?.daily_target_minutes ?? 0;
  const completedToday =
    targetMinutes > 0
      ? Math.min(
          Math.round(
            ((targetMinutes - data.planning.total_required_minutes) /
              targetMinutes) *
              100,
          ),
          100,
        )
      : 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              {getGreeting(user?.name ?? null)}
            </Text>
            <Text style={styles.streakLine}>
              🔥 {streak} day streak
            </Text>
          </View>
          <TouchableOpacity onPress={logout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Mission Card */}
        {missionSession ? (
          <View style={styles.missionCard}>
            <Text style={styles.missionLabel}>TODAY&apos;S MISSION</Text>
            <Text style={styles.missionTitle} numberOfLines={2}>
              {missionSession.reason}
            </Text>
            <Text style={styles.missionTime}>
              {formatTimeRange(
                missionSession.start_time,
                missionSession.end_time,
              )}
            </Text>
            {missionSession.remaining_minutes > 0 && (
              <Text style={styles.missionRemaining}>
                ~{formatMinutes(missionSession.remaining_minutes)} estimated
              </Text>
            )}
            {missionSession === currentSession && (
              <View style={styles.nowBadge}>
                <Text style={styles.nowBadgeText}>NOW</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.startButton}
              onPress={() => handleStartStudy(missionSession, data)}
              activeOpacity={0.8}
            >
              <Text style={styles.startButtonText}>Start Focus Session</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>All caught up!</Text>
            <Text style={styles.emptySubtitle}>
              No more sessions scheduled for today.
            </Text>
          </View>
        )}

        {/* Insight */}
        {data.insight && (
          <View style={styles.insightCard}>
            <Text style={styles.insightTitle}>{data.insight.title}</Text>
            <Text style={styles.insightMessage}>{data.insight.message}</Text>
          </View>
        )}

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{data.planning.backlog_health.pending_items}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{formatMinutes(data.planning.total_required_minutes)}</Text>
            <Text style={styles.statLabel}>Remaining</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, healthScore === "critical" && styles.statCritical]}>
              {healthScore}
            </Text>
            <Text style={styles.statLabel}>Health</Text>
          </View>
        </View>

        {/* Progress */}
        {targetMinutes > 0 && (
          <View style={styles.progressSection}>
            <Text style={styles.progressLabel}>
              Daily Progress: {completedToday}%
            </Text>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(completedToday, 100)}%` },
                ]}
              />
            </View>
          </View>
        )}

        {/* Upcoming Sessions */}
        {activeSessions.length > 1 && (
          <View style={styles.upcomingSection}>
            <Text style={styles.sectionTitle}>Upcoming Today</Text>
            {activeSessions.map((s) => (
              <TouchableOpacity
                key={s.session_id}
                style={[
                  styles.sessionRow,
                  s.session_id === missionSession?.session_id &&
                    styles.sessionRowActive,
                ]}
                onPress={() => handleStartStudy(s, data)}
              >
                <Text style={styles.sessionTime}>
                  {formatHourMinute(s.start_time)}
                </Text>
                <Text style={styles.sessionTitle} numberOfLines={1}>
                  {s.reason}
                </Text>
              </TouchableOpacity>
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
    backgroundColor: "#FAFAFA",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingTop: 16,
    paddingBottom: 24,
  },
  greeting: {
    fontSize: 26,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  streakLine: {
    fontSize: 15,
    color: "#666",
    marginTop: 4,
  },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  logoutText: {
    fontSize: 14,
    color: "#999",
  },
  missionCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  missionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2563EB",
    letterSpacing: 1,
    marginBottom: 8,
  },
  missionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#1A1A1A",
    marginBottom: 8,
  },
  missionTime: {
    fontSize: 15,
    color: "#666",
    marginBottom: 4,
  },
  missionRemaining: {
    fontSize: 14,
    color: "#999",
    marginBottom: 16,
  },
  nowBadge: {
    backgroundColor: "#DCFCE7",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 16,
  },
  nowBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#16A34A",
  },
  startButton: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  startButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  emptyCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 32,
    marginBottom: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#1A1A1A",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: "#666",
  },
  insightCard: {
    backgroundColor: "#F0F4FF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1A1A1A",
    marginBottom: 4,
  },
  insightMessage: {
    fontSize: 14,
    color: "#555",
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 4,
  },
  statCritical: {
    color: "#DC2626",
  },
  statLabel: {
    fontSize: 12,
    color: "#999",
  },
  progressSection: {
    marginBottom: 16,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  progressTrack: {
    height: 8,
    backgroundColor: "#E8E8E8",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#2563EB",
    borderRadius: 4,
  },
  upcomingSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A1A",
    marginBottom: 12,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    gap: 12,
  },
  sessionRowActive: {
    borderColor: "#2563EB",
    backgroundColor: "#F0F4FF",
  },
  sessionTime: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2563EB",
    width: 70,
  },
  sessionTitle: {
    fontSize: 14,
    color: "#333",
    flex: 1,
  },
  errorText: {
    fontSize: 16,
    color: "#666",
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "#2563EB",
    borderRadius: 8,
  },
  retryText: {
    color: "#FFF",
    fontWeight: "600",
  },
});
