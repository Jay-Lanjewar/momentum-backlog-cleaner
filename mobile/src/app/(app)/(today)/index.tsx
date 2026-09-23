import { useCallback, useMemo } from "react";
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
import { useNotificationScheduler } from "@/hooks/useNotificationScheduler";
import {
  getGreeting,
  formatMinutes,
  formatHourMinute,
  isSessionCompleted,
  getActiveSessions,
  getCurrentSession,
  getNextSession,
  getUpcomingSessions,
  type BacklogItemMap,
} from "@/lib/coaching";
import type { PlanSession, DashboardData } from "@/services/types";

import { RecommendedNextCard } from "@/components/dashboard/RecommendedNextCard";
import { BacklogHealthCard } from "@/components/dashboard/BacklogHealthCard";
import { ProgressOverview } from "@/components/dashboard/ProgressOverview";
import { StreakCard } from "@/components/dashboard/StreakCard";
import { BalanceScoreCard } from "@/components/dashboard/BalanceScoreCard";

export default function TodayMissionPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { data, isLoading, refetch, isRefetching } = useDashboard();

  useNotificationScheduler();

  const handleStartStudy = useCallback(
    (session: PlanSession, dashboard: DashboardData) => {
      router.push({
        pathname: "/(app)/(today)/focus",
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
          userName: user?.name ?? "",
        },
      });
    },
    [router, user?.name],
  );

  const prioritizedBacklog = useMemo(
    () => data?.planning.prioritized_backlog ?? [],
    [data?.planning.prioritized_backlog],
  );
  const allSessions = useMemo(
    () => data?.plan.plan.sessions ?? [],
    [data?.plan.plan.sessions],
  );

  const backlogItemMap: BacklogItemMap = useMemo(() => {
    const map = new Map<string, (typeof prioritizedBacklog)[number]>();
    for (const item of prioritizedBacklog) {
      map.set(String(item.id), item);
    }
    return map;
  }, [prioritizedBacklog]);

  const activeSessions = useMemo(
    () => getActiveSessions(allSessions, backlogItemMap),
    [allSessions, backlogItemMap],
  );

  const nowMin = useMemo(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }, []);

  const currentSession = useMemo(
    () => getCurrentSession(activeSessions, nowMin),
    [activeSessions, nowMin],
  );
  const nextSession = useMemo(
    () => getNextSession(activeSessions, nowMin),
    [activeSessions, nowMin],
  );
  const missionSession = currentSession ?? nextSession;

  const upcomingSessions = useMemo(() => {
    const future = getUpcomingSessions(activeSessions, nowMin);
    return future.filter((s) => s.session_id !== missionSession?.session_id);
  }, [activeSessions, nowMin, missionSession]);

  const nextDeadline = useMemo(() => {
    const scheduledItems = allSessions
      .map((s) => backlogItemMap.get(String(s.backlog_item_id)))
      .filter(
        (item): item is NonNullable<typeof item> =>
          item !== undefined && !!item.due_date && !item.overdue,
      )
      .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
    if (scheduledItems.length === 0) return null;
    const d = new Date(scheduledItems[0].due_date!);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }, [allSessions, backlogItemMap]);

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

  const allPlanSessionsCompleted = allSessions.length > 0 &&
    allSessions.every((s) => isSessionCompleted(s, backlogItemMap));

  const healthScore = data.planning.backlog_health.health_score;
  const totalBacklogItems = data.planning.backlog_health.total_items;
  const hasEmptyBacklog = totalBacklogItems === 0;
  const dailyMessage = data.plan.plan.daily_message?.trim() ?? "";
  const topBacklogId = prioritizedBacklog[0]?.id;

  // Study time: actual completed minutes from SessionCompletion (authoritative source)
  const studyMinutes = data.today_completed_minutes ?? 0;

  // Brand-new student: no study days yet and no minutes completed today.
  // Same DashboardData / fetch path — only secondary zero-state cards are deferred.
  const isFirstRun =
    data.streaks.momentum.total_study_days === 0 && studyMinutes === 0;

  const firstRunUpcoming = isFirstRun
    ? upcomingSessions.slice(0, 2)
    : upcomingSessions;

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
          </View>
          <TouchableOpacity onPress={logout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Daily plan message — subordinate to recommendation */}
        {dailyMessage ? (
          <Text style={isFirstRun ? styles.dailyMessageFirstRun : styles.dailyMessage}>
            {dailyMessage}
          </Text>
        ) : null}

        {/* 1. Recommended Next Session (dominant first-run content) */}
        {missionSession ? (
          <RecommendedNextCard
            session={missionSession}
            backlogItem={backlogItemMap.get(String(missionSession.backlog_item_id))}
            isCurrent={missionSession === currentSession}
            healthScore={healthScore}
            isTopPriority={
              topBacklogId !== undefined &&
              String(missionSession.backlog_item_id) === String(topBacklogId)
            }
            onStart={() => handleStartStudy(missionSession, data)}
          />
        ) : hasEmptyBacklog ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Add your first task</Text>
            <Text style={styles.emptySubtitle}>
              Your backlog is empty. Add work so Momentum can build today&apos;s plan.
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(work)")}
              style={styles.emptyCta}
              activeOpacity={0.8}
            >
              <Text style={styles.emptyCtaText}>Add Work</Text>
            </TouchableOpacity>
          </View>
        ) : allPlanSessionsCompleted ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>All caught up!</Text>
            <Text style={styles.emptySubtitle}>
              You&apos;ve completed all of today&apos;s planned work.
            </Text>
          </View>
        ) : allSessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No study time left today</Text>
            <Text style={styles.emptySubtitle}>
              You have {totalBacklogItems} task{totalBacklogItems === 1 ? "" : "s"} waiting, but no free window remains today. Tomorrow&apos;s plan will pick these up.
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(plan)")}
              style={styles.emptyCta}
              activeOpacity={0.8}
            >
              <Text style={styles.emptyCtaText}>View schedule</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No more sessions today</Text>
            <Text style={styles.emptySubtitle}>
              Remaining work will carry over to your next study day.
            </Text>
          </View>
        )}

        {/* 2. Insight — deferred on first-run (zero-state noise) */}
        {!isFirstRun && data.insight && (
          <View style={styles.insightCard}>
            <Text style={styles.insightTitle}>{data.insight.title}</Text>
            <Text style={styles.insightMessage}>{data.insight.message}</Text>
          </View>
        )}

        {/* 3. Progress Overview — deferred on first-run */}
        {!isFirstRun && (
          <ProgressOverview
            totalTasks={data.planning.backlog_health.total_items}
            completedTasks={data.planning.backlog_health.completed_items}
            studyMinutes={studyMinutes}
            streak={data.streaks.momentum}
            deadlineLabel={nextDeadline ?? undefined}
          />
        )}

        {/* 4. Upcoming Sessions — kept on first-run but visually subordinate */}
        {firstRunUpcoming.length > 0 && (
          <View
            style={
              isFirstRun ? styles.upcomingSectionFirstRun : styles.upcomingSection
            }
          >
            <Text
              style={
                isFirstRun
                  ? styles.sectionTitleFirstRun
                  : styles.sectionTitle
              }
            >
              Upcoming Today
            </Text>
            {firstRunUpcoming.map((s) => {
              const item = backlogItemMap.get(String(s.backlog_item_id));
              return (
                <TouchableOpacity
                  key={s.session_id}
                  style={
                    isFirstRun ? styles.sessionRowFirstRun : styles.sessionRow
                  }
                  onPress={() => handleStartStudy(s, data)}
                >
                  <View style={[styles.sessionDot, { backgroundColor: item?.course_color ?? "#6B7280" }]} />
                  <View style={styles.sessionInfo}>
                    <Text style={styles.sessionTime}>
                      {formatHourMinute(s.start_time)}
                    </Text>
                    <Text style={styles.sessionTitle} numberOfLines={1}>
                      {s.reason}
                    </Text>
                  </View>
                  <Text style={styles.sessionDuration}>
                    ~{formatMinutes(s.remaining_minutes)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* 5–7. Secondary analytics — deferred until student has activity */}
        {!isFirstRun && (
          <>
            <BacklogHealthCard health={data.planning.backlog_health} />
            <StreakCard streaks={data.streaks} />
            <BalanceScoreCard balance={data.balance} />
          </>
        )}

        {/* Dev-only Focus Preview */}
        {__DEV__ && (
          <TouchableOpacity
            style={styles.devPreviewButton}
            onPress={() => router.push("/(app)/(today)/focus-preview")}
            activeOpacity={0.7}
          >
            <Text style={styles.devPreviewText}>DEV: Preview Focus Screen</Text>
          </TouchableOpacity>
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
    paddingBottom: 20,
  },
  greeting: {
    fontSize: 26,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  logoutText: {
    fontSize: 14,
    color: "#999",
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
    textAlign: "center",
  },
  emptyCta: {
    marginTop: 16,
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  emptyCtaText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  dailyMessage: {
    fontSize: 14,
    color: "#555",
    marginBottom: 12,
    lineHeight: 20,
  },
  dailyMessageFirstRun: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 8,
    lineHeight: 18,
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
  upcomingSection: {
    marginBottom: 16,
  },
  upcomingSectionFirstRun: {
    marginTop: 4,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A1A",
    marginBottom: 12,
  },
  sectionTitleFirstRun: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
    marginBottom: 8,
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
  sessionRowFirstRun: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 0,
    marginBottom: 4,
    borderWidth: 0,
    gap: 12,
  },
  sessionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionTime: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2563EB",
  },
  sessionTitle: {
    fontSize: 14,
    color: "#333",
  },
  sessionDuration: {
    fontSize: 13,
    color: "#999",
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
  devPreviewButton: {
    backgroundColor: "#F59E0B",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
    marginTop: 24,
    marginBottom: 16,
  },
  devPreviewText: {
    color: "#000",
    fontSize: 13,
    fontWeight: "600",
  },
});
