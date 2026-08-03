"""Deterministic template coaching.

Used when no AI provider is available (and as the base for
``TemplateCoachProvider``). The API contract is identical to an AI-generated
result: one ``CoachExplanation`` per planned session plus one ``CoachSummary``.

The rules are deliberately simple and stable so output is fully deterministic:
the coach explains planner decisions, it never makes them.
"""
from __future__ import annotations

from datetime import date, timedelta

from .contract import (
    CoachContext,
    CoachExplanation,
    CoachingResult,
    CoachSummary,
)

_CLOSE_DEADLINE_DAYS = 3
_LONG_TASK_MINUTES = 90

REASON_CARRIED = "Carried from yesterday because it was unfinished."
REASON_OVERDUE = "Scheduled early because it is overdue."
REASON_CLOSE_DEADLINE = "Moved earlier because the deadline is close."
REASON_SPLIT = "Split into shorter sessions to improve focus."
REASON_LONG_FIRST = "Long task scheduled first while your energy is highest."


def _parse_date(value) -> date | None:
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value)
        except ValueError:
            return None
    return None


def _session_minutes(start_time: str, end_time: str) -> int:
    def to_minutes(value: str) -> int:
        parts = value.split(":")
        return int(parts[0]) * 60 + int(parts[1])

    return max(0, to_minutes(end_time) - to_minutes(start_time))


def _item_lookup(context: CoachContext) -> dict[str, dict]:
    lookup: dict[str, dict] = {}
    for item in context.backlog:
        lookup[str(item["id"])] = item
    return lookup


def _previous_sessions(context: CoachContext) -> list[dict]:
    previous = context.previous_plan
    if not previous:
        return []
    if isinstance(previous, dict):
        return list(previous.get("sessions", []))
    return list(previous)


def _carried_ids(context: CoachContext) -> set[str]:
    """Items whose previous sessions were not fully completed."""
    previous_sessions = _previous_sessions(context)
    if not previous_sessions:
        return set()
    completions: dict[tuple[str, int], dict] = {}
    for completion in context.completions or ():
        backlog_id = completion.get("backlog_item_id")
        completions[
            (backlog_id if isinstance(backlog_id, str) else str(backlog_id),
             int(completion.get("session_number", 0)))
        ] = completion

    counts: dict[str, int] = {}
    carried: set[str] = set()
    for session in previous_sessions:
        backlog_id = session.get("backlog_item_id")
        backlog_id = backlog_id if isinstance(backlog_id, str) else str(backlog_id)
        number = counts.get(backlog_id, 0) + 1
        counts[backlog_id] = number
        completion = completions.get((backlog_id, number))
        status = completion.get("status") if completion else None
        if status != "completed":
            carried.add(backlog_id)
    return carried


def _split_ids(context: CoachContext) -> set[str]:
    """Items planned as more than one session today."""
    counts: dict[str, int] = {}
    for session in context.sessions:
        backlog_id = session.get("backlog_item_id")
        backlog_id = backlog_id if isinstance(backlog_id, str) else str(backlog_id)
        counts[backlog_id] = counts.get(backlog_id, 0) + 1
    return {backlog_id for backlog_id, count in counts.items() if count >= 2}


def _due_days(item: dict) -> int | None:
    due = _parse_date(item.get("due_date"))
    if due is None:
        return None
    return (due - date.today()).days


def _is_overdue(item: dict) -> bool:
    if item.get("overdue"):
        return True
    days = _due_days(item)
    return days is not None and days < 0


def _item_label(item: dict) -> str:
    return item.get("course_name") or item.get("title") or "task"


def _short_reason(
    item: dict,
    *,
    carried: bool,
    split: bool,
    long_task: bool,
    first_session: bool,
) -> str:
    if carried:
        return REASON_CARRIED
    if _is_overdue(item):
        return REASON_OVERDUE
    days = _due_days(item)
    if days is not None and days <= _CLOSE_DEADLINE_DAYS:
        return REASON_CLOSE_DEADLINE
    if split:
        return REASON_SPLIT
    if long_task and first_session:
        return REASON_LONG_FIRST
    return f"Working on {item.get('title') or 'this task'}."


def generate_template_explanations(
    context: CoachContext,
) -> tuple[CoachExplanation, ...]:
    items = _item_lookup(context)
    carried = _carried_ids(context)
    split = _split_ids(context)

    explanations: list[CoachExplanation] = []
    for index, session in enumerate(context.sessions):
        backlog_id = session.get("backlog_item_id")
        backlog_id = backlog_id if isinstance(backlog_id, str) else str(backlog_id)
        item = items.get(backlog_id)
        if item is None:
            item = {}
        estimated = item.get("estimated_minutes")
        long_task = isinstance(estimated, (int, float)) and estimated >= _LONG_TASK_MINUTES
        reason = _short_reason(
            item,
            carried=backlog_id in carried,
            split=backlog_id in split,
            long_task=long_task,
            first_session=index == 0,
        )
        explanations.append(CoachExplanation(
            backlog_item_id=backlog_id,
            start_time=session["start_time"],
            end_time=session["end_time"],
            short_reason=reason,
        ))
    return tuple(explanations)


def generate_template_summary(context: CoachContext) -> CoachSummary:
    items = _item_lookup(context)
    carried = _carried_ids(context)
    split = _split_ids(context)

    total_minutes = sum(
        _session_minutes(session["start_time"], session["end_time"])
        for session in context.sessions
    )

    sentences = ["Today's plan focuses on your highest-impact work."]

    if context.sessions:
        first_id = context.sessions[0]["backlog_item_id"]
        first_item = items.get(str(first_id))
        if first_item is not None and _is_overdue(first_item):
            sentences.append(f"{_item_label(first_item).capitalize()} appears first because it is overdue.")
        elif first_item is not None and first_item.get("overdue") is False and _due_days(first_item) is not None:
            days = _due_days(first_item)
            if days is not None and days <= _CLOSE_DEADLINE_DAYS:
                sentences.append(f"{_item_label(first_item).capitalize()} is scheduled first because its deadline is close.")

    if split:
        sentences.append("Large tasks have been split into manageable sessions.")
    if carried:
        sentences.append("Unfinished work from yesterday is carried into today.")

    hours = total_minutes / 60
    hours_text = f"{hours:g}" if hours == int(hours) else f"{hours:.1f}"
    sentences.append(
        f"You have approximately {hours_text} hours of focused work today."
    )

    if context.overflow:
        sentences.append("Some tasks were left unscheduled for today.")

    return CoachSummary(
        sentences=tuple(sentences),
        total_minutes=total_minutes,
        session_count=len(context.sessions),
    )


def generate_template_coaching(context: CoachContext) -> CoachingResult:
    return CoachingResult(
        explanations=generate_template_explanations(context),
        summary=generate_template_summary(context),
    )
