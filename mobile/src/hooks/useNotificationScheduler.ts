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
    // Identity must include start_time: a replan that only moves the clock
    // (same session_id, new start_time) must still trigger a reschedule.
    const sessionKey = sessions
      .map((s) => sessionScheduleKey(s.session_id, s.start_time))
      .join(",");

    if (sessionKey === prevSessionIdsRef.current) return;
    prevSessionIdsRef.current = sessionKey;

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

    rescheduleTodayNotifications(sessions, completedIds);
  }, [dashboard]);
}
