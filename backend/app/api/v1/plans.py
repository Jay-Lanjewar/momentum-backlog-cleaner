import logging
import uuid

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.domain.models import BacklogItem, Course, Goal, StudentProfile, User, WeeklySchedule
from app.domain.schemas import PlanGenerateResponse, GeneratedPlan, PlanSession
from app.services.planning_engine import PlanningEngine
from app.services.ai_service import PromptBuilder, create_ai_service
from app.services.plan_validator import PlanValidator
from app.services.deterministic_planner import generate_deterministic_plan

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/plans", tags=["plans"])


@router.post("/generate", response_model=PlanGenerateResponse)
async def generate_plan(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile_result = await db.execute(
        select(StudentProfile).where(StudentProfile.user_id == user.id)
    )
    profile = profile_result.scalar_one_or_none()

    schedule_result = await db.execute(
        select(WeeklySchedule).where(WeeklySchedule.user_id == user.id)
    )
    schedule = schedule_result.scalar_one_or_none()

    courses_result = await db.execute(
        select(Course).where(Course.user_id == user.id)
    )
    courses = courses_result.scalars().all()

    backlog_result = await db.execute(
        select(BacklogItem).where(BacklogItem.user_id == user.id)
    )
    backlog_items = backlog_result.scalars().all()

    goals_result = await db.execute(
        select(Goal).where(Goal.user_id == user.id)
    )
    goals = goals_result.scalars().all()

    engine = PlanningEngine(
        profile=profile,
        schedule=schedule,
        courses=courses,
        backlog_items=backlog_items,
        goals=goals,
    )

    target = date.today()
    planning_data = engine.compute(target_date=target)

    valid_backlog_ids = {
        item["id"]
        for item in planning_data.get("prioritized_backlog", [])
    }

    ai_service = create_ai_service()
    prompt_builder = PromptBuilder()
    validator = PlanValidator()

    prompt = prompt_builder.build(planning_data, target_date=target)
    raw_plan = await ai_service.generate_plan(prompt)

    validated = None
    source = "deterministic"
    if raw_plan is not None:
        validated = validator.validate(
            raw=raw_plan,
            valid_backlog_ids=valid_backlog_ids,
            available_windows=planning_data.get("available_windows", []),
        )
        if validated is not None:
            source = "ai"

    if validated is None:
        logger.info("AI plan invalid or unavailable, using deterministic fallback")
        fallback = generate_deterministic_plan(planning_data)
        validated = fallback

    return PlanGenerateResponse(
        plan=GeneratedPlan(
            sessions=[PlanSession(**s) for s in validated["sessions"]],
            daily_message=validated["daily_message"],
            overflow=[uuid.UUID(oid) for oid in validated["overflow"]],
        ),
        source=source,
    )
