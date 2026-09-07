import logging
import uuid

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.dependencies import get_current_user_id, get_db
from app.domain.models import (
    BacklogItem,
    Course,
    Goal,
    SubjectStreak,
    User,
)
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
from app.services.deterministic_planner import generate_deterministic_plan
from app.services.motivation_service import MotivationService
from app.services.planning_engine import PlanningEngine
from app.services.streak_service import StreakService
from app.services.adaptive_service import get_or_create_active_snapshot

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardResponse)
async def get_dashboard(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    base_user_result = await db.execute(
        select(User)
        .where(User.id == user_id)
        .options(
            joinedload(User.profile),
            joinedload(User.schedule),
            joinedload(User.study_streak),
        )
    )
    base_user = base_user_result.unique().scalar_one_or_none()

    profile = base_user.profile if base_user else None
    schedule = base_user.schedule if base_user else None
    momentum = base_user.study_streak if base_user else None

    courses_backlog_result = await db.execute(
        select(Course, BacklogItem)
        .outerjoin(BacklogItem, Course.id == BacklogItem.course_id)
        .where(Course.user_id == user_id)
    )
    rows = courses_backlog_result.all()
    courses_by_id: dict[uuid.UUID, Course] = {}
    backlog_items: list[BacklogItem] = []
    for course, backlog_item in rows:
        if course.id not in courses_by_id:
            courses_by_id[course.id] = course
        if backlog_item is not None:
            backlog_items.append(backlog_item)
    courses = list(courses_by_id.values())

    goals_result = await db.execute(
        select(Goal).where(Goal.user_id == user_id)
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

    daily_capacity = profile.daily_target_minutes if profile and profile.daily_target_minutes else None
    snapshot = await get_or_create_active_snapshot(
        db, user_id, target, planning_data, daily_capacity_minutes=daily_capacity
    )

    plan = PlanGenerateResponse(
        plan=GeneratedPlan(
            sessions=[PlanSession(**s) for s in snapshot.sessions],
            daily_message=snapshot.daily_message,
            overflow=[uuid.UUID(oid) for oid in snapshot.overflow],
        ),
        source=snapshot.source,
        snapshot_id=snapshot.id,
    )

    subject_streaks_result = await db.execute(
        select(SubjectStreak).where(SubjectStreak.user_id == user_id)
    )
    subject_streaks = list(subject_streaks_result.scalars().all())

    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)
    minutes_30d_by_course: dict[uuid.UUID, int] = {}
    for item in backlog_items:
        if (
            item.status == "completed"
            and item.course_id
            and item.updated_at
            and item.updated_at >= thirty_days_ago
        ):
            minutes_30d_by_course[item.course_id] = (
                minutes_30d_by_course.get(item.course_id, 0)
                + (item.estimated_minutes or 30)
            )

    streak_service = StreakService(db)
    streaks = await streak_service.get_streaks(
        user_id,
        momentum=momentum,
        subject_streaks=subject_streaks,
        courses_by_id=courses_by_id,
    )
    balance = await streak_service.compute_balance_score(
        user_id,
        subject_streaks=subject_streaks,
        courses_by_id=courses_by_id,
        minutes_30d_by_course=minutes_30d_by_course,
    )

    motivation_service = MotivationService(db)
    insight = await motivation_service.get_insight(
        user_id,
        streak=momentum,
        subject_streaks=subject_streaks,
        all_backlog=backlog_items,
        courses_by_id=courses_by_id,
    )

    return DashboardResponse(
        profile=StudentProfileResponse.model_validate(profile) if profile else None,
        streaks=StreakAllResponse.model_validate(streaks),
        balance=BalanceScoreResponse.model_validate(balance),
        insight=InsightResponse(**insight),
        planning=planning,
        plan=plan,
    )
