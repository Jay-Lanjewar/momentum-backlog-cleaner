from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.domain.models import User
from app.services.activity_service import ActivityService

router = APIRouter(prefix="/activities", tags=["activities"])


async def get_activity_service(db: AsyncSession = Depends(get_db)) -> ActivityService:
    return ActivityService(db)


@router.get("/feed")
async def get_feed(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    service: ActivityService = Depends(get_activity_service),
):
    return await service.get_feed(user.id, limit, offset)
