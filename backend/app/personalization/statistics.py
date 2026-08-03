"""Pure numeric helpers for the Personal Learning Engine.

Every function here is deterministic and allocation-light so the adjustment
step adds negligible overhead to the planner's estimation path.
"""
from __future__ import annotations

from collections.abc import Sequence


def clamp(value: float, low: float, high: float) -> float:
    if value < low:
        return low
    if value > high:
        return high
    return value


def safe_ratio(actual_minutes: int, estimated_minutes: int) -> float | None:
    """actual/estimated, or None when the estimate is not usable."""
    if estimated_minutes <= 0:
        return None
    return actual_minutes / estimated_minutes


def rolling_mean(values: Sequence[float], window: int) -> float:
    """Mean of the most recent ``window`` values (insertion order = recency).

    Returns 0.0 for an empty sequence. The window bounds memory use without
    changing the result for small profiles.
    """
    if not values:
        return 0.0
    recent = values[-window:]
    return sum(recent) / len(recent)
