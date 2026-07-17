from datetime import date, datetime

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
BLOCKED_TYPES = {"school", "coaching", "break", "sleep", "commute"}
ENERGY_PEAK_MAP = {
    "morning": {"morning": "high", "afternoon": "medium", "evening": "low", "night": "low"},
    "afternoon": {"morning": "medium", "afternoon": "high", "evening": "medium", "night": "low"},
    "evening": {"morning": "low", "afternoon": "medium", "evening": "high", "night": "medium"},
    "night": {"morning": "low", "afternoon": "low", "evening": "medium", "night": "high"},
}


def _parse_time(time_str: str) -> int:
    parts = time_str.split(":")
    return int(parts[0]) * 60 + int(parts[1])


def _format_time(minutes: int) -> str:
    h = minutes // 60
    m = minutes % 60
    return f"{h:02d}:{m:02d}"


def _get_day_from_date(dt: date | None = None) -> str:
    if dt is None:
        dt = date.today()
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
    day_blocks = weekly_schedule.get(day_name, [])

    busy_intervals: list[tuple[int, int]] = []

    for block in day_blocks:
        block_type = block.get("type", "")
        if block_type in BLOCKED_TYPES:
            start_min = _parse_time(block.get("start", "00:00"))
            end_min = _parse_time(block.get("end", "00:00"))
            if end_min > start_min:
                busy_intervals.append((start_min, end_min))

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

    now = datetime.now()
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
