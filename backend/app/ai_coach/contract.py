"""Immutable data contracts for the AI Study Coach.

The coach is a pure explanation layer that sits AFTER the planning pipeline.
It never changes planner decisions: it receives a read-only, sanitized view of
the plan and the public backlog and produces per-session explanations plus one
daily summary. No planner-internal annotation key ever appears here.
"""
from __future__ import annotations

from dataclasses import dataclass

_PUBLIC_ITEM_KEYS = (
    "id",
    "title",
    "course_id",
    "course_name",
    "course_color",
    "priority",
    "score",
    "estimated_minutes",
    "due_date",
    "overdue",
    "status",
)


def sanitize_item(item: dict) -> dict:
    """Return a copy of a backlog item containing only public fields.

    Filters out every planner-internal annotation key (``_id_str``,
    ``_resolved_minutes``, ``_planning_score``, ``_priority_boost``,
    ``_session_durations``) so the coach can never read planner internals.
    """
    return {key: item[key] for key in _PUBLIC_ITEM_KEYS if key in item}


@dataclass(frozen=True, slots=True)
class CoachContext:
    """Read-only input to the coach.

    ``sessions`` and ``backlog`` hold sanitized copies; ``previous_plan`` and
    ``completions`` are the same public inputs the planner accepts. Nothing in
    this context is mutable by the coach.
    """

    sessions: tuple[dict, ...]
    backlog: tuple[dict, ...]
    daily_message: str
    overflow: tuple[str, ...]
    previous_plan: dict | None = None
    completions: tuple[dict, ...] | None = None


@dataclass(frozen=True, slots=True)
class CoachExplanation:
    """A short, deterministic reason for one planned session."""

    backlog_item_id: str
    start_time: str
    end_time: str
    short_reason: str


@dataclass(frozen=True, slots=True)
class CoachSummary:
    """The daily coaching summary."""

    sentences: tuple[str, ...]
    total_minutes: int
    session_count: int


@dataclass(frozen=True, slots=True)
class CoachingResult:
    """Everything the coach produces for one plan."""

    explanations: tuple[CoachExplanation, ...]
    summary: CoachSummary
