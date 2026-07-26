import uuid
from collections.abc import Sequence
from datetime import datetime, timezone

from sqlalchemy import and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.domain.models import Activity, ActivityType, ActivityVisibility
from app.repositories.base import BaseRepository


class ActivityRepository(BaseRepository[Activity]):
    def __init__(self, db: AsyncSession):
        super().__init__(Activity, db)

    async def get_feed_for_user(
        self, user_id: uuid.UUID, friend_ids: list[uuid.UUID], limit: int = 50, offset: int = 0
    ) -> Sequence[Activity]:
        from sqlalchemy import select

        if not friend_ids:
            return []

        result = await self.db.execute(
            select(Activity)
            .options(selectinload(Activity.user))
            .where(
                Activity.user_id.in_(friend_ids),
                Activity.deleted_at.is_(None),
            )
            .order_by(Activity.occurred_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return result.scalars().all()

    async def record(
        self,
        user_id: uuid.UUID,
        activity_type: ActivityType,
        metadata: dict | None = None,
        visibility: ActivityVisibility = ActivityVisibility.FRIENDS,
        occurred_at: datetime | None = None,
    ) -> Activity:
        return await self.create(
            user_id=user_id,
            type=activity_type.value,
            extra=metadata or {},
            visibility=visibility.value,
            occurred_at=occurred_at or datetime.now(timezone.utc),
        )

    async def soft_delete(self, activity_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        from sqlalchemy import select

        result = await self.db.execute(
            select(Activity).where(
                Activity.id == activity_id,
                Activity.user_id == user_id,
                Activity.deleted_at.is_(None),
            )
        )
        activity = result.scalar_one_or_none()
        if activity is None:
            return False
        activity.deleted_at = datetime.now(timezone.utc)
        await self.db.flush()
        return True
