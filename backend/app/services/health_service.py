from datetime import date, datetime, timedelta

from app.domain.models import BacklogItem


def _get_today() -> date:
    return date.today()


def compute_backlog_health(
    items: list[BacklogItem],
    total_available_minutes: int = 0,
    avg_daily_minutes: int | None = None,
) -> dict:
    today = _get_today()
    pending = [i for i in items if i.status == "pending"]
    in_progress = [i for i in items if i.status == "in_progress"]
    completed = [i for i in items if i.status == "completed"]

    overdue_items = [
        i
        for i in pending + in_progress
        if i.due_date is not None
        and _parse_due_date(i) is not None
        and _parse_due_date(i) < today
    ]

    completed_7d = [
        i
        for i in completed
        if i.updated_at is not None
        and _to_date(i.updated_at) >= today - timedelta(days=7)
    ]

    total_completed_7d = len(completed_7d)
    total_scheduled_7d = total_completed_7d + len(
        [i for i in pending + in_progress if _was_created_within_days(i, 7)]
    )
    clear_rate = (
        round(total_completed_7d / total_scheduled_7d, 2)
        if total_scheduled_7d > 0
        else 1.0
    )

    pending_minutes = sum(
        (i.estimated_minutes or 60) for i in pending + in_progress
    )

    if pending_minutes == 0:
        health_score = "good"
    elif len(overdue_items) >= 5 or (clear_rate < 0.3 and pending_minutes > 500):
        health_score = "critical"
    elif len(overdue_items) > 0 or clear_rate < 0.6:
        health_score = "fair"
    else:
        health_score = "good"

    if avg_daily_minutes is not None:
        daily_avg = avg_daily_minutes
    else:
        daily_avg = total_available_minutes or 60
    effective_daily = daily_avg * max(clear_rate, 0.3)
    days_to_clear = round(pending_minutes / effective_daily, 1) if effective_daily > 0 else None

    estimated_completion = None
    if days_to_clear is not None:
        estimated_completion = today + timedelta(days=int(days_to_clear) + 1)

    return {
        "total_items": len(items),
        "completed_items": len(completed),
        "overdue_items": len(overdue_items),
        "pending_items": len(pending) + len(in_progress),
        "clear_rate_7d": clear_rate,
        "health_score": health_score,
        "estimated_completion_date": estimated_completion,
    }


def _parse_due_date(item: BacklogItem) -> date | None:
    if item.due_date is None:
        return None
    if isinstance(item.due_date, datetime):
        return item.due_date.date()
    return item.due_date


def _to_date(dt: datetime) -> date:
    return dt.date() if isinstance(dt, datetime) else dt


def _was_created_within_days(item: BacklogItem, days: int) -> bool:
    if item.created_at is None:
        return False
    today = _get_today()
    created = _to_date(item.created_at) if isinstance(item.created_at, datetime) else item.created_at
    return created >= today - timedelta(days=days)
