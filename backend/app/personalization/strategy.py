"""Adjustment-factor decision strategy.

Deterministic rules:

- A group (session type / task category / time of day) only adapts once it has
  ``MIN_OBSERVATIONS`` completed sessions (never overreact to one session).
- Only observations with ``completion_pct >= MIN_COMPLETION_PCT`` teach
  duration (a half-finished session does not).
- Each per-session ratio (actual / estimated) is winsorized into
  ``[MIN_FACTOR, MAX_FACTOR]`` before averaging, so outliers cannot dominate.
- The group factor is a rolling mean over the last ``ROLLING_WINDOW`` ratios,
  clamped to ``[MIN_FACTOR, MAX_FACTOR]``.
- The combined factor is the product of the three dimension factors, clamped
  to the same safe range.

For speed the profile is indexed once per distinct profile into a bounded
memo cache (``profile.observations`` is hashable), so a per-task adjustment is
a small, fixed number of dict lookups regardless of profile size.
"""
from __future__ import annotations

from collections import OrderedDict

from .contract import LearningAdjustment, LearningProfile
from .statistics import clamp, rolling_mean, safe_ratio

MIN_OBSERVATIONS = 3
ROLLING_WINDOW = 20
MIN_FACTOR = 0.5
MAX_FACTOR = 2.0
MIN_COMPLETION_PCT = 0.5
DEFAULT_FACTOR = 1.0

_CACHE_MAX = 128


def _normalize(value: str) -> str:
    return (value or "").strip().lower()


def _group_factor(ratios: list[float]) -> float:
    if len(ratios) < MIN_OBSERVATIONS:
        return DEFAULT_FACTOR
    return clamp(rolling_mean(ratios, ROLLING_WINDOW), MIN_FACTOR, MAX_FACTOR)


class PersonalizationStrategy:
    """Computes deterministic adjustment factors from a profile."""

    def __init__(self) -> None:
        self._index_cache: "OrderedDict[int, tuple[LearningProfile, dict[str, dict[str, tuple[float, int]]]]]" = (
            OrderedDict()
        )

    def _index(
        self, profile: LearningProfile
    ) -> dict[str, dict[str, tuple[float, int]]]:
        cache_id = id(profile)
        cached = self._index_cache.get(cache_id)
        if cached is not None and cached[0] is profile:
            return cached[1]
        index: dict[str, dict[str, tuple[float, int]]] = {
            "session_type": {},
            "task_category": {},
            "time_of_day": {},
        }
        for observation in profile.observations:
            if observation.completion_pct < MIN_COMPLETION_PCT:
                continue
            ratio = safe_ratio(
                observation.actual_minutes, observation.estimated_minutes
            )
            if ratio is None:
                continue
            ratio = clamp(ratio, MIN_FACTOR, MAX_FACTOR)
            for field in ("session_type", "task_category", "time_of_day"):
                label = _normalize(getattr(observation, field))
                if not label:
                    continue
                index[field].setdefault(label, []).append(ratio)
        for field in index:
            index[field] = {
                label: (_group_factor(ratios), len(ratios))
                for label, ratios in index[field].items()
            }
        self._index_cache[cache_id] = (profile, index)
        self._index_cache.move_to_end(cache_id)
        while len(self._index_cache) > _CACHE_MAX:
            self._index_cache.popitem(last=False)
        return index

    def combined_factor(
        self,
        profile: LearningProfile,
        *,
        session_type: str = "study",
        task_category: str = "",
        time_of_day: str = "day",
    ) -> float:
        """Lean per-item multiplier.

        Product of the dimension factors that have enough history, clamped to
        ``[MIN_FACTOR, MAX_FACTOR]``; 1.0 when nothing adapts. Deterministic
        and identical to :meth:`adjustment_for`'s ``factor``.
        """
        index = self._index(profile)
        session_entry = index["session_type"].get(_normalize(session_type))
        category_entry = index["task_category"].get(_normalize(task_category))
        time_entry = index["time_of_day"].get(_normalize(time_of_day))

        factor = DEFAULT_FACTOR
        applied = False
        if session_entry is not None and session_entry[1] >= MIN_OBSERVATIONS:
            factor *= session_entry[0]
            applied = True
        if category_entry is not None and category_entry[1] >= MIN_OBSERVATIONS:
            factor *= category_entry[0]
            applied = True
        if time_entry is not None and time_entry[1] >= MIN_OBSERVATIONS:
            factor *= time_entry[0]
            applied = True
        if not applied:
            return DEFAULT_FACTOR
        return clamp(factor, MIN_FACTOR, MAX_FACTOR)

    def adjustment_for(
        self,
        profile: LearningProfile,
        *,
        session_type: str = "study",
        task_category: str = "",
        time_of_day: str = "day",
    ) -> LearningAdjustment:
        index = self._index(profile)
        session_entry = index["session_type"].get(_normalize(session_type))
        category_entry = index["task_category"].get(_normalize(task_category))
        time_entry = index["time_of_day"].get(_normalize(time_of_day))

        session_factor = session_entry[0] if session_entry is not None else 1.0
        category_factor = category_entry[0] if category_entry is not None else 1.0
        time_factor = time_entry[0] if time_entry is not None else 1.0
        session_count = session_entry[1] if session_entry is not None else 0
        category_count = category_entry[1] if category_entry is not None else 0
        time_count = time_entry[1] if time_entry is not None else 0

        applied = tuple(
            label
            for label, count in (
                ("session_type", session_count),
                ("category", category_count),
                ("time_of_day", time_count),
            )
            if count >= MIN_OBSERVATIONS
        )

        return LearningAdjustment(
            factor=clamp(
                session_factor * category_factor * time_factor,
                MIN_FACTOR,
                MAX_FACTOR,
            ),
            session_type_factor=session_factor,
            category_factor=category_factor,
            time_of_day_factor=time_factor,
            applied=applied,
            session_type_count=session_count,
            category_count=category_count,
            time_of_day_count=time_count,
        )

    def all_factors(
        self, profile: LearningProfile
    ) -> dict[str, dict[str, float]]:
        """All group factors per dimension, for inspection/reporting.

        Keys are the normalized group labels found in the profile; values are
        deterministic (sorted by label).
        """
        index = self._index(profile)
        return {
            field: {
                label: entry[0]
                for label, entry in sorted(groups.items())
            }
            for field, groups in index.items()
        }
