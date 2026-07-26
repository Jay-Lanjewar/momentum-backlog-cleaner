from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.domain.models import User
from app.domain.schemas import UserSearchResult
from app.services.activity_service import ActivityService

router = APIRouter(prefix="/users", tags=["users"])


async def get_activity_service(db: AsyncSession = Depends(get_db)) -> ActivityService:
    return ActivityService(db)


@router.get("/search", response_model=list[UserSearchResult])
async def search_users(
    q: str = Query("", min_length=0, max_length=100),
    user: User = Depends(get_current_user),
    service: ActivityService = Depends(get_activity_service),
):
    return await service.search_users(q, user.id)
