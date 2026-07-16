import uuid

from app.domain.models import StudentProfile, WeeklySchedule
from app.repositories.profile_repo import StudentProfileRepository, WeeklyScheduleRepository
from app.domain.schemas import StudentProfileCreate, StudentProfileUpdate, WeeklyScheduleUpdate


class StudentProfileService:
    def __init__(self, repo: StudentProfileRepository):
        self.repo = repo

    async def get(self, user_id: uuid.UUID) -> StudentProfile | None:
        return await self.repo.get_by_user_id(user_id)

    async def upsert(self, user_id: uuid.UUID, data: StudentProfileCreate | StudentProfileUpdate) -> StudentProfile:
        kwargs = data.model_dump(exclude_unset=True)
        return await self.repo.upsert(user_id=user_id, **kwargs)

    async def delete(self, user_id: uuid.UUID) -> bool:
        profile = await self.repo.get_by_user_id(user_id)
        if profile is None:
            return False
        return await self.repo.delete(profile.id)


class WeeklyScheduleService:
    def __init__(self, repo: WeeklyScheduleRepository):
        self.repo = repo

    async def get(self, user_id: uuid.UUID) -> WeeklySchedule | None:
        return await self.repo.get_by_user_id(user_id)

    async def upsert(self, user_id: uuid.UUID, data: WeeklyScheduleUpdate) -> WeeklySchedule:
        return await self.repo.upsert(user_id=user_id, schedule=data.schedule)

    async def delete(self, user_id: uuid.UUID) -> bool:
        schedule = await self.repo.get_by_user_id(user_id)
        if schedule is None:
            return False
        return await self.repo.delete(schedule.id)
