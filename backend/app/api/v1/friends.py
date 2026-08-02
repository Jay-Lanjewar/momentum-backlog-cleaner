import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.domain.models import FriendRequest, User
from app.domain.schemas import FriendRequestCreate, FriendRequestResponse, FriendshipResponse, FriendUserResponse
from app.services.friend_service import FriendService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/friends", tags=["friends"])


async def get_friend_service(db: AsyncSession = Depends(get_db)) -> FriendService:
    return FriendService(db)


@router.post("/request", response_model=FriendRequestResponse, status_code=status.HTTP_201_CREATED)
async def send_friend_request(
    data: FriendRequestCreate,
    user: User = Depends(get_current_user),
    service: FriendService = Depends(get_friend_service),
):
    try:
        req = await service.send_request(user.id, data)
        logger.info("[DEBUG send_friend_request] type(req)=%s", type(req))
        logger.info("[DEBUG send_friend_request] repr(req)=%s", repr(req))
        logger.info("[DEBUG send_friend_request] isinstance(req, FriendRequest)=%s", isinstance(req, FriendRequest))
        logger.info("[DEBUG send_friend_request] type(req.sender)=%s", type(req.sender))
        logger.info("[DEBUG send_friend_request] type(req.receiver)=%s", type(req.receiver))
        return FriendRequestResponse.model_validate(req)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/request/{request_id}/accept", response_model=FriendshipResponse)
async def accept_friend_request(
    request_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: FriendService = Depends(get_friend_service),
):
    try:
        friendship = await service.accept_request(user.id, request_id)
        return friendship
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/request/{request_id}/reject", status_code=status.HTTP_204_NO_CONTENT)
async def reject_friend_request(
    request_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: FriendService = Depends(get_friend_service),
):
    try:
        await service.reject_request(user.id, request_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/request/{request_id}/cancel", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_friend_request(
    request_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: FriendService = Depends(get_friend_service),
):
    try:
        await service.cancel_request(user.id, request_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{friend_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_friend(
    friend_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: FriendService = Depends(get_friend_service),
):
    try:
        await service.remove_friend(user.id, friend_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("", response_model=list[FriendshipResponse])
async def list_friends(
    user: User = Depends(get_current_user),
    service: FriendService = Depends(get_friend_service),
):
    return await service.list_friends(user.id)


@router.get("/requests", response_model=dict)
async def list_friend_requests(
    user: User = Depends(get_current_user),
    service: FriendService = Depends(get_friend_service),
):
    return await service.list_pending_requests(user.id)
