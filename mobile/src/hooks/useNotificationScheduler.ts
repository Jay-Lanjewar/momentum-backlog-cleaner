import { useEffect, useRef } from "react";

import { useDashboard } from "@/services/hooks";
import {
  requestNotificationPermission,
  rescheduleTodayNotifications,
  sessionScheduleKey,
} from "@/services/notifications";

export function useNotificationScheduler() {
  const { data: dashboard } = useDashboard();
  const prevSessionIdsRef = useRef<string>("");

  // First authenticated Today/dashboard entry only (this hook is not used
  // on auth screens). Fire-and-forget so permission never blocks the UI.
  // The service centralizes granted/denied/once-per-session checks.
  useEffect(() => {
    requestNotificationPermission().catch(() => {});
  }, []);

  useEffect(() => {
    if (!dashboard) return;

    const sessions = dashboard.plan.plan.sessions;

    const backlogItemMap = new Map(
      dashboard.planning.prioritized_backlog.map((item) => [
        String(item.id),
        item,
      ]),
    );

    const completedIds = new Set(
      sessions
        .filter((s) => {
          const item = backlogItemMap.get(String(s.backlog_item_id));
          return item?.status === "completed";
        })
        .map((s) => s.session_id),
    );

    const coursesByBacklogId = new Map(
      dashboard.planning.prioritized_backlog.map((item) => [
        String(item.id),
        item.course_name,
      ]),
    );

    // Identity must cover everything that changes what should be scheduled:
    // start_time (replan moved the clock), end_time (missed trigger is derived
    // from the end), completion state (Work completion can leave session ids
    // and start times untouched), and session identity itself.
    const sessionKey = sessions
      .map(
        (s) =>
          `${sessionScheduleKey(s.session_id, s.start_time)}:${s.end_time}:${
            completedIds.has(s.session_id) ? "completed" : "open"
          }`,
      )
      .join(",");

    if (sessionKey === prevSessionIdsRef.current) return;
    prevSessionIdsRef.current = sessionKey;

    rescheduleTodayNotifications(sessions, completedIds, coursesByBacklogId);
  }, [dashboard]);
}
