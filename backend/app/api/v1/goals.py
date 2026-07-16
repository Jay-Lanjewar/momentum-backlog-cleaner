import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.domain.models import User
from app.domain.schemas import GoalCreate, GoalResponse, GoalUpdate
from app.repositories.goal_repo import GoalRepository
from app.services.goal_service import GoalService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/goals", tags=["goals"])


async def get_goal_service(db: AsyncSession = Depends(get_db)) -> GoalService:
    repo = GoalRepository(db)
    return GoalService(repo)


@router.post("", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
async def create_goal(
    data: GoalCreate,
    user: User = Depends(get_current_user),
    service: GoalService = Depends(get_goal_service),
):
    goal = await service.create(user.id, data)
    return goal


@router.get("", response_model=list[GoalResponse])
async def list_goals(
    status_filter: str | None = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    user: User = Depends(get_current_user),
    service: GoalService = Depends(get_goal_service),
):
    items, _ = await service.list(user.id, status_filter, skip, limit)
    return items


@router.get("/{goal_id}", response_model=GoalResponse)
async def get_goal(
    goal_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: GoalService = Depends(get_goal_service),
):
    goal = await service.get(goal_id, user.id)
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    return goal


@router.put("/{goal_id}", response_model=GoalResponse)
async def update_goal(
    goal_id: uuid.UUID,
    data: GoalUpdate,
    user: User = Depends(get_current_user),
    service: GoalService = Depends(get_goal_service),
):
    goal = await service.update(goal_id, user.id, data)
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    return goal


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(
    goal_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: GoalService = Depends(get_goal_service),
):
    deleted = await service.delete(goal_id, user.id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
