import logging
import uuid
from datetime import date

logger = logging.getLogger(__name__)


def _to_minutes(time_str: str) -> int:
    parts = time_str.split(":")
    return int(parts[0]) * 60 + int(parts[1])


class PlanValidator:
    def validate(
        self,
        raw: dict | None,
        valid_backlog_ids: set[uuid.UUID],
        available_windows: list[dict],
    ) -> dict | None:
        if raw is None:
            return None

        if not isinstance(raw, dict):
            return None

        sessions = raw.get("sessions", [])
        overflow = raw.get("overflow", [])
        daily_message = raw.get("daily_message", "")

        if not isinstance(sessions, list) or not isinstance(overflow, list):
            return None

        valid_ids = valid_backlog_ids
        seen_ids: set[uuid.UUID] = set()
        total_window_minutes = sum(w["total_minutes"] for w in available_windows)

        scheduled_ids: set[uuid.UUID] = set()
        total_scheduled_minutes = 0
        occupied_intervals: list[tuple[int, int]] = []

        valid_sessions = []
        for session in sessions:
            if not isinstance(session, dict):
                continue

            session_id = session.get("backlog_item_id")
            start = session.get("start_time")
            end = session.get("end_time")
            reason = session.get("reason", "")

            if not session_id or not start or not end:
                continue

            try:
                item_id = uuid.UUID(str(session_id))
            except (ValueError, AttributeError):
                continue

            if item_id not in valid_ids:
                continue

            if item_id in scheduled_ids:
                continue

            try:
                start_min = _to_minutes(start)
                end_min = _to_minutes(end)
            except (ValueError, IndexError):
                continue

            if end_min <= start_min:
                continue

            duration = end_min - start_min

            if not self._fits_in_windows(start_min, end_min, available_windows):
                continue

            if self._overlaps(start_min, end_min, occupied_intervals):
                continue

            total_scheduled_minutes += duration
            if total_window_minutes > 0 and total_scheduled_minutes > total_window_minutes:
                continue

            scheduled_ids.add(item_id)
            occupied_intervals.append((start_min, end_min))
            occupied_intervals.sort()

            valid_sessions.append({
                "backlog_item_id": str(item_id),
                "start_time": start,
                "end_time": end,
                "reason": reason,
            })
            seen_ids.add(item_id)

        valid_overflow = []
        for oid in overflow:
            try:
                oid_uuid = uuid.UUID(str(oid))
                if oid_uuid in valid_ids and oid_uuid not in scheduled_ids:
                    valid_overflow.append(str(oid_uuid))
                    scheduled_ids.add(oid_uuid)
            except (ValueError, AttributeError):
                continue

        unscheduled = valid_ids - scheduled_ids
        for uid in unscheduled:
            valid_overflow.append(str(uid))

        if not valid_sessions and not valid_overflow:
            return None

        return {
            "sessions": valid_sessions,
            "daily_message": daily_message or "Keep going!",
            "overflow": list(dict.fromkeys(valid_overflow)),
        }

    def _fits_in_windows(self, start: int, end: int, windows: list[dict]) -> bool:
        for w in windows:
            w_start = _to_minutes(w["start"])
            w_end = _to_minutes(w["end"])
            if start >= w_start and end <= w_end:
                return True
        return False

    def _overlaps(self, start: int, end: int, intervals: list[tuple[int, int]]) -> bool:
        for s, e in intervals:
            if start < e and end > s:
                return True
        return False
