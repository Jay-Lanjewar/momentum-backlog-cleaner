import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.domain.models import User
from app.domain.schemas import CourseCreate, CourseResponse, CourseUpdate
from app.repositories.course_repo import CourseRepository
from app.services.course_service import CourseService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/courses", tags=["courses"])


async def get_course_service(db: AsyncSession = Depends(get_db)) -> CourseService:
    repo = CourseRepository(db)
    return CourseService(repo)


@router.post("", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
async def create_course(
    data: CourseCreate,
    user: User = Depends(get_current_user),
    service: CourseService = Depends(get_course_service),
):
    course = await service.create(user.id, data)
    return course


@router.get("", response_model=list[CourseResponse])
async def list_courses(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    user: User = Depends(get_current_user),
    service: CourseService = Depends(get_course_service),
):
    items, _ = await service.list(user.id, skip, limit)
    return items


@router.get("/{course_id}", response_model=CourseResponse)
async def get_course(
    course_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: CourseService = Depends(get_course_service),
):
    course = await service.get(course_id, user.id)
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    return course


@router.put("/{course_id}", response_model=CourseResponse)
async def update_course(
    course_id: uuid.UUID,
    data: CourseUpdate,
    user: User = Depends(get_current_user),
    service: CourseService = Depends(get_course_service),
):
    course = await service.update(course_id, user.id, data)
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    return course


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course(
    course_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: CourseService = Depends(get_course_service),
):
    deleted = await service.delete(course_id, user.id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
