import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1 import router as v1_router
from app.core.dependencies import get_current_user, get_db
from app.domain.models import BacklogItem, Course, User
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


# ─── Integration tests: PUT /backlog/{item_id} snapshot invalidation ───


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(v1_router)
    return app


@pytest.fixture
def mock_user():
    return User(id=TEST_USER_ID, email="test@test.com", name="Test")


class TestBacklogSupersedesCurrentDaySnapshot:
    """Verify successful planning-relevant backlog mutations invalidate today."""

    def _call(self, app, mock_user, method, path, **kwargs):
        app.dependency_overrides[get_current_user] = lambda: mock_user
        try:
            with TestClient(app) as client:
                return getattr(client, method)(path, **kwargs)
        finally:
            app.dependency_overrides.clear()

    @patch("app.api.v1.backlog.supersede_current_day_snapshot", new_callable=AsyncMock)
    def test_create_pending_task_supersedes_today(self, mock_supersede, app, mock_user):
        course = Course(id=uuid.uuid4(), user_id=TEST_USER_ID, name="Math", color="#6366f1")
        item = BacklogItem(
            id=uuid.uuid4(), user_id=TEST_USER_ID, course_id=course.id,
            title="Quadratic equations practice", description="20 questions",
            priority=3, estimated_minutes=None, status="pending",
            created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc),
        )
        service = AsyncMock()
        service.create.return_value = item
        with patch("app.api.v1.backlog.BacklogService", return_value=service):
            response = self._call(
                app, mock_user, "post", "/api/v1/backlog",
                json={"title": item.title, "description": item.description,
                      "priority": 3, "estimated_minutes": None,
                      "course_id": str(course.id)},
            )
        assert response.status_code == 201
        mock_supersede.assert_awaited_once()
        assert mock_supersede.await_args.args[1] == TEST_USER_ID

    @patch("app.api.v1.backlog.supersede_current_day_snapshot", new_callable=AsyncMock)
    def test_create_completed_task_does_not_supersede_today(
        self, mock_supersede, app, mock_user
    ):
        course = Course(id=uuid.uuid4(), user_id=TEST_USER_ID, name="Math", color="#6366f1")
        item = BacklogItem(
            id=uuid.uuid4(), user_id=TEST_USER_ID, course_id=course.id,
            title="Already done", priority=3, estimated_minutes=30, status="completed",
            created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc),
        )
        service = AsyncMock()
        service.create.return_value = item
        with patch("app.api.v1.backlog.BacklogService", return_value=service):
            response = self._call(
                app, mock_user, "post", "/api/v1/backlog",
                json={"title": item.title, "priority": 3, "estimated_minutes": 30,
                      "course_id": str(course.id)},
            )
        assert response.status_code == 201
        mock_supersede.assert_not_awaited()

    @patch("app.api.v1.backlog.supersede_current_day_snapshot", new_callable=AsyncMock)
    def test_update_planning_fields_supersedes_today_once(self, mock_supersede, app, mock_user):
        now = datetime.now(timezone.utc)
        course = Course(id=uuid.uuid4(), user_id=TEST_USER_ID, name="Math", color="#6366f1")
        item = BacklogItem(
            id=uuid.uuid4(), user_id=TEST_USER_ID, course_id=course.id,
            title="Homework", priority=3, estimated_minutes=30, status="pending",
            created_at=now, updated_at=now,
        )
        updated = BacklogItem(
            id=item.id, user_id=TEST_USER_ID, course_id=course.id,
            title="Updated homework", priority=1, estimated_minutes=60, status="pending",
            created_at=now, updated_at=now,
        )
        service = AsyncMock()
        service.get.return_value = item
        service.update.return_value = updated
        with patch("app.api.v1.backlog.BacklogService", return_value=service):
            response = self._call(
                app, mock_user, "put", f"/api/v1/backlog/{item.id}",
                json={"title": "Updated homework", "priority": 1, "estimated_minutes": 60},
            )
        assert response.status_code == 200
        mock_supersede.assert_awaited_once()

    @patch("app.api.v1.backlog.supersede_current_day_snapshot", new_callable=AsyncMock)
    @patch("app.api.v1.backlog.ActivityService")
    def test_completion_records_activity_and_supersedes_once(
        self, mock_activity_cls, mock_supersede, app, mock_user
    ):
        now = datetime.now(timezone.utc)
        course = Course(id=uuid.uuid4(), user_id=TEST_USER_ID, name="Math", color="#6366f1")
        item = BacklogItem(
            id=uuid.uuid4(), user_id=TEST_USER_ID, course_id=course.id,
            title="Homework", priority=3, estimated_minutes=60, status="pending",
            created_at=now, updated_at=now,
        )
        completed = BacklogItem(
            id=item.id, user_id=TEST_USER_ID, course_id=course.id,
            title=item.title, priority=3, estimated_minutes=60, status="completed",
            created_at=now, updated_at=now,
        )
        service = AsyncMock()
        service.get.return_value = item
        service.update.return_value = completed
        mock_activity_cls.return_value = AsyncMock()
        with patch("app.api.v1.backlog.BacklogService", return_value=service):
            response = self._call(
                app, mock_user, "put", f"/api/v1/backlog/{item.id}",
                json={"status": "completed"},
            )
        assert response.status_code == 200
        mock_supersede.assert_awaited_once()

    @patch("app.api.v1.backlog.supersede_current_day_snapshot", new_callable=AsyncMock)
    def test_delete_task_supersedes_today(self, mock_supersede, app, mock_user):
        service = AsyncMock()
        service.delete.return_value = True
        item_id = uuid.uuid4()
        with patch("app.api.v1.backlog.BacklogService", return_value=service):
            response = self._call(app, mock_user, "delete", f"/api/v1/backlog/{item_id}")
        assert response.status_code == 204
        mock_supersede.assert_awaited_once()
