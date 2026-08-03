"""Personal Learning Engine.

Deterministic learning from completed study sessions:

- :func:`record` appends one :class:`StudyObservation` to a profile (returns a
  new, immutable profile).
- :func:`build_adjustment` / :func:`apply_adjustment` turn a rule-based
  estimate into a personalized final estimate.
- :class:`PersonalizedEstimator` composes the existing rule estimator with the
  learning adjustment. It is the integration seam: it can be passed to the
  planner's ``estimate_fn`` slot to explicitly enable personalization, without
  touching the pipeline. With an empty profile it returns the rule estimate
  byte-identically, so default planner behaviour never changes.

No DB access, no network, no randomness.
"""
from __future__ import annotations

from collections.abc import Mapping
from typing import Callable

from app.estimation import EstimationResult, estimate

from .contract import LearningAdjustment, LearningProfile, StudyObservation
from .strategy import PersonalizationStrategy

EstimateFn = Callable[[Mapping | object], EstimationResult]


def record(
    profile: LearningProfile, observation: StudyObservation
) -> LearningProfile:
    """Return a new profile with ``observation`` appended (validated)."""
    if not isinstance(observation, StudyObservation):
        raise TypeError(
            f"Expected StudyObservation, got {type(observation).__name__}"
        )
    if observation.estimated_minutes < 1:
        raise ValueError("estimated_minutes must be >= 1")
    if observation.actual_minutes < 0:
        raise ValueError("actual_minutes must be >= 0")
    completion = max(0.0, min(1.0, float(observation.completion_pct)))
    cleaned = StudyObservation(
        estimated_minutes=int(observation.estimated_minutes),
        actual_minutes=int(observation.actual_minutes),
        completion_pct=completion,
        session_type=(observation.session_type or "study").strip(),
        time_of_day=(observation.time_of_day or "day").strip(),
        task_category=(observation.task_category or "").strip(),
    )
    return LearningProfile(observations=profile.observations + (cleaned,))


def build_adjustment(
    profile: LearningProfile,
    *,
    session_type: str = "study",
    task_category: str = "",
    time_of_day: str = "day",
    strategy: PersonalizationStrategy | None = None,
) -> LearningAdjustment:
    strategy = strategy or PersonalizationStrategy()
    return strategy.adjustment_for(
        profile,
        session_type=session_type,
        task_category=task_category,
        time_of_day=time_of_day,
    )


def apply_adjustment(
    estimated_minutes: int, adjustment: LearningAdjustment
) -> int:
    """Final estimate: rule estimate times the combined factor (min 1)."""
    return max(1, round(estimated_minutes * adjustment.factor))


def all_factors(
    profile: LearningProfile, strategy: PersonalizationStrategy | None = None
) -> dict[str, dict[str, float]]:
    strategy = strategy or PersonalizationStrategy()
    return strategy.all_factors(profile)


class PersonalizedEstimator:
    """Rule estimate, then Personal Learning Adjustment, then final estimate.

    Explicit opt-in seam: pass an instance where the planner expects an
    ``estimate_fn``. With an empty (or insufficient) profile every adjustment
    is 1.0x and the rule result is returned unchanged.
    """

    def __init__(
        self,
        profile: LearningProfile | None = None,
        estimate_fn: EstimateFn = estimate,
        strategy: PersonalizationStrategy | None = None,
    ):
        self._profile = profile if profile is not None else LearningProfile()
        self._estimate_fn = estimate_fn
        self._strategy = strategy or PersonalizationStrategy()

    @property
    def profile(self) -> LearningProfile:
        return self._profile

    @staticmethod
    def _coerce_dimensions(
        task: Mapping | object,
        session_type: str | None,
        task_category: str | None,
        time_of_day: str | None,
    ) -> tuple[str, str, str]:
        task_map = task if isinstance(task, Mapping) else {}
        return (
            session_type or task_map.get("session_type") or "study",
            task_category
            or task_map.get("task_category")
            or task_map.get("course_name")
            or "",
            time_of_day or task_map.get("time_of_day") or "day",
        )

    def estimate(
        self,
        task: Mapping | object,
        *,
        session_type: str | None = None,
        task_category: str | None = None,
        time_of_day: str | None = None,
    ) -> EstimationResult:
        rule_result = self._estimate_fn(task)
        session_type, task_category, time_of_day = self._coerce_dimensions(
            task, session_type, task_category, time_of_day
        )

        adjustment = self._strategy.adjustment_for(
            self._profile,
            session_type=session_type,
            task_category=task_category,
            time_of_day=time_of_day,
        )
        if not adjustment.applied:
            return rule_result

        final_minutes = apply_adjustment(rule_result.estimated_minutes, adjustment)
        reasoning = list(rule_result.reasoning) + [
            f"Personal learning: {adjustment.factor:.2f}x total "
            f"(session_type {adjustment.session_type_factor:.2f}x, "
            f"category {adjustment.category_factor:.2f}x, "
            f"time_of_day {adjustment.time_of_day_factor:.2f}x)"
        ]
        return EstimationResult(
            estimated_minutes=final_minutes,
            confidence=rule_result.confidence,
            reasoning=reasoning,
        )

    def __call__(self, task: Mapping | object) -> EstimationResult:
        """Callable form for the planner's ``estimate_fn`` slot.

        Lean path for the pipeline seam, which only consumes
        ``estimated_minutes``: no adjustment detail object and no reasoning
        footnote are built. Produces the same final minutes as :meth:`estimate`
        (both derive the factor from the same precomputed group factors).
        """
        rule_result = self._estimate_fn(task)
        session_type, task_category, time_of_day = self._coerce_dimensions(
            task, None, None, None
        )
        factor = self._strategy.combined_factor(
            self._profile,
            session_type=session_type,
            task_category=task_category,
            time_of_day=time_of_day,
        )
        if factor == 1.0:
            return rule_result
        return EstimationResult(
            estimated_minutes=max(1, round(rule_result.estimated_minutes * factor)),
            confidence=rule_result.confidence,
            reasoning=rule_result.reasoning,
        )
