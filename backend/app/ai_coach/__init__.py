"""AI Study Coach: a pure explanation layer that sits AFTER the planning
pipeline. It explains planner decisions and generates coaching; it never makes
planning decisions and never modifies the plan.
"""
from .coach import (
    CoachProvider,
    StudyCoach,
    TemplateCoachProvider,
    build_coach_context,
    generate_coaching,
)
from .contract import (
    CoachContext,
    CoachExplanation,
    CoachingResult,
    CoachSummary,
    sanitize_item,
)
from .fallback import (
    REASON_CARRIED,
    REASON_CLOSE_DEADLINE,
    REASON_LONG_FIRST,
    REASON_OVERDUE,
    REASON_SPLIT,
    generate_template_coaching,
    generate_template_explanations,
    generate_template_summary,
)
from .prompt_builder import build_prompt

__all__ = [
    "CoachContext",
    "CoachExplanation",
    "CoachingResult",
    "CoachProvider",
    "CoachSummary",
    "REASON_CARRIED",
    "REASON_CLOSE_DEADLINE",
    "REASON_LONG_FIRST",
    "REASON_OVERDUE",
    "REASON_SPLIT",
    "StudyCoach",
    "TemplateCoachProvider",
    "build_coach_context",
    "build_prompt",
    "generate_coaching",
    "generate_template_coaching",
    "generate_template_explanations",
    "generate_template_summary",
    "sanitize_item",
]
