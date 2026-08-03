"""Immutable data contracts for the Personal Learning Engine.

The engine is deterministic and pure: no AI, no LLM, no DB. A
:class:`LearningProfile` is accumulated by :func:`record`-ing completed-session
observations and consulted by the adjustment logic to produce
:class:`LearningAdjustment` factors that refine rule-based estimates.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class StudyObservation:
    """One completed study session used for learning.

    ``completion_pct`` is 0.0-1.0. ``session_type`` / ``time_of_day`` /
    ``task_category`` are free-form labels (e.g. "reading", "morning",
    "Physics"); matching is case-insensitive.
    """

    estimated_minutes: int
    actual_minutes: int
    completion_pct: float = 1.0
    session_type: str = "study"
    time_of_day: str = "day"
    task_category: str = ""


@dataclass(frozen=True, slots=True)
class LearningProfile:
    """Accumulated learning history, in recording order (oldest first).

    Immutable: recording an observation returns a new profile.
    """

    observations: tuple[StudyObservation, ...] = ()


@dataclass(frozen=True, slots=True)
class LearningAdjustment:
    """Adjustment factors for one estimate query.

    Each dimension factor is 1.0 until that dimension has enough observations.
    ``factor`` is the combined (product, clamped) multiplier to apply to a
    rule-based estimate. ``applied`` lists which dimensions had sufficient
    history.
    """

    factor: float
    session_type_factor: float = 1.0
    category_factor: float = 1.0
    time_of_day_factor: float = 1.0
    applied: tuple[str, ...] = ()
    session_type_count: int = 0
    category_count: int = 0
    time_of_day_count: int = 0
