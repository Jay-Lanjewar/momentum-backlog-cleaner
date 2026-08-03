"""PlanningPipeline orchestration.

The pipeline is the single entry point for planning. It executes its stages in
order and assembles the final output contract.
"""
from __future__ import annotations

from dataclasses import replace
from datetime import date
from typing import Callable, Sequence

from app.estimation import estimate

from .contract import PlanningContext
from .stage import (
    AdaptiveReschedulerStage,
    DeterministicSchedulerStage,
    EstimationStage,
    PlanningScoreStage,
    SessionSplitterStage,
    Stage,
)


def build_planning_context(
    planning_data: dict,
    daily_capacity_minutes: int | None = None,
    target_date: date | None = None,
    previous_plan: dict | None = None,
    completions: list[dict] | None = None,
) -> PlanningContext:
    return PlanningContext(
        backlog=tuple(planning_data.get("prioritized_backlog", [])),
        planning_date=target_date or date.today(),
        scheduling_windows=tuple(planning_data.get("available_windows", [])),
        completed_sessions=tuple(completions) if completions is not None else None,
        previous_plan=previous_plan,
        daily_capacity_minutes=daily_capacity_minutes,
    )


def _assemble_final_plan(context: PlanningContext) -> dict:
    sessions = list(context.generated_sessions)
    overflow = list(context.overflow)
    pending_count = len(context.backlog)
    scheduled_count = len(set(s["backlog_item_id"] for s in sessions))
    message = (
        f"Planned {scheduled_count} of {pending_count} items. "
        f"{'Keep up the great work!' if overflow else 'All tasks scheduled!'}"
    )
    return {"sessions": sessions, "daily_message": message, "overflow": overflow}


class PlanningPipeline:
    """Executes planning stages in order and returns the final plan."""

    def __init__(
        self,
        estimate_fn: Callable[[dict], object] = estimate,
        stages: Sequence[Stage] | None = None,
    ):
        self._stages = tuple(stages) if stages is not None else (
            EstimationStage(estimate_fn),
            PlanningScoreStage(),
            SessionSplitterStage(),
            AdaptiveReschedulerStage(),
            DeterministicSchedulerStage(),
        )

    def execute(self, context: PlanningContext) -> dict:
        for stage in self._stages:
            context = stage.execute(context)
        context = replace(context, final_plan=_assemble_final_plan(context))
        return context.final_plan
