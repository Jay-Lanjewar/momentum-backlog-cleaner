import logging

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.domain.models import BacklogItem, Course, Goal, StudentProfile, User, WeeklySchedule
from app.domain.schemas import PlanningPreviewResponse, TimeBlock, PrioritizedBacklogItem, BacklogHealth
from app.services.planning_engine import PlanningEngine

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
