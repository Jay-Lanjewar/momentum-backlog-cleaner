from datetime import date

from app.core.timezone import now_in_user_tz, today_in_user_tz

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
FIXED_COMMITMENT_TRANSITION_MINUTES = 5
ENERGY_PEAK_MAP = {
    "morning": {"morning": "high", "afternoon": "medium", "evening": "low", "night": "low"},
    "afternoon": {"morning": "medium", "afternoon": "high", "evening": "medium", "night": "low"},
    "evening": {"morning": "low", "afternoon": "medium", "evening": "high", "night": "medium"},
    "night": {"morning": "low", "afternoon": "low", "evening": "medium", "night": "high"},
}


def _parse_time(time_str: str) -> int:
    if not isinstance(time_str, str):
        raise ValueError("Time must be a string in HH:MM format")
    parts = time_str.split(":")
    if len(parts) != 2 or any(len(part) != 2 or not part.isdigit() for part in parts):
        raise ValueError("Time must be a string in HH:MM format")
    hour, minute = (int(part) for part in parts)
    if not 0 <= hour < 24 or not 0 <= minute < 60:
        raise ValueError("Time must be a valid 24-hour time")
    return hour * 60 + minute


def _format_time(minutes: int) -> str:
    h = minutes // 60
    m = minutes % 60
    return f"{h:02d}:{m:02d}"


def _get_day_from_date(dt: date | None = None) -> str:
    if dt is None:
        dt = today_in_user_tz()
    return WEEKDAYS[dt.weekday()]


def _compute_energy_rating(
    window_start_minutes: int, energy_peak: str | None
) -> str:
    if not energy_peak:
        return "medium"
    peak_map = ENERGY_PEAK_MAP.get(energy_peak, ENERGY_PEAK_MAP["afternoon"])

    hour = window_start_minutes // 60
    if 5 <= hour < 12:
        time_of_day = "morning"
    elif 12 <= hour < 17:
        time_of_day = "afternoon"
    elif 17 <= hour < 21:
        time_of_day = "evening"
    else:
        time_of_day = "night"

    return peak_map.get(time_of_day, "medium")


def compute_available_windows(
    weekly_schedule: dict | None,
    sleep_schedule: dict | None,
    preferred_window: dict | None,
    energy_peak: str | None = None,
    target_date: date | None = None,
) -> list[dict]:
    if not weekly_schedule:
        return []

    day_name = _get_day_from_date(target_date)
    if not isinstance(weekly_schedule, dict):
        return []

    day_blocks = []
    for key, blocks in weekly_schedule.items():
        if isinstance(key, str) and key.strip().lower() == day_name:
            if not isinstance(blocks, list):
                return []
            day_blocks.extend(blocks)

    busy_intervals: list[tuple[int, int]] = []

    for block in day_blocks:
        if not isinstance(block, dict):
            return []
        try:
            start_min = _parse_time(block.get("start"))
            end_min = _parse_time(block.get("end"))
        except (TypeError, ValueError):
            # A malformed fixed block must not open time that may be busy.
            return []
        if end_min <= start_min:
            return []
        # Weekly schedule entries are fixed commitments. Their display type is
        # metadata, so missing, legacy, or differently-cased types still block.
        # Reserve transition time after each commitment; merging below ensures
        # adjacent or overlapping commitments share the same trailing buffer.
        busy_intervals.append(
            (
                start_min,
                min(end_min + FIXED_COMMITMENT_TRANSITION_MINUTES, 1440),
            )
        )

    if sleep_schedule:
        sleep_start = _parse_time(sleep_schedule.get("start", "22:00"))
        sleep_end = _parse_time(sleep_schedule.get("end", "06:00"))
        if sleep_start < sleep_end:
            busy_intervals.append((sleep_start, sleep_end))
        else:
            busy_intervals.append((0, sleep_end))
            busy_intervals.append((sleep_start, 1440))

    busy_intervals.sort()

    merged_busy: list[tuple[int, int]] = []
    for interval in busy_intervals:
        if not merged_busy or interval[0] > merged_busy[-1][1]:
            merged_busy.append(list(interval))
        else:
            merged_busy[-1][1] = max(merged_busy[-1][1], interval[1])
    merged_busy = [(s, e) for s, e in merged_busy]

    window_start = 0
    window_end = 1440
    if preferred_window:
        window_start = _parse_time(preferred_window.get("earliest_start", "00:00"))
        window_end = _parse_time(preferred_window.get("latest_end", "23:59"))

    now = now_in_user_tz()
    if target_date is None or target_date == now.date():
        current_minutes = now.hour * 60 + now.minute
        if window_start < current_minutes + 15:
            window_start = min(current_minutes + 15, window_end)

    available_windows: list[dict] = []
    cursor = window_start

    for busy_start, busy_end in merged_busy:
        if busy_end <= cursor:
            continue
        if busy_start > cursor:
            gap_start = cursor
            gap_end = min(busy_start, window_end)
            if gap_end > gap_start:
                energy = _compute_energy_rating(gap_start, energy_peak)
                available_windows.append(
                    {
                        "start": _format_time(gap_start),
                        "end": _format_time(gap_end),
                        "total_minutes": gap_end - gap_start,
                        "energy_rating": energy,
                    }
                )
        cursor = max(cursor, busy_end)
        if cursor >= window_end:
            break

    if cursor < window_end:
        energy = _compute_energy_rating(cursor, energy_peak)
        available_windows.append(
            {
                "start": _format_time(cursor),
                "end": _format_time(window_end),
                "total_minutes": window_end - cursor,
                "energy_rating": energy,
            }
        )

    return available_windows


def compute_total_available_minutes(available_windows: list[dict]) -> int:
    return sum(w["total_minutes"] for w in available_windows)
