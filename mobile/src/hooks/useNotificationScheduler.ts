import { useEffect, useRef } from "react";

import { useDashboard } from "@/services/hooks";
import {
  rescheduleTodayNotifications,
} from "@/services/notifications";

export function useNotificationScheduler() {
  const { data: dashboard } = useDashboard();
  const prevSessionIdsRef = useRef<string>("");

  useEffect(() => {
    if (!dashboard) return;

    const sessions = dashboard.plan.plan.sessions;
    const sessionKey = sessions.map((s) => s.session_id).join(",");

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
