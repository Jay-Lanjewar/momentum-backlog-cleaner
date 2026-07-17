import logging
import uuid
from collections.abc import Sequence
from typing import Any, Generic, TypeVar

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import Base

logger = logging.getLogger(__name__)

ModelType = TypeVar("ModelType", bound=Base)


class BaseRepository(Generic[ModelType]):
    def __init__(self, model: type[ModelType], db: AsyncSession):
        self.model = model
        self.db = db

    async def create(self, **kwargs: Any) -> ModelType:
        try:
            instance = self.model(**kwargs)
            self.db.add(instance)
            await self.db.flush()
            await self.db.refresh(instance)
            return instance
        except Exception:
            await self.db.rollback()
            logger.exception("Failed creating %s", self.model.__name__)
            raise

    async def get(self, id: uuid.UUID) -> ModelType | None:
        result = await self.db.execute(select(self.model).where(self.model.id == id))
        return result.scalar_one_or_none()

    async def list(
        self,
        *,
        skip: int = 0,
        limit: int = 100,
        filters: dict[str, Any] | None = None,
        order_by: Any | None = None,
    ) -> tuple[Sequence[ModelType], int]:
        query = select(self.model)

        if filters:
            for field, value in filters.items():
                if hasattr(self.model, field) and value is not None:
                    query = query.where(getattr(self.model, field) == value)

        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        if order_by is not None:
            query = query.order_by(order_by)
        query = query.offset(skip).limit(limit)

        result = await self.db.execute(query)
        items = result.scalars().all()
        return items, total

    async def update(self, id: uuid.UUID, **kwargs: Any) -> ModelType | None:
        instance = await self.get(id)
        if instance is None:
            return None
        for key, value in kwargs.items():
            if value is not None:
                setattr(instance, key, value)
        await self.db.flush()
        await self.db.refresh(instance)
        return instance

    async def delete(self, id: uuid.UUID) -> bool:
        instance = await self.get(id)
        if instance is None:
            return False
        await self.db.delete(instance)
        await self.db.flush()
        return True
