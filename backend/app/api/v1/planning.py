import logging

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.domain.models import BacklogItem, Course, Goal, StudentProfile, User, WeeklySchedule
from app.domain.schemas import (
    AdaptivePlanResponse,
    PlanningPreviewResponse,
    SessionCompletionRequest,
    TimeBlock,
    PrioritizedBacklogItem,
    BacklogHealth,
)
from app.services.planning_engine import PlanningEngine
from app.services.adaptive_service import run_adaptive_completion

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/planning", tags=["planning"])


@router.post("/preview", response_model=PlanningPreviewResponse)
async def planning_preview(
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

    result = engine.compute(target_date=date.today())

    return PlanningPreviewResponse(
        available_windows=[
            TimeBlock(**w) for w in result["available_windows"]
        ],
        prioritized_backlog=[
            PrioritizedBacklogItem(**b) for b in result["prioritized_backlog"]
        ],
        total_available_minutes=result["total_available_minutes"],
        total_required_minutes=result["total_required_minutes"],
        estimated_days_to_clear=result["estimated_days_to_clear"],
        backlog_health=BacklogHealth(**result["backlog_health"]),
    )


@router.post("/complete-session", response_model=AdaptivePlanResponse)
async def complete_session(
    data: SessionCompletionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Complete a study session and trigger adaptive rescheduling.

    This endpoint:
    1. Validates the session belongs to the user's active plan
    2. Marks the backlog item as completed
    3. Records the session completion with actual duration
    4. Runs the AdaptiveRescheduler
    5. Generates and persists Plan v2
    6. Returns the new plan with a diff of what changed
    """
    plan_date = date.today()

    # Build planning data from DB (same as dashboard)
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

    planning_data = engine.compute(target_date=plan_date)
    daily_capacity = profile.daily_target_minutes if profile and profile.daily_target_minutes else None

    try:
        result = await run_adaptive_completion(
            db=db,
            user_id=user.id,
            plan_date=plan_date,
            session_id=data.session_id,
            actual_minutes=data.actual_minutes,
            planning_data=planning_data,
            daily_capacity_minutes=daily_capacity,
        )
    except ValueError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=str(e))

    return result
