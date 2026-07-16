import uuid
from unittest.mock import AsyncMock

import pytest

from app.domain.models import BacklogItem, Course
from app.domain.schemas import BacklogItemCreate, BacklogItemUpdate
from app.services.backlog_service import BacklogService
from tests.conftest import TEST_USER_ID, TEST_USER_ID_2


@pytest.fixture
def sample_course() -> Course:
    return Course(
        id=uuid.uuid4(),
        user_id=TEST_USER_ID,
        name="Mathematics",
        color="#6366f1",
    )


@pytest.fixture
def sample_backlog_item(sample_course: Course) -> BacklogItem:
    return BacklogItem(
        id=uuid.uuid4(),
        user_id=TEST_USER_ID,
        course_id=sample_course.id,
        title="Complete homework",
        priority=3,
        estimated_minutes=60,
        status="pending",
    )


@pytest.mark.asyncio
async def test_create_backlog_item(
    backlog_service: BacklogService,
    backlog_repo: AsyncMock,
    course_repo: AsyncMock,
    sample_course: Course,
):
    course_repo.get.return_value = sample_course
    expected = BacklogItem(
        id=uuid.uuid4(),
        user_id=TEST_USER_ID,
        course_id=sample_course.id,
        title="Complete homework",
        priority=3,
        estimated_minutes=60,
        status="pending",
    )
    backlog_repo.create.return_value = expected

    data = BacklogItemCreate(
        title="Complete homework",
        course_id=sample_course.id,
        priority=3,
        estimated_minutes=60,
    )
    result = await backlog_service.create(TEST_USER_ID, data)

    assert result.title == "Complete homework"
    assert result.course_id == sample_course.id
    backlog_repo.create.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_backlog_item_invalid_course(
    backlog_service: BacklogService,
    backlog_repo: AsyncMock,
    course_repo: AsyncMock,
):
    course_repo.get.return_value = None

    data = BacklogItemCreate(
        title="Invalid",
        course_id=uuid.uuid4(),
    )
    with pytest.raises(ValueError, match="Course not found"):
        await backlog_service.create(TEST_USER_ID, data)


@pytest.mark.asyncio
async def test_get_backlog_item_own(
    backlog_service: BacklogService,
    backlog_repo: AsyncMock,
    sample_backlog_item: BacklogItem,
):
    backlog_repo.get.return_value = sample_backlog_item

    result = await backlog_service.get(sample_backlog_item.id, TEST_USER_ID)

    assert result is not None
    assert result.id == sample_backlog_item.id


@pytest.mark.asyncio
async def test_get_backlog_item_not_owned(
    backlog_service: BacklogService,
    backlog_repo: AsyncMock,
    sample_backlog_item: BacklogItem,
):
    backlog_repo.get.return_value = sample_backlog_item

    result = await backlog_service.get(sample_backlog_item.id, TEST_USER_ID_2)

    assert result is None


@pytest.mark.asyncio
async def test_list_backlog_with_filters(
    backlog_service: BacklogService,
    backlog_repo: AsyncMock,
    sample_backlog_item: BacklogItem,
):
    backlog_repo.list.return_value = ([sample_backlog_item], 1)

    items, total = await backlog_service.list(
        TEST_USER_ID, status="pending", priority=3
    )

    assert len(items) == 1
    assert total == 1
    backlog_repo.list.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_backlog_status(
    backlog_service: BacklogService,
    backlog_repo: AsyncMock,
    sample_backlog_item: BacklogItem,
):
    backlog_repo.get.return_value = sample_backlog_item
    updated = BacklogItem(
        id=sample_backlog_item.id,
        user_id=TEST_USER_ID,
        course_id=sample_backlog_item.course_id,
        title=sample_backlog_item.title,
        priority=sample_backlog_item.priority,
        estimated_minutes=sample_backlog_item.estimated_minutes,
        status="completed",
    )
    backlog_repo.update.return_value = updated

    data = BacklogItemUpdate(status="completed")
    result = await backlog_service.update(
        sample_backlog_item.id, TEST_USER_ID, data
    )

    assert result is not None
    assert result.status == "completed"


@pytest.mark.asyncio
async def test_delete_backlog_item_own(
    backlog_service: BacklogService,
    backlog_repo: AsyncMock,
    sample_backlog_item: BacklogItem,
):
    backlog_repo.get.return_value = sample_backlog_item
    backlog_repo.delete.return_value = True

    result = await backlog_service.delete(sample_backlog_item.id, TEST_USER_ID)

    assert result is True


@pytest.mark.asyncio
async def test_delete_backlog_item_not_owned(
    backlog_service: BacklogService,
    backlog_repo: AsyncMock,
    sample_backlog_item: BacklogItem,
):
    backlog_repo.get.return_value = sample_backlog_item

    result = await backlog_service.delete(sample_backlog_item.id, TEST_USER_ID_2)

    assert result is False
