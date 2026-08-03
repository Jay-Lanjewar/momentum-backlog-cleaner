from __future__ import annotations

from datetime import date

from .contract import CompletionStatus, PlannedSession

OVERDUE_BOOST = 20
SKIPPED_BOOST = 10


def carry_minutes(session: PlannedSession) -> int:
    if session.status is CompletionStatus.COMPLETED:
        return 0
    if session.status is CompletionStatus.PARTIAL:
        return max(0, session.duration_minutes - session.completed_minutes)
    return session.duration_minutes


def overdue_boost(due_date: date | None, target_date: date | None) -> int:
    if due_date is not None and target_date is not None and due_date < target_date:
        return OVERDUE_BOOST
    return 0


def skipped_boost(sessions: tuple[PlannedSession, ...]) -> int:
    if any(s.status is CompletionStatus.SKIPPED for s in sessions):
        return SKIPPED_BOOST
    return 0


def priority_boost(
    due_date: date | None,
    sessions: tuple[PlannedSession, ...],
    target_date: date | None,
) -> int:
    return overdue_boost(due_date, target_date) + skipped_boost(sessions)
