import uuid

from sqlalchemy import select

from app.domain.models import StudentProfile, WeeklySchedule
from app.repositories.base import BaseRepository


class StudentProfileRepository(BaseRepository[StudentProfile]):
    def __init__(self, db):
        super().__init__(StudentProfile, db)

    async def get_by_user_id(self, user_id: uuid.UUID) -> StudentProfile | None:
        result = await self.db.execute(
            select(StudentProfile).where(StudentProfile.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def upsert(self, user_id: uuid.UUID, **kwargs) -> StudentProfile:
        existing = await self.get_by_user_id(user_id)
        if existing:
            for key, value in kwargs.items():
                if value is not None:
                    setattr(existing, key, value)
            await self.db.flush()
            await self.db.refresh(existing)
            return existing
        return await self.create(user_id=user_id, **kwargs)


class WeeklyScheduleRepository(BaseRepository[WeeklySchedule]):
    def __init__(self, db):
        super().__init__(WeeklySchedule, db)

    async def get_by_user_id(self, user_id: uuid.UUID) -> WeeklySchedule | None:
        result = await self.db.execute(
            select(WeeklySchedule).where(WeeklySchedule.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def upsert(self, user_id: uuid.UUID, **kwargs) -> WeeklySchedule:
        existing = await self.get_by_user_id(user_id)
        if existing:
            for key, value in kwargs.items():
                if value is not None:
                    setattr(existing, key, value)
            await self.db.flush()
            await self.db.refresh(existing)
            return existing
        return await self.create(user_id=user_id, **kwargs)
