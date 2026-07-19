import uuid
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import Course, StudyStreak, SubjectStreak
from app.repositories.base import BaseRepository


class StudyStreakRepository(BaseRepository[StudyStreak]):
    def __init__(self, db: AsyncSession):
        super().__init__(StudyStreak, db)

    async def get_by_user(self, user_id: uuid.UUID) -> StudyStreak | None:
        result = await self.db.execute(
            select(StudyStreak).where(StudyStreak.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def upsert(
        self,
        user_id: uuid.UUID,
        current_streak: int,
        longest_streak: int,
        total_study_days: int,
        last_completed_date: datetime,
        recovery_tokens_current: int | None = None,
        recovery_tokens_earned: int | None = None,
        recovery_tokens_used: int | None = None,
        token_milestones: dict | None = None,
    ) -> StudyStreak:
        existing = await self.get_by_user(user_id)
        if existing:
            existing.current_streak = current_streak
            existing.longest_streak = longest_streak
            existing.total_study_days = total_study_days
            existing.last_completed_date = last_completed_date
            if recovery_tokens_current is not None:
                existing.recovery_tokens_current = recovery_tokens_current
            if recovery_tokens_earned is not None:
                existing.recovery_tokens_earned = recovery_tokens_earned
            if recovery_tokens_used is not None:
                existing.recovery_tokens_used = recovery_tokens_used
            if token_milestones is not None:
                existing.token_milestones = token_milestones
            await self.db.flush()
            await self.db.refresh(existing)
            return existing
        return await self.create(
            user_id=user_id,
            current_streak=current_streak,
            longest_streak=longest_streak,
            total_study_days=total_study_days,
            last_completed_date=last_completed_date,
            recovery_tokens_current=recovery_tokens_current or 0,
            recovery_tokens_earned=recovery_tokens_earned or 0,
            recovery_tokens_used=recovery_tokens_used or 0,
            token_milestones=token_milestones or {},
        )


class SubjectStreakRepository(BaseRepository[SubjectStreak]):
    def __init__(self, db: AsyncSession):
        super().__init__(SubjectStreak, db)

    async def get_by_user(self, user_id: uuid.UUID) -> list[SubjectStreak]:
        result = await self.db.execute(
            select(SubjectStreak).where(SubjectStreak.user_id == user_id)
        )
        return list(result.scalars().all())

    async def get_by_user_and_course(
        self, user_id: uuid.UUID, course_id: uuid.UUID
    ) -> SubjectStreak | None:
        result = await self.db.execute(
            select(SubjectStreak).where(
                SubjectStreak.user_id == user_id,
                SubjectStreak.course_id == course_id,
            )
        )
        return result.scalar_one_or_none()

    async def upsert(
        self,
        user_id: uuid.UUID,
        course_id: uuid.UUID,
        current_streak: int,
        longest_streak: int,
        last_completion_date: datetime,
    ) -> SubjectStreak:
        existing = await self.get_by_user_and_course(user_id, course_id)
        if existing:
            existing.current_streak = current_streak
            existing.longest_streak = longest_streak
            existing.last_completion_date = last_completion_date
            await self.db.flush()
            await self.db.refresh(existing)
            return existing
        return await self.create(
            user_id=user_id,
            course_id=course_id,
            current_streak=current_streak,
            longest_streak=longest_streak,
            last_completion_date=last_completion_date,
        )
