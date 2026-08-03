"""Shared planning contracts for the planning pipeline.

Annotation keys are the shared vocabulary stages use to communicate through
``PlanningContext.backlog`` entries. Every key is prefixed with ``_`` so it can
never collide with a backlog item's own fields.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

_RESOLVED_MINUTES_KEY = "_resolved_minutes"
_PLANNING_SCORE_KEY = "_planning_score"
_PRIORITY_BOOST_KEY = "_priority_boost"
_SESSION_DURATIONS_KEY = "_session_durations"
_ID_STR_KEY = "_id_str"


@dataclass(frozen=True, slots=True)
class PlanningContext:
    """Immutable carrier exchanged between pipeline stages.

    ``backlog`` is a tuple of annotated item dicts. Stages mutate the item
    payloads in place (owned copies made by the estimation stage) and produce a
    new ``PlanningContext`` via ``dataclasses.replace`` whenever a top-level
    output changes.
    """

    backlog: tuple[dict, ...]
    planning_date: date
    scheduling_windows: tuple[dict, ...]
    completed_sessions: tuple[dict, ...] | None = None
    previous_plan: dict | None = None
    daily_capacity_minutes: int | None = None
    generated_sessions: tuple[dict, ...] = ()
    overflow: tuple[str, ...] = ()
    final_plan: dict | None = None
