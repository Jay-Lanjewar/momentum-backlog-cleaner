from datetime import date

from app.estimation import estimate
from app.planning_pipeline import PlanningPipeline, build_planning_context


def generate_deterministic_plan(
    planning_data: dict,
    daily_capacity_minutes: int | None = None,
    target_date: date | None = None,
    previous_plan: dict | None = None,
    completions: list[dict] | None = None,
) -> dict:
    return PlanningPipeline(estimate_fn=estimate).execute(
        build_planning_context(
            planning_data,
            daily_capacity_minutes=daily_capacity_minutes,
            target_date=target_date,
            previous_plan=previous_plan,
            completions=completions,
        )
    )
