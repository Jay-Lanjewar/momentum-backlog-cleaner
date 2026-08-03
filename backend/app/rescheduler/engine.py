from __future__ import annotations

from datetime import date

from .contract import ReschedulableTask, ReschedulingResult, TaskAdjustment
from .strategy import carry_minutes, priority_boost


def reschedule(
    tasks: list[ReschedulableTask] | tuple[ReschedulableTask, ...],
    target_date: date | None = None,
) -> ReschedulingResult:
    adjustments = []
    for task in tasks:
        durations = [
            remaining
            for session in task.sessions
            for remaining in [carry_minutes(session)]
            if remaining > 0
        ]
        overflow = max(0, task.overflow_minutes)
        if overflow > 0:
            durations.append(overflow)
        adjustments.append(TaskAdjustment(
            backlog_item_id=task.backlog_item_id,
            remaining_minutes=sum(durations),
            priority_boost=priority_boost(task.due_date, task.sessions, target_date),
            session_durations=tuple(durations),
        ))
    adjustments.sort(key=lambda a: a.backlog_item_id)
    return ReschedulingResult(
        adjustments=tuple(adjustments),
        total_remaining_minutes=sum(a.remaining_minutes for a in adjustments),
    )
