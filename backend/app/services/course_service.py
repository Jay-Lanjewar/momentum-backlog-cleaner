import uuid
from collections.abc import Sequence

from app.domain.models import Course
from app.repositories.course_repo import CourseRepository
from app.domain.schemas import CourseCreate, CourseUpdate


class CourseService:
    def __init__(self, repo: CourseRepository):
        self.repo = repo

    async def create(self, user_id: uuid.UUID, data: CourseCreate) -> Course:
        return await self.repo.create(
            user_id=user_id,
            name=data.name,
            color=data.color,
        )

    async def get(self, course_id: uuid.UUID, user_id: uuid.UUID) -> Course | None:
        course = await self.repo.get(course_id)
        if course is None or course.user_id != user_id:
            return None
        return course

    async def list(
        self, user_id: uuid.UUID, skip: int = 0, limit: int = 100
    ) -> tuple[Sequence[Course], int]:
        return await self.repo.list(
            skip=skip,
            limit=limit,
            filters={"user_id": user_id},
            order_by=Course.created_at.desc(),
        )

    async def update(
        self, course_id: uuid.UUID, user_id: uuid.UUID, data: CourseUpdate
    ) -> Course | None:
        course = await self.repo.get(course_id)
        if course is None or course.user_id != user_id:
            return None
        kwargs = data.model_dump(exclude_unset=True)
        return await self.repo.update(course_id, **kwargs)

    async def delete(self, course_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        course = await self.repo.get(course_id)
        if course is None or course.user_id != user_id:
            return False
        return await self.repo.delete(course_id)
