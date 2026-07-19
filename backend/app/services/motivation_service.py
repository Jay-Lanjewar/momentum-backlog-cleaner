import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import BacklogItem, Course
from app.repositories.backlog_repo import BacklogItemRepository
from app.repositories.streak_repo import StudyStreakRepository, SubjectStreakRepository

MILESTONES = [3, 7, 14, 30, 100, 365]
SUBJECT_MILESTONES = [7, 30, 90, 180]

ENCOURAGEMENTS = [
    "Every minute you study is an investment in your future.",
    "Small steps lead to big results. Keep going.",
    "You're building a habit that will serve you for life.",
    "Consistency beats intensity. You're doing it right.",
    "Today's effort is tomorrow's confidence.",
    "You've got this. One topic at a time.",
    "Progress is progress, no matter how small.",
    "Your future self will thank you for today.",
]


def _get_momentum_milestones() -> list[int]:
    return MILESTONES


def _get_subject_milestones() -> list[int]:
    return SUBJECT_MILESTONES


class MotivationService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.study_streak_repo = StudyStreakRepository(db)
        self.subject_streak_repo = SubjectStreakRepository(db)
        self.backlog_repo = BacklogItemRepository(db)

    async def get_insight(self, user_id: uuid.UUID) -> dict:
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        today_date = date.today()

        streak = await self.study_streak_repo.get_by_user(user_id)
        subject_streaks = await self.subject_streak_repo.get_by_user(user_id)
        all_backlog = await self._get_all_backlog(user_id)

        streak_protected = False
        current_streak = 0
        recovery_tokens = 0
        if streak:
            current_streak = streak.current_streak
            recovery_tokens = streak.recovery_tokens_current
            if streak.last_completed_date:
                last_date = streak.last_completed_date
                if isinstance(last_date, datetime):
                    last_date = last_date.replace(tzinfo=timezone.utc) if last_date.tzinfo is None else last_date
                    if last_date == today:
                        streak_protected = False
                    elif last_date == today - timedelta(days=1):
                        streak_protected = recovery_tokens > 0
                    else:
                        streak_protected = False

        if streak_protected:
            return {
                "title": "Streak Protected",
                "message": "Your Recovery Token protected today's streak.",
                "priority": 1,
            }

        upcoming_exams = self._get_upcoming_exams(all_backlog, today_date, days_ahead=3)
        if upcoming_exams:
            exams_by_course = {}
            for item in upcoming_exams:
                course = await self.db.get(Course, item.course_id)
                course_name = course.name if course else "Unknown"
                if course_name not in exams_by_course:
                    exams_by_course[course_name] = 0
                exams_by_course[course_name] += 1

            if len(exams_by_course) == 1:
                course_name = list(exams_by_course.keys())[0]
                count = exams_by_course[course_name]
                days_left = (upcoming_exams[0].due_date.date() - today_date).days if upcoming_exams[0].due_date else 0
                return {
                    "title": "Exam Approaching",
                    "message": f"{course_name} exam in {days_left} day{'s' if days_left != 1 else ''}. {count} topic{'s' if count != 1 else ''} to review.",
                    "priority": 2,
                }
            else:
                course_names = list(exams_by_course.keys())
                days_left = (upcoming_exams[0].due_date.date() - today_date).days if upcoming_exams[0].due_date else 0
                return {
                    "title": "Exams Approaching",
                    "message": f"{len(exams_by_course)} exam{'s' if len(exams_by_course) != 1 else ''} in {days_left} day{'s' if days_left != 1 else ''}. Prioritize review.",
                    "priority": 2,
                }

        for ss in subject_streaks:
            course = await self.db.get(Course, ss.course_id)
            course_name = course.name if course else "Unknown"
            last_date = ss.last_completion_date
            days_since = 999
            if last_date:
                if isinstance(last_date, datetime):
                    last = last_date.date()
                else:
                    last = last_date
                days_since = (today_date - last).days

            if days_since >= 5:
                return {
                    "title": "Subject Neglected",
                    "message": f"{course_name} hasn't been studied for {days_since} days.",
                    "priority": 3,
                }

        total_backlog_minutes = sum(
            (i.estimated_minutes or 30)
            for i in all_backlog
            if i.status in ("pending", "in_progress")
        )

        pending_count = len([i for i in all_backlog if i.status in ("pending", "in_progress")])
        completed_7d = len([
            i for i in all_backlog
            if i.status == "completed" and i.updated_at and i.updated_at >= today - timedelta(days=7)
        ])

        if streak and current_streak > 0:
            next_milestone = None
            for m in _get_momentum_milestones():
                if current_streak < m <= current_streak + 1:
                    next_milestone = m
                    break
            if next_milestone:
                return {
                    "title": "Milestone Ahead",
                    "message": f"One more session earns your {next_milestone}-day streak.",
                    "priority": 5,
                }

        for ss in subject_streaks:
            next_milestone = None
            for m in _get_subject_milestones():
                if ss.current_streak < m <= ss.current_streak + 1:
                    next_milestone = m
                    break
            if next_milestone:
                course = await self.db.get(Course, ss.course_id)
                course_name = course.name if course else "Unknown"
                return {
                    "title": "Subject Milestone Ahead",
                    "message": f"One more {course_name} session earns your {next_milestone}-day streak.",
                    "priority": 6,
                }

        if completed_7d >= 5 and pending_count > 0:
            reduction = min(100, round((completed_7d / max(1, completed_7d + pending_count)) * 100))
            if reduction >= 15:
                return {
                    "title": "Progress Made",
                    "message": f"You've reduced your backlog by {reduction}% this week.",
                    "priority": 7,
                }

        if streak and current_streak == 0 and pending_count == 0:
            return {
                "title": "All Caught Up",
                "message": "You're ahead of schedule. Enjoy your free time!",
                "priority": 9,
            }

        if streak and current_streak == 0:
            return {
                "title": "Let's Start Fresh",
                "message": "Your streak paused. Let's build it again.",
                "priority": 9,
            }

        if pending_count == 0:
            return {
                "title": "All Caught Up",
                "message": "You're ahead of schedule. Enjoy your free time!",
                "priority": 9,
            }

        import random
        encouragement = random.choice(ENCOURAGEMENTS)
        return {
            "title": "Keep Going",
            "message": encouragement,
            "priority": 10,
        }

    def _get_upcoming_exams(
        self,
        items: list,
        today: date,
        days_ahead: int = 3,
    ) -> list:
        pending = [i for i in items if i.status in ("pending", "in_progress")]
        result = []
        for item in pending:
            if item.due_date:
                due = item.due_date
                if isinstance(due, datetime):
                    due = due.date()
                days_until = (due - today).days
                if 0 <= days_until <= days_ahead:
                    result.append(item)
        result.sort(key=lambda x: x.due_date or datetime.max)
        return result

    async def _get_all_backlog(self, user_id: uuid.UUID) -> list:
        result = await self.db.execute(
            select(BacklogItem).where(BacklogItem.user_id == user_id)
        )
        return list(result.scalars().all())
