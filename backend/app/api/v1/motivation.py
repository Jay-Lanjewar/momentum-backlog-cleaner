import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.domain.models import User
from app.services.motivation_service import MotivationService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/motivation", tags=["motivation"])


async def get_motivation_service(db: AsyncSession = Depends(get_db)) -> MotivationService:
    return MotivationService(db)


@router.get("/insight")
async def get_insight(
    user: User = Depends(get_current_user),
    service: MotivationService = Depends(get_motivation_service),
):
    return await service.get_insight(user.id)
