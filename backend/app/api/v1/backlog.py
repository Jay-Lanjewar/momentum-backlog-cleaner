import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.domain.models import User
from app.domain.schemas import BacklogItemCreate, BacklogItemResponse, BacklogItemUpdate
from app.repositories.backlog_repo import BacklogItemRepository
from app.repositories.course_repo import CourseRepository
from app.services.backlog_service import BacklogService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/backlog", tags=["backlog"])


async def get_backlog_service(db: AsyncSession = Depends(get_db)) -> BacklogService:
    item_repo = BacklogItemRepository(db)
    course_repo = CourseRepository(db)
    return BacklogService(item_repo, course_repo)


@router.post("", response_model=BacklogItemResponse, status_code=status.HTTP_201_CREATED)
async def create_backlog_item(
    data: BacklogItemCreate,
    user: User = Depends(get_current_user),
    service: BacklogService = Depends(get_backlog_service),
):
    try:
        item = await service.create(user.id, data)
        return item
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("", response_model=list[BacklogItemResponse])
async def list_backlog_items(
    status_filter: str | None = Query(None, alias="status"),
    course_id: uuid.UUID | None = Query(None),
    priority: int | None = Query(None, ge=1, le=4),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    user: User = Depends(get_current_user),
    service: BacklogService = Depends(get_backlog_service),
):
    items, _ = await service.list(user.id, status_filter, course_id, priority, skip, limit)
    return items


@router.get("/{item_id}", response_model=BacklogItemResponse)
async def get_backlog_item(
    item_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: BacklogService = Depends(get_backlog_service),
):
    item = await service.get(item_id, user.id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backlog item not found")
    return item


@router.put("/{item_id}", response_model=BacklogItemResponse)
async def update_backlog_item(
    item_id: uuid.UUID,
    data: BacklogItemUpdate,
    user: User = Depends(get_current_user),
    service: BacklogService = Depends(get_backlog_service),
):
    try:
        item = await service.update(item_id, user.id, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backlog item not found")
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_backlog_item(
    item_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: BacklogService = Depends(get_backlog_service),
):
    deleted = await service.delete(item_id, user.id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backlog item not found")
