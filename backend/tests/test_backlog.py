import uuid
from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1 import router as v1_router
from app.core.dependencies import get_current_user, get_db
from app.domain.models import BacklogItem, Course, PlanSnapshot, User
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


class TestBacklogCompletionSupersedesSnapshot:
    """Verify that completing a backlog item via PUT supersedes the active snapshot."""

    @patch("app.api.v1.backlog.supersede_snapshot", new_callable=AsyncMock)
    @patch("app.api.v1.backlog.get_active_snapshot", new_callable=AsyncMock)
    @patch("app.api.v1.backlog.ActivityService")
    def test_completion_supersedes_active_snapshot(
        self, mock_activity_cls, mock_get_snapshot, mock_supersede, app, mock_user
    ):
        """When a backlog item transitions to 'completed', the active snapshot is superseded."""
        now = datetime.now(timezone.utc)
        course = Course(id=uuid.uuid4(), user_id=TEST_USER_ID, name="Math", color="#6366f1")
        item = BacklogItem(
            id=uuid.uuid4(), user_id=TEST_USER_ID, course_id=course.id,
            title="Homework", priority=3, estimated_minutes=60, status="pending",
            created_at=now, updated_at=now,
        )
        completed_item = BacklogItem(
            id=item.id, user_id=TEST_USER_ID, course_id=course.id,
            title="Homework", priority=3, estimated_minutes=60, status="completed",
            created_at=now, updated_at=now,
        )
        snapshot = PlanSnapshot(
            id=uuid.uuid4(), user_id=TEST_USER_ID, plan_date=date.today(),
            version=1, sessions=[], daily_message="", overflow=[],
            source="deterministic", active=True,
        )

        mock_get_snapshot.return_value = snapshot
        mock_act_instance = AsyncMock()
        mock_activity_cls.return_value = mock_act_instance

        mock_service = AsyncMock()
        mock_service.get = AsyncMock(return_value=item)
        mock_service.update = AsyncMock(return_value=completed_item)

        app.dependency_overrides[get_current_user] = lambda: mock_user

        with patch("app.api.v1.backlog.BacklogService", return_value=mock_service):
            client = TestClient(app)
            response = client.put(
                f"/api/v1/backlog/{item.id}",
                json={"status": "completed"},
            )

        app.dependency_overrides.clear()

        assert response.status_code == 200
        assert response.json()["status"] == "completed"
        mock_get_snapshot.assert_awaited_once()
        mock_supersede.assert_awaited_once()

    @patch("app.api.v1.backlog.supersede_snapshot", new_callable=AsyncMock)
    @patch("app.api.v1.backlog.get_active_snapshot", new_callable=AsyncMock)
    @patch("app.api.v1.backlog.ActivityService")
    def test_completion_without_snapshot_does_not_fail(
        self, mock_activity_cls, mock_get_snapshot, mock_supersede, app, mock_user
    ):
        """Completing a backlog item when no active snapshot exists does not fail."""
        now = datetime.now(timezone.utc)
        course = Course(id=uuid.uuid4(), user_id=TEST_USER_ID, name="Math", color="#6366f1")
        item = BacklogItem(
            id=uuid.uuid4(), user_id=TEST_USER_ID, course_id=course.id,
            title="Homework", priority=3, estimated_minutes=60, status="pending",
            created_at=now, updated_at=now,
        )
        completed_item = BacklogItem(
            id=item.id, user_id=TEST_USER_ID, course_id=course.id,
            title="Homework", priority=3, estimated_minutes=60, status="completed",
            created_at=now, updated_at=now,
        )

        mock_get_snapshot.return_value = None
        mock_act_instance = AsyncMock()
        mock_activity_cls.return_value = mock_act_instance

        mock_service = AsyncMock()
        mock_service.get = AsyncMock(return_value=item)
        mock_service.update = AsyncMock(return_value=completed_item)

        app.dependency_overrides[get_current_user] = lambda: mock_user

        with patch("app.api.v1.backlog.BacklogService", return_value=mock_service):
            client = TestClient(app)
            response = client.put(
                f"/api/v1/backlog/{item.id}",
                json={"status": "completed"},
            )

        app.dependency_overrides.clear()

        assert response.status_code == 200
        assert response.json()["status"] == "completed"
        mock_get_snapshot.assert_awaited_once()
        mock_supersede.assert_not_awaited()

    @patch("app.api.v1.backlog.supersede_snapshot", new_callable=AsyncMock)
    @patch("app.api.v1.backlog.get_active_snapshot", new_callable=AsyncMock)
    @patch("app.api.v1.backlog.ActivityService")
    def test_non_completion_status_does_not_supersede(
        self, mock_activity_cls, mock_get_snapshot, mock_supersede, app, mock_user
    ):
        """Changing status to 'in_progress' does NOT supersede the snapshot."""
        now = datetime.now(timezone.utc)
        course = Course(id=uuid.uuid4(), user_id=TEST_USER_ID, name="Math", color="#6366f1")
        item = BacklogItem(
            id=uuid.uuid4(), user_id=TEST_USER_ID, course_id=course.id,
            title="Homework", priority=3, estimated_minutes=60, status="pending",
            created_at=now, updated_at=now,
        )
        in_progress_item = BacklogItem(
            id=item.id, user_id=TEST_USER_ID, course_id=course.id,
            title="Homework", priority=3, estimated_minutes=60, status="in_progress",
            created_at=now, updated_at=now,
        )

        mock_service = AsyncMock()
        mock_service.get = AsyncMock(return_value=item)
        mock_service.update = AsyncMock(return_value=in_progress_item)

        app.dependency_overrides[get_current_user] = lambda: mock_user

        with patch("app.api.v1.backlog.BacklogService", return_value=mock_service):
            client = TestClient(app)
            response = client.put(
                f"/api/v1/backlog/{item.id}",
                json={"status": "in_progress"},
            )

        app.dependency_overrides.clear()

        assert response.status_code == 200
        assert response.json()["status"] == "in_progress"
        mock_get_snapshot.assert_not_awaited()
        mock_supersede.assert_not_awaited()

    @patch("app.api.v1.backlog.supersede_snapshot", new_callable=AsyncMock)
    @patch("app.api.v1.backlog.get_active_snapshot", new_callable=AsyncMock)
    @patch("app.api.v1.backlog.ActivityService")
    def test_already_completed_does_not_supersede_again(
        self, mock_activity_cls, mock_get_snapshot, mock_supersede, app, mock_user
    ):
        """If the item is already 'completed', re-completing does NOT supersede again."""
        now = datetime.now(timezone.utc)
        course = Course(id=uuid.uuid4(), user_id=TEST_USER_ID, name="Math", color="#6366f1")
        item = BacklogItem(
            id=uuid.uuid4(), user_id=TEST_USER_ID, course_id=course.id,
            title="Homework", priority=3, estimated_minutes=60, status="completed",
            created_at=now, updated_at=now,
        )

        mock_service = AsyncMock()
        mock_service.get = AsyncMock(return_value=item)
        mock_service.update = AsyncMock(return_value=item)

        app.dependency_overrides[get_current_user] = lambda: mock_user

        with patch("app.api.v1.backlog.BacklogService", return_value=mock_service):
            client = TestClient(app)
            response = client.put(
                f"/api/v1/backlog/{item.id}",
                json={"status": "completed"},
            )

        app.dependency_overrides.clear()

        assert response.status_code == 200
        mock_get_snapshot.assert_not_awaited()
        mock_supersede.assert_not_awaited()
