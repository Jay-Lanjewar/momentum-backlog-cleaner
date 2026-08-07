import logging
import uuid

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.domain.models import BacklogItem, Course, Goal, StudentProfile, User, WeeklySchedule
from app.domain.schemas import (
    BacklogHealth,
    BalanceScoreResponse,
    DashboardResponse,
    GeneratedPlan,
    InsightResponse,
    PlanGenerateResponse,
    PlanSession,
    PlanningPreviewResponse,
    PrioritizedBacklogItem,
    StreakAllResponse,
    StudentProfileResponse,
    TimeBlock,
)
from app.services.ai_service import PromptBuilder, create_ai_service
from app.services.deterministic_planner import generate_deterministic_plan
from app.services.motivation_service import MotivationService
from app.services.plan_validator import PlanValidator
from app.services.planning_engine import PlanningEngine
from app.services.streak_service import StreakService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardResponse)
async def get_dashboard(
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

    planning = PlanningPreviewResponse(
        available_windows=[
            TimeBlock(**w) for w in planning_data["available_windows"]
        ],
        prioritized_backlog=[
            PrioritizedBacklogItem(**b) for b in planning_data["prioritized_backlog"]
        ],
        total_available_minutes=planning_data["total_available_minutes"],
        total_required_minutes=planning_data["total_required_minutes"],
        estimated_days_to_clear=planning_data["estimated_days_to_clear"],
        backlog_health=BacklogHealth(**planning_data["backlog_health"]),
    )

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
    fallback_reason = None
    if raw_plan is not None:
        validated = validator.validate(
            raw=raw_plan,
            valid_backlog_ids=valid_backlog_ids,
            available_windows=planning_data.get("available_windows", []),
        )
        if validated is not None:
            source = "ai"
            logger.info("Using Gemini planner")
        else:
            fallback_reason = "AI plan failed validation"
    else:
        fallback_reason = "AI planner unavailable or returned no plan"

    if validated is None:
        logger.info("Falling back to deterministic planner (%s)", fallback_reason)
        daily_capacity = profile.daily_target_minutes if profile and profile.daily_target_minutes else None
        fallback = generate_deterministic_plan(planning_data, daily_capacity_minutes=daily_capacity)
        validated = fallback

    plan = PlanGenerateResponse(
        plan=GeneratedPlan(
            sessions=[PlanSession(**s) for s in validated["sessions"]],
            daily_message=validated["daily_message"],
            overflow=[uuid.UUID(oid) for oid in validated["overflow"]],
        ),
        source=source,
    )

    streak_service = StreakService(db)
    streaks = await streak_service.get_streaks(user.id)
    balance = await streak_service.compute_balance_score(user.id)

    motivation_service = MotivationService(db)
    insight = await motivation_service.get_insight(user.id)

    return DashboardResponse(
        profile=StudentProfileResponse.model_validate(profile) if profile else None,
        streaks=StreakAllResponse.model_validate(streaks),
        balance=BalanceScoreResponse.model_validate(balance),
        insight=InsightResponse(**insight),
        planning=planning,
        plan=plan,
    )
