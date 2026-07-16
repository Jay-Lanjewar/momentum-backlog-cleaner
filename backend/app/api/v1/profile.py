import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.domain.models import User
from app.domain.schemas import (
    StudentProfileCreate,
    StudentProfileResponse,
    StudentProfileUpdate,
    WeeklyScheduleResponse,
    WeeklyScheduleUpdate,
)
from app.repositories.profile_repo import StudentProfileRepository, WeeklyScheduleRepository
from app.services.profile_service import StudentProfileService, WeeklyScheduleService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/profile", tags=["profile"])


async def get_profile_service(db: AsyncSession = Depends(get_db)) -> StudentProfileService:
    repo = StudentProfileRepository(db)
    return StudentProfileService(repo)


async def get_schedule_service(db: AsyncSession = Depends(get_db)) -> WeeklyScheduleService:
    repo = WeeklyScheduleRepository(db)
    return WeeklyScheduleService(repo)


@router.get("", response_model=StudentProfileResponse)
async def get_profile(
    user: User = Depends(get_current_user),
    service: StudentProfileService = Depends(get_profile_service),
):
    profile = await service.get(user.id)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return profile


@router.put("", response_model=StudentProfileResponse)
async def upsert_profile(
    data: StudentProfileUpdate,
    user: User = Depends(get_current_user),
    service: StudentProfileService = Depends(get_profile_service),
):
    profile = await service.upsert(user.id, data)
    return profile


@router.post("", response_model=StudentProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_profile(
    data: StudentProfileCreate,
    user: User = Depends(get_current_user),
    service: StudentProfileService = Depends(get_profile_service),
):
    existing = await service.get(user.id)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Profile already exists")
    profile = await service.upsert(user.id, data)
    return profile


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_profile(
    user: User = Depends(get_current_user),
    service: StudentProfileService = Depends(get_profile_service),
):
    deleted = await service.delete(user.id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")


@router.get("/schedule", response_model=WeeklyScheduleResponse)
async def get_schedule(
    user: User = Depends(get_current_user),
    service: WeeklyScheduleService = Depends(get_schedule_service),
):
    schedule = await service.get(user.id)
    if schedule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")
    return schedule


@router.put("/schedule", response_model=WeeklyScheduleResponse)
async def upsert_schedule(
    data: WeeklyScheduleUpdate,
    user: User = Depends(get_current_user),
    service: WeeklyScheduleService = Depends(get_schedule_service),
):
    schedule = await service.upsert(user.id, data)
    return schedule


@router.delete("/schedule", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    user: User = Depends(get_current_user),
    service: WeeklyScheduleService = Depends(get_schedule_service),
):
    deleted = await service.delete(user.id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")
