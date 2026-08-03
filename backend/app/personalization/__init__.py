"""Personal Learning Engine: deterministic learning from completed study
sessions that refines rule-based estimates. No AI, no LLM, no DB; planner
behaviour is unchanged until personalization is explicitly enabled.
"""
from .contract import LearningAdjustment, LearningProfile, StudyObservation
from .engine import (
    PersonalizedEstimator,
    all_factors,
    apply_adjustment,
    build_adjustment,
    record,
)
from .statistics import clamp, rolling_mean, safe_ratio
from .strategy import (
    DEFAULT_FACTOR,
    MAX_FACTOR,
    MIN_COMPLETION_PCT,
    MIN_FACTOR,
    MIN_OBSERVATIONS,
    ROLLING_WINDOW,
    PersonalizationStrategy,
)

__all__ = [
    "DEFAULT_FACTOR",
    "LearningAdjustment",
    "LearningProfile",
    "MAX_FACTOR",
    "MIN_COMPLETION_PCT",
    "MIN_FACTOR",
    "MIN_OBSERVATIONS",
    "PersonalizationStrategy",
    "PersonalizedEstimator",
    "ROLLING_WINDOW",
    "StudyObservation",
    "all_factors",
    "apply_adjustment",
    "build_adjustment",
    "clamp",
    "record",
    "rolling_mean",
    "safe_ratio",
]
