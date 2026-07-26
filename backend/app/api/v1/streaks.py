import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.domain.models import ActivityType, User
from app.domain.schemas import (
    BalanceScoreResponse,
    StreakAllResponse,
    StreakUpdatePayload,
)
from app.services.streak_service import StreakService
from app.services.activity_service import ActivityService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/streaks", tags=["streaks"])


async def get_streak_service(db: AsyncSession = Depends(get_db)) -> StreakService:
    return StreakService(db)


@router.get("", response_model=StreakAllResponse)
async def get_streaks(
    user: User = Depends(get_current_user),
    service: StreakService = Depends(get_streak_service),
):
    return await service.get_streaks(user.id)


@router.post("/update", response_model=StreakAllResponse)
async def update_streaks(
    payload: StreakUpdatePayload,
    user: User = Depends(get_current_user),
    service: StreakService = Depends(get_streak_service),
    db: AsyncSession = Depends(get_db),
):
    try:
        before = await service.get_streaks(user.id)
        result = await service.update_streaks(user.id, payload.completed_subject_ids)
        old_streak = before["momentum"]["current_streak"]
        new_streak = result["momentum"]["current_streak"]
        if new_streak > old_streak:
            act = ActivityService(db)
            await act.record(user.id, ActivityType.STREAK_INCREASED, {"streak": new_streak})
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/balance", response_model=BalanceScoreResponse)
async def get_balance_score(
    user: User = Depends(get_current_user),
    service: StreakService = Depends(get_streak_service),
):
    return await service.compute_balance_score(user.id)
