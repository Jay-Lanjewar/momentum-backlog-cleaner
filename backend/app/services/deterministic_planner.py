import uuid


def _to_minutes(time_str: str) -> int:
    parts = time_str.split(":")
    return int(parts[0]) * 60 + int(parts[1])


def _format_time(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def generate_deterministic_plan(
    planning_data: dict,
    daily_capacity_minutes: int | None = None,
) -> dict:
    windows = planning_data.get("available_windows", [])
    backlog = planning_data.get("prioritized_backlog", [])
    backlog.sort(key=lambda x: (-x["score"], x["priority"]))

    total_available = sum(w.get("total_minutes", 0) for w in windows)
    capacity = daily_capacity_minutes if daily_capacity_minutes and daily_capacity_minutes > 0 else total_available

    occupied_intervals: list[list[int]] = []
    sessions = []
    overflow_ids = set()
    time_used = 0

    for item in backlog:
        if time_used >= capacity:
            overflow_ids.add(str(item["id"]))
            continue

        item_id = str(item["id"])
        est_minutes = item.get("estimated_minutes") or 60
        remaining = est_minutes

        while remaining > 0 and time_used < capacity:
            available_in_window = capacity - time_used
            slot = _find_best_slot(
                min(remaining, available_in_window),
                windows,
                occupied_intervals,
            )
            if slot is None:
                break

            window_start, window_end, slot_start, slot_end, used = slot
            sessions.append({
                "backlog_item_id": item_id,
                "start_time": _format_time(slot_start),
                "end_time": _format_time(slot_end),
                "reason": f"Work on {item['title']}",
                "remaining_minutes": remaining - used,
            })
            occupied_intervals.append([slot_start, slot_end])
            occupied_intervals.sort(key=lambda x: x[0])
            remaining -= used
            time_used += used

        if remaining > 0:
            overflow_ids.add(item_id)

    pending_count = len(backlog)
    scheduled_count = len(set(s["backlog_item_id"] for s in sessions))
    message = (
        f"Planned {scheduled_count} of {pending_count} items. "
        f"{'Keep up the great work!' if overflow_ids else 'All tasks scheduled!'}"
    )

    return {
        "sessions": sessions,
        "daily_message": message,
        "overflow": list(overflow_ids),
    }


def _find_best_slot(
    needed_minutes: int,
    windows: list[dict],
    occupied: list[list[int]],
) -> tuple[int, int, int, int, int] | None:
    for w in windows:
        w_start = _to_minutes(w["start"])
        w_end = _to_minutes(w["end"])
        cursor = w_start
        for occ_start, occ_end in occupied:
            if occ_start >= w_end:
                break
            if occ_end > cursor:
                filler_end = min(occ_start, w_end)
                if filler_end > cursor:
                    avail = filler_end - cursor
                    if avail >= 5:
                        used = min(needed_minutes, avail)
                        return (w_start, w_end, cursor, cursor + used, used)
                cursor = max(cursor, occ_end)
        if cursor < w_end:
            avail = w_end - cursor
            if avail >= 5:
                used = min(needed_minutes, avail)
                return (w_start, w_end, cursor, cursor + used, used)
    return None
