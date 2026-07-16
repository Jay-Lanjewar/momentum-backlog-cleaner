import uuid
from unittest.mock import AsyncMock

import pytest

from app.domain.models import Course
from app.domain.schemas import CourseCreate, CourseUpdate
from app.services.course_service import CourseService
from tests.conftest import TEST_USER_ID, TEST_USER_ID_2


@pytest.fixture
def sample_course() -> Course:
    return Course(
        id=uuid.uuid4(),
        user_id=TEST_USER_ID,
        name="Mathematics",
        color="#6366f1",
    )


@pytest.mark.asyncio
async def test_create_course(course_service: CourseService, course_repo: AsyncMock):
    data = CourseCreate(name="Physics", color="#ef4444")
    expected = Course(id=uuid.uuid4(), user_id=TEST_USER_ID, name="Physics", color="#ef4444")
    course_repo.create.return_value = expected

    result = await course_service.create(TEST_USER_ID, data)

    assert result.name == "Physics"
    assert result.color == "#ef4444"
    course_repo.create.assert_awaited_once_with(
        user_id=TEST_USER_ID, name="Physics", color="#ef4444"
    )


@pytest.mark.asyncio
async def test_get_course_own(
    course_service: CourseService, course_repo: AsyncMock, sample_course: Course
):
    course_repo.get.return_value = sample_course

    result = await course_service.get(sample_course.id, TEST_USER_ID)

    assert result is not None
    assert result.id == sample_course.id


@pytest.mark.asyncio
async def test_get_course_not_owned(
    course_service: CourseService, course_repo: AsyncMock, sample_course: Course
):
    course_repo.get.return_value = sample_course

    result = await course_service.get(sample_course.id, TEST_USER_ID_2)

    assert result is None


@pytest.mark.asyncio
async def test_get_course_not_found(course_service: CourseService, course_repo: AsyncMock):
    course_repo.get.return_value = None

    result = await course_service.get(uuid.uuid4(), TEST_USER_ID)

    assert result is None


@pytest.mark.asyncio
async def test_list_courses(
    course_service: CourseService, course_repo: AsyncMock, sample_course: Course
):
    course_repo.list.return_value = ([sample_course], 1)

    items, total = await course_service.list(TEST_USER_ID)

    assert len(items) == 1
    assert total == 1


@pytest.mark.asyncio
async def test_update_course_own(
    course_service: CourseService, course_repo: AsyncMock, sample_course: Course
):
    course_repo.get.return_value = sample_course
    updated = Course(
        id=sample_course.id,
        user_id=TEST_USER_ID,
        name="Advanced Mathematics",
        color=sample_course.color,
    )
    course_repo.update.return_value = updated

    data = CourseUpdate(name="Advanced Mathematics")
    result = await course_service.update(sample_course.id, TEST_USER_ID, data)

    assert result is not None
    assert result.name == "Advanced Mathematics"
    course_repo.update.assert_awaited_once_with(
        sample_course.id, name="Advanced Mathematics"
    )


@pytest.mark.asyncio
async def test_update_course_not_owned(
    course_service: CourseService, course_repo: AsyncMock, sample_course: Course
):
    course_repo.get.return_value = sample_course

    data = CourseUpdate(name="Hacked")
    result = await course_service.update(sample_course.id, TEST_USER_ID_2, data)

    assert result is None
    course_repo.update.assert_not_awaited()


@pytest.mark.asyncio
async def test_delete_course_own(
    course_service: CourseService, course_repo: AsyncMock, sample_course: Course
):
    course_repo.get.return_value = sample_course
    course_repo.delete.return_value = True

    result = await course_service.delete(sample_course.id, TEST_USER_ID)

    assert result is True
    course_repo.delete.assert_awaited_once_with(sample_course.id)


@pytest.mark.asyncio
async def test_delete_course_not_owned(
    course_service: CourseService, course_repo: AsyncMock, sample_course: Course
):
    course_repo.get.return_value = sample_course

    result = await course_service.delete(sample_course.id, TEST_USER_ID_2)

    assert result is False
    course_repo.delete.assert_not_awaited()
