from datetime import date, datetime

from app.domain.models import BacklogItem, Goal


def _get_today() -> date:
    return date.today()


def _parse_due_date(item: BacklogItem) -> date | None:
    if item.due_date is None:
        return None
    if isinstance(item.due_date, datetime):
        return item.due_date.date()
    return item.due_date


def score_item(item: BacklogItem, goals: list[Goal] | None = None) -> int:
    today = _get_today()
    score = 0

    base_priority = 5 - item.priority
    score += base_priority * 25

    due = _parse_due_date(item)
    if due is not None:
        days_until = (due - today).days
        if days_until < 0:
            score += 200
            score += abs(days_until) * 10
        elif days_until == 0:
            score += 150
        elif days_until <= 2:
            score += 100
        elif days_until <= 7:
            score += 60
        elif days_until <= 14:
            score += 30
        else:
            score += max(5, 30 - days_until)
    else:
        score += 10

    if item.estimated_minutes is not None:
        if item.estimated_minutes <= 15:
            score += 20
        elif item.estimated_minutes <= 30:
            score += 15
        elif item.estimated_minutes <= 60:
            score += 10
        elif item.estimated_minutes >= 120:
            score += 5

    if goals:
        item_lower = item.title.lower()
        for goal in goals:
            if goal.title.lower() in item_lower or item_lower in goal.title.lower():
                score += 30
                break

    return score


def prioritize_backlog(
    items: list[BacklogItem],
    goals: list[Goal] | None = None,
    status_filter: str | None = "pending",
) -> list[tuple[BacklogItem, int]]:
    filtered = [i for i in items if i.status in ("pending", "in_progress")]
    if status_filter:
        filtered = [i for i in filtered if i.status == status_filter]

    scored = [(item, score_item(item, goals)) for item in filtered]
    scored.sort(key=lambda x: (-x[1], x[0].priority))

    return scored


def get_overdue_items(items: list[BacklogItem]) -> list[BacklogItem]:
    today = _get_today()
    return [
        i
        for i in items
        if i.status in ("pending", "in_progress")
        and i.due_date is not None
        and _parse_due_date(i) is not None
        and _parse_due_date(i) < today
    ]
