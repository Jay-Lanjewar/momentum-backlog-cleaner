import logging
import uuid

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id, get_db
from app.domain.models import (
    BacklogItem,
    Course,
    PlanSnapshot,
    SessionCompletion,
    StudyStreak,
)
from app.domain.schemas import (
    AnalyticsProgressResponse,
    DayBreakdown,
    StreakMilestone,
    StreakProgress,
    SubjectMetrics,
    TodayMetrics,
    WeekMetrics,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["analytics"])

STREAK_MILESTONES = [3, 7, 14, 30, 100, 365]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_midnight(dt: datetime) -> datetime:
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


def _iso_week_start(dt: datetime) -> datetime:
    """Return Monday 00:00 UTC of the current ISO week."""
    local = dt.replace(hour=0, minute=0, second=0, microsecond=0)
    return local - timedelta(days=local.weekday())


def _day_key(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d")


@router.get("/progress", response_model=AnalyticsProgressResponse)
async def get_progress(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    now = _utc_now()
    today_start = _utc_midnight(now)
    week_start = _iso_week_start(now)
    thirty_days_ago = now - timedelta(days=30)

    # Single query: all completions in the 30-day window, grouped by day and course.
    # We fetch rows and split in Python to avoid multiple DB round-trips.
    completions_result = await db.execute(
        select(
            SessionCompletion,
            PlanSnapshot.plan_date,
            BacklogItem.course_id,
        )
        .join(PlanSnapshot, SessionCompletion.plan_snapshot_id == PlanSnapshot.id)
        .join(BacklogItem, SessionCompletion.backlog_item_id == BacklogItem.id)
        .where(
            PlanSnapshot.user_id == user_id,
            SessionCompletion.created_at >= thirty_days_ago,
        )
    )
    rows = completions_result.all()

    # Fetch courses for name/color mapping
    courses_result = await db.execute(
        select(Course).where(Course.user_id == user_id)
    )
    courses = {c.id: c for c in courses_result.scalars().all()}

    # Fetch streak
    streak_result = await db.execute(
        select(StudyStreak).where(StudyStreak.user_id == user_id)
    )
    streak = streak_result.scalar_one_or_none()

    # ─── Derive metrics from the single query result ───

    today = TodayMetrics()
    daily_totals: dict[str, int] = defaultdict(int)
    daily_counts: dict[str, int] = defaultdict(int)
    subject_totals: dict[uuid.UUID, dict] = defaultdict(
        lambda: {"study_minutes": 0, "sessions_completed": 0, "estimated_minutes": 0}
    )

    week_total_minutes = 0
    week_total_sessions = 0
    week_total_estimated = 0

    for completion, _plan_date, course_id in rows:
        created = completion.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)

        day_str = _day_key(created)

        # Today
        if created >= today_start:
            today.study_minutes += completion.actual_minutes
            today.sessions_completed += 1
            today.estimated_minutes += completion.estimated_minutes

        # This week
        if created >= week_start:
            week_total_minutes += completion.actual_minutes
            week_total_sessions += 1
            week_total_estimated += completion.estimated_minutes

        # Daily breakdown (30-day window, only include days in current week)
        if created >= week_start:
            daily_totals[day_str] += completion.actual_minutes
            daily_counts[day_str] += 1

        # Subject totals (30-day window)
        subject_totals[course_id]["study_minutes"] += completion.actual_minutes
        subject_totals[course_id]["sessions_completed"] += 1
        subject_totals[course_id]["estimated_minutes"] += completion.estimated_minutes

    # Build weekly daily breakdown (Mon-Sun of current week)
    daily: list[DayBreakdown] = []
    for i in range(7):
        day = week_start + timedelta(days=i)
        day_str = _day_key(day)
        daily.append(
            DayBreakdown(
                date=day_str,
                study_minutes=daily_totals.get(day_str, 0),
                sessions_completed=daily_counts.get(day_str, 0),
            )
        )

    # Build subject breakdown
    subjects: list[SubjectMetrics] = []
    for course_id, totals in subject_totals.items():
        course = courses.get(course_id)
        subjects.append(
            SubjectMetrics(
                course_id=str(course_id),
                course_name=course.name if course else "Unknown",
                course_color=course.color if course else "#6B7280",
                study_minutes=totals["study_minutes"],
                sessions_completed=totals["sessions_completed"],
                estimated_minutes=totals["estimated_minutes"],
            )
        )
    subjects.sort(key=lambda s: s.study_minutes, reverse=True)

    # Build streaks
    current_streak = streak.current_streak if streak else 0
    best_streak = streak.longest_streak if streak else 0
    total_days = streak.total_study_days if streak else 0
    milestones = [
        StreakMilestone(days=d, achieved=current_streak >= d)
        for d in STREAK_MILESTONES
    ]

    return AnalyticsProgressResponse(
        today=today,
        week=WeekMetrics(
            daily=daily,
            total_study_minutes=week_total_minutes,
            total_sessions=week_total_sessions,
            total_estimated_minutes=week_total_estimated,
        ),
        subjects=subjects,
        streaks=StreakProgress(
            current=current_streak,
            best=best_streak,
            total_study_days=total_days,
            milestones=milestones,
        ),
    )
