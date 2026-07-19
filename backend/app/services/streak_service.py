import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import BacklogItem, Course
from app.repositories.streak_repo import StudyStreakRepository, SubjectStreakRepository


class StreakService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.study_streak_repo = StudyStreakRepository(db)
        self.subject_streak_repo = SubjectStreakRepository(db)

    async def get_streaks(self, user_id: uuid.UUID) -> dict:
        momentum = await self.study_streak_repo.get_by_user(user_id)
        subject_streaks = await self.subject_streak_repo.get_by_user(user_id)

        subjects_data = []
        for ss in subject_streaks:
            course = await self.db.get(Course, ss.course_id)
            subjects_data.append({
                "id": ss.id,
                "course_id": ss.course_id,
                "course_name": course.name if course else "Unknown",
                "course_color": course.color if course else "#888",
                "current_streak": ss.current_streak,
                "longest_streak": ss.longest_streak,
                "last_completion_date": ss.last_completion_date,
            })

        return {
            "momentum": {
                "current_streak": momentum.current_streak if momentum else 0,
                "longest_streak": momentum.longest_streak if momentum else 0,
                "total_study_days": momentum.total_study_days if momentum else 0,
                "last_completed_date": momentum.last_completed_date if momentum else None,
            },
            "subjects": subjects_data,
        }

    async def update_streaks(
        self, user_id: uuid.UUID, completed_subject_ids: list[uuid.UUID]
    ) -> dict:
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        yesterday = today - timedelta(days=1)

        momentum = await self.study_streak_repo.get_by_user(user_id)

        current_streak = momentum.current_streak if momentum else 0
        longest_streak = momentum.longest_streak if momentum else 0
        total_study_days = momentum.total_study_days if momentum else 0
        last_completed = momentum.last_completed_date if momentum else None

        if last_completed:
            last_date = last_completed.replace(tzinfo=timezone.utc) if last_completed.tzinfo is None else last_completed
            if last_date < yesterday:
                current_streak = 1
            elif last_date >= today:
                current_streak = current_streak
            else:
                current_streak += 1
        else:
            current_streak = 1

        total_study_days += 1
        if current_streak > longest_streak:
            longest_streak = current_streak

        await self.study_streak_repo.upsert(
            user_id=user_id,
            current_streak=current_streak,
            longest_streak=longest_streak,
            total_study_days=total_study_days,
            last_completed_date=today,
        )

        existing_subject_streaks = {
            ss.course_id: ss
            for ss in await self.subject_streak_repo.get_by_user(user_id)
        }

        for course_id in completed_subject_ids:
            ss = existing_subject_streaks.get(course_id)
            ss_current = ss.current_streak if ss else 0
            ss_longest = ss.longest_streak if ss else 0
            ss_last = ss.last_completion_date if ss else None

            if ss_last:
                ss_last_date = ss_last.replace(tzinfo=timezone.utc) if ss_last.tzinfo is None else ss_last
                if ss_last_date < yesterday:
                    ss_current = 1
                elif ss_last_date >= today:
                    ss_current = ss_current
                else:
                    ss_current += 1
            else:
                ss_current = 1

            if ss_current > ss_longest:
                ss_longest = ss_current

            await self.subject_streak_repo.upsert(
                user_id=user_id,
                course_id=course_id,
                current_streak=ss_current,
                longest_streak=ss_longest,
                last_completion_date=today,
            )

        return await self.get_streaks(user_id)

    async def compute_balance_score(self, user_id: uuid.UUID) -> dict:
        subject_streaks = await self.subject_streak_repo.get_by_user(user_id)

        if not subject_streaks:
            return {
                "score": 100,
                "message": "Start studying to see your balance score.",
                "neglected_subjects": [],
            }

        today = date.today()
        active_subjects = []

        for ss in subject_streaks:
            course = await self.db.get(Course, ss.course_id)
            course_name = course.name if course else "Unknown"
            last_date = ss.last_completion_date

            if last_date:
                if isinstance(last_date, datetime):
                    last = last_date.date()
                else:
                    last = last_date
                days_since = (today - last).days
            else:
                days_since = 999

            subject_minutes_30d = await self._get_subject_minutes_30d(user_id, ss.course_id)

            active_subjects.append({
                "course_id": ss.course_id,
                "course_name": course_name,
                "course_color": course.color if course else "#888",
                "days_since_study": days_since,
                "total_minutes_30d": subject_minutes_30d,
                "streak": ss.current_streak,
            })

        if not active_subjects:
            return {
                "score": 100,
                "message": "Start studying to see your balance score.",
                "neglected_subjects": [],
            }

        total_minutes = max(sum(s["total_minutes_30d"] for s in active_subjects), 1)
        subject_count = len(active_subjects)
        even_share = total_minutes / subject_count

        variance_sum = sum(
            (s["total_minutes_30d"] - even_share) ** 2 for s in active_subjects
        )
        max_variance = (total_minutes * (subject_count - 1)) ** 2
        balance_score = max(
            0,
            min(
                100,
                round(
                    (1 - (variance_sum / max_variance if max_variance > 0 else 0)) * 100
                ),
            ),
        )

        neglected = [s for s in active_subjects if s["days_since_study"] > 3]
        neglected.sort(key=lambda x: x["days_since_study"], reverse=True)

        message = None
        if balance_score >= 80:
            message = "Excellent balance."
        elif balance_score >= 50:
            if neglected:
                names = [s["course_name"] for s in neglected[:2]]
                message = f"You haven't studied {names[0]} recently."
                if len(names) > 1:
                    message += f" Or {names[1]}."
            else:
                message = "Moderate balance. Try to spread study time evenly."
        else:
            if neglected:
                message = "Your study time is uneven. Focus on neglected subjects."
            else:
                message = "Try to study all your subjects more evenly."

        return {
            "score": balance_score,
            "message": message,
            "neglected_subjects": [s["course_name"] for s in neglected],
        }

    async def _get_subject_minutes_30d(
        self, user_id: uuid.UUID, course_id: uuid.UUID
    ) -> int:
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        result = await self.db.execute(
            select(BacklogItem).where(
                BacklogItem.user_id == user_id,
                BacklogItem.course_id == course_id,
                BacklogItem.status == "completed",
                BacklogItem.updated_at >= thirty_days_ago,
            )
        )
        items = result.scalars().all()
        return sum((i.estimated_minutes or 30) for i in items)
