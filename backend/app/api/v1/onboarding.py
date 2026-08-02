import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.domain.models import User
from app.domain.schemas import (
    BacklogItemCreate,
    CourseCreate,
    GoalCreate,
    OnboardingRequest,
    OnboardingResponse,
)
from app.repositories.backlog_repo import BacklogItemRepository
from app.repositories.course_repo import CourseRepository
from app.repositories.goal_repo import GoalRepository
from app.repositories.profile_repo import StudentProfileRepository, WeeklyScheduleRepository
from app.services.backlog_service import BacklogService
from app.services.course_service import CourseService
from app.services.goal_service import GoalService
from app.services.profile_service import StudentProfileService, WeeklyScheduleService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.post("", response_model=OnboardingResponse, status_code=status.HTTP_201_CREATED)
async def run_onboarding(
    data: OnboardingRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    course_repo = CourseRepository(db)
    course_service = CourseService(course_repo)
    backlog_service = BacklogService(BacklogItemRepository(db), course_repo)
    goal_service = GoalService(GoalRepository(db))

    created_course_ids: list[uuid.UUID] = []
    for item in data.courses:
        course = await course_service.create(
            user.id,
            CourseCreate(name=item.name, color=item.color),
        )
        created_course_ids.append(course.id)

    course_count = len(created_course_ids)

    backlog_created = 0
    try:
        for item in data.backlog:
            if item.course_index >= course_count:
                raise ValueError(f"Invalid course_index: {item.course_index}")
            await backlog_service.create(
                user.id,
                BacklogItemCreate(
                    title=item.title,
                    course_id=created_course_ids[item.course_index],
                    priority=item.priority,
                    estimated_minutes=item.estimated_minutes,
                    due_date=item.due_date,
                ),
            )
            backlog_created += 1
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    goals_created = 0
    for item in data.goals:
        await goal_service.create(
            user.id,
            GoalCreate(
                title=item.title,
                target_date=item.target_date,
                category=item.category,
            ),
        )
        goals_created += 1

    profile_saved = False
    if data.profile is not None:
        profile_service = StudentProfileService(StudentProfileRepository(db))
        await profile_service.upsert(user.id, data.profile)
        profile_saved = True

    schedule_saved = False
    if data.schedule is not None:
        schedule_service = WeeklyScheduleService(WeeklyScheduleRepository(db))
        await schedule_service.upsert(user.id, data.schedule)
        schedule_saved = True

    return OnboardingResponse(
        courses_created=course_count,
        backlog_items_created=backlog_created,
        goals_created=goals_created,
        profile_saved=profile_saved,
        schedule_saved=schedule_saved,
    )
