"""AI Study Coach: explanation layer that runs AFTER the planning pipeline.

The coach never makes planning decisions (no ordering, scoring, estimation,
splitting, or rescheduling). It reads a sanitized, public-only view of the plan
and produces additional metadata: one short reason per planned session and one
daily summary. The planner output is never modified.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from .contract import (
    CoachContext,
    CoachingResult,
    sanitize_item,
)
from .fallback import generate_template_coaching


def build_coach_context(
    plan: dict,
    planning_data: dict | None = None,
    previous_plan: dict | None = None,
    completions: list[dict] | None = None,
) -> CoachContext:
    """Build a read-only coach context from public data only.

    ``plan`` is the planner output (``sessions``, ``daily_message``,
    ``overflow``). Backlog items are sanitized to their public fields so no
    planner-internal annotation ever reaches the coach.
    """
    sessions = tuple(plan.get("sessions", []))
    backlog_items = planning_data.get("prioritized_backlog", []) if planning_data else []
    backlog = tuple(sanitize_item(item) for item in backlog_items)
    return CoachContext(
        sessions=sessions,
        backlog=backlog,
        daily_message=plan.get("daily_message", ""),
        overflow=tuple(plan.get("overflow", [])),
        previous_plan=previous_plan,
        completions=tuple(completions) if completions is not None else None,
    )


class CoachProvider(ABC):
    """Seam for explanation providers.

    Only :class:`TemplateCoachProvider` is implemented (deterministic, no
    network). Future Gemini/OpenAI providers implement :meth:`generate` by
    rendering the context with ``prompt_builder.build_prompt``, calling the
    model, and parsing the response into a :class:`CoachingResult` — falling
    back to templates on any failure so the API contract never breaks.
    """

    @abstractmethod
    def generate(self, context: CoachContext) -> CoachingResult:
        raise NotImplementedError


class TemplateCoachProvider(CoachProvider):
    """Deterministic provider: template explanations, always available."""

    def generate(self, context: CoachContext) -> CoachingResult:
        return generate_template_coaching(context)


class StudyCoach:
    """Orchestrates a :class:`CoachProvider` for one plan."""

    def __init__(self, provider: CoachProvider | None = None):
        self._provider = provider or TemplateCoachProvider()

    @property
    def provider(self) -> CoachProvider:
        return self._provider

    def coach(self, context: CoachContext) -> CoachingResult:
        return self._provider.generate(context)


def generate_coaching(
    plan: dict,
    planning_data: dict | None = None,
    previous_plan: dict | None = None,
    completions: list[dict] | None = None,
    provider: CoachProvider | None = None,
) -> CoachingResult:
    """Convenience entry point: plan output + public data -> coaching result."""
    context = build_coach_context(
        plan, planning_data, previous_plan=previous_plan, completions=completions
    )
    return StudyCoach(provider=provider).coach(context)
