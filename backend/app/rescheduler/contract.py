from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from enum import Enum


class CompletionStatus(str, Enum):
    COMPLETED = "completed"
    PARTIAL = "partial"
    SKIPPED = "skipped"


@dataclass(frozen=True, slots=True)
class PlannedSession:
    session_number: int
    duration_minutes: int
    status: CompletionStatus
    completed_minutes: int = 0


@dataclass(frozen=True, slots=True)
class ReschedulableTask:
    backlog_item_id: str
    sessions: tuple[PlannedSession, ...] = ()
    overflow_minutes: int = 0
    due_date: date | None = None


@dataclass(frozen=True, slots=True)
class TaskAdjustment:
    backlog_item_id: str
    remaining_minutes: int
    priority_boost: int
    session_durations: tuple[int, ...]


@dataclass(frozen=True, slots=True)
class ReschedulingResult:
    adjustments: tuple[TaskAdjustment, ...]
    total_remaining_minutes: int
