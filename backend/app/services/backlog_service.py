import uuid
from collections.abc import Sequence

from app.domain.models import BacklogItem
from app.repositories.backlog_repo import BacklogItemRepository
from app.repositories.course_repo import CourseRepository
from app.domain.schemas import BacklogItemCreate, BacklogItemUpdate


class BacklogService:
    def __init__(self, repo: BacklogItemRepository, course_repo: CourseRepository):
        self.repo = repo
        self.course_repo = course_repo

    async def create(self, user_id: uuid.UUID, data: BacklogItemCreate) -> BacklogItem:
        course = await self.course_repo.get(data.course_id)
        if course is None or course.user_id != user_id:
            raise ValueError("Course not found")
        return await self.repo.create(
            user_id=user_id,
            course_id=data.course_id,
            title=data.title,
            description=data.description,
            priority=data.priority,
            estimated_minutes=data.estimated_minutes,
            due_date=data.due_date,
        )

    async def get(
        self, item_id: uuid.UUID, user_id: uuid.UUID
    ) -> BacklogItem | None:
        item = await self.repo.get(item_id)
        if item is None or item.user_id != user_id:
            return None
        return item

    async def list(
        self,
        user_id: uuid.UUID,
        status: str | None = None,
        course_id: uuid.UUID | None = None,
        priority: int | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[Sequence[BacklogItem], int]:
        filters = {"user_id": user_id}
        if status is not None:
            filters["status"] = status
        if course_id is not None:
            filters["course_id"] = course_id
        if priority is not None:
            filters["priority"] = priority
        return await self.repo.list(
            skip=skip,
            limit=limit,
            filters=filters,
            order_by=BacklogItem.priority.asc(),
        )

    async def update(
        self, item_id: uuid.UUID, user_id: uuid.UUID, data: BacklogItemUpdate
    ) -> BacklogItem | None:
        item = await self.repo.get(item_id)
        if item is None or item.user_id != user_id:
            return None

        kwargs = data.model_dump(exclude_unset=True)

        if "course_id" in kwargs and kwargs["course_id"] is not None:
            course = await self.course_repo.get(kwargs["course_id"])
            if course is None or course.user_id != user_id:
                raise ValueError("Course not found")

        return await self.repo.update(item_id, **kwargs)

    async def delete(self, item_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        item = await self.repo.get(item_id)
        if item is None or item.user_id != user_id:
            return False
        return await self.repo.delete(item_id)
