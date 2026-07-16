import uuid
from collections.abc import Sequence

from app.domain.models import Goal
from app.repositories.goal_repo import GoalRepository
from app.domain.schemas import GoalCreate, GoalUpdate


class GoalService:
    def __init__(self, repo: GoalRepository):
        self.repo = repo

    async def create(self, user_id: uuid.UUID, data: GoalCreate) -> Goal:
        return await self.repo.create(
            user_id=user_id,
            title=data.title,
            description=data.description,
            target_date=data.target_date,
            category=data.category,
        )

    async def get(self, goal_id: uuid.UUID, user_id: uuid.UUID) -> Goal | None:
        goal = await self.repo.get(goal_id)
        if goal is None or goal.user_id != user_id:
            return None
        return goal

    async def list(
        self,
        user_id: uuid.UUID,
        status: str | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[Sequence[Goal], int]:
        filters = {"user_id": user_id}
        if status is not None:
            filters["status"] = status
        return await self.repo.list(
            skip=skip,
            limit=limit,
            filters=filters,
            order_by=Goal.created_at.desc(),
        )

    async def update(
        self, goal_id: uuid.UUID, user_id: uuid.UUID, data: GoalUpdate
    ) -> Goal | None:
        goal = await self.repo.get(goal_id)
        if goal is None or goal.user_id != user_id:
            return None
        kwargs = data.model_dump(exclude_unset=True)
        return await self.repo.update(goal_id, **kwargs)

    async def delete(self, goal_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        goal = await self.repo.get(goal_id)
        if goal is None or goal.user_id != user_id:
            return False
        return await self.repo.delete(goal_id)
