import uuid
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1 import router as v1_router
from app.core.dependencies import get_current_user, get_db
from app.domain.models import BacklogItem, Course, Goal, StudentProfile, User, WeeklySchedule

MONDAY = date(2026, 7, 20)
USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(v1_router)
    return app


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.execute = AsyncMock()
    return db


@pytest.fixture
def mock_user():
    return User(id=USER_ID, email="test@test.com", name="Test")


def _mock_scalar(return_value):
    m = MagicMock()
    m.scalar_one_or_none = MagicMock(return_value=return_value)
    return m


def _mock_scalars(return_values):
    scalars = MagicMock()
    scalars.all = MagicMock(return_value=return_values)
    m = MagicMock()
    m.scalars = MagicMock(return_value=scalars)
    return m


def _make_schedule_data():
    return {"monday": []}


def _make_profile():
    return StudentProfile(
        id=uuid.uuid4(), user_id=USER_ID,
        sleep_schedule={"start": "22:00", "end": "06:00"},
        preferred_study_window={"earliest_start": "06:00", "latest_end": "22:00"},
        energy_peak="morning", daily_target_minutes=120,
    )


class TestGeneratePlanEndpoint:
    def test_ai_plan_returned(self, app, mock_db, mock_user):
        course = Course(id=uuid.uuid4(), user_id=USER_ID, name="Math", color="#6366f1")
        backlog_item = BacklogItem(
            id=uuid.uuid4(), user_id=USER_ID, course_id=course.id,
            title="Homework", priority=1, estimated_minutes=60, status="pending",
        )
        profile = _make_profile()
        schedule = WeeklySchedule(
            id=uuid.uuid4(), user_id=USER_ID, schedule=_make_schedule_data(),
        )

        mock_db.execute.side_effect = [
            _mock_scalar(profile),  # profile
            _mock_scalar(schedule),  # schedule
            _mock_scalars([course]),  # courses
            _mock_scalars([backlog_item]),  # backlog
            _mock_scalars([]),  # goals
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user] = lambda: mock_user

        ai_output = {
            "sessions": [
                {
                    "backlog_item_id": str(backlog_item.id),
                    "start_time": "06:00",
                    "end_time": "07:00",
                    "reason": "Focus on high priority homework",
                }
            ],
            "daily_message": "You've got this!",
            "overflow": [],
        }

        with patch("app.api.v1.plans.create_ai_service") as mock_factory:
            mock_service = AsyncMock()
            mock_service.generate_plan = AsyncMock(return_value=ai_output)
            mock_factory.return_value = mock_service

            client = TestClient(app)
            response = client.post("/api/v1/plans/generate")

        app.dependency_overrides.clear()

        assert response.status_code == 200
        data = response.json()
        assert data["source"] == "ai"
        assert len(data["plan"]["sessions"]) == 1
        assert data["plan"]["sessions"][0]["backlog_item_id"] == str(backlog_item.id)
        assert data["plan"]["daily_message"] == "You've got this!"
        assert data["plan"]["overflow"] == []

    def test_ai_failure_falls_back_to_deterministic(self, app, mock_db, mock_user):
        course = Course(id=uuid.uuid4(), user_id=USER_ID, name="Math", color="#6366f1")
        backlog_item = BacklogItem(
            id=uuid.uuid4(), user_id=USER_ID, course_id=course.id,
            title="Homework", priority=1, estimated_minutes=30, status="pending",
        )
        profile = _make_profile()
        schedule = WeeklySchedule(
            id=uuid.uuid4(), user_id=USER_ID, schedule=_make_schedule_data(),
        )

        mock_db.execute.side_effect = [
            _mock_scalar(profile),
            _mock_scalar(schedule),
            _mock_scalars([course]),
            _mock_scalars([backlog_item]),
            _mock_scalars([]),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user] = lambda: mock_user

        with patch("app.api.v1.plans.create_ai_service") as mock_factory:
            mock_service = AsyncMock()
            mock_service.generate_plan = AsyncMock(return_value=None)
            mock_factory.return_value = mock_service

            client = TestClient(app)
            response = client.post("/api/v1/plans/generate")

        app.dependency_overrides.clear()

        assert response.status_code == 200
        data = response.json()
        assert data["source"] == "deterministic"
        assert len(data["plan"]["sessions"]) == 1

    def test_ai_empty_puts_items_in_overflow(self, app, mock_db, mock_user):
        course = Course(id=uuid.uuid4(), user_id=USER_ID, name="Math", color="#6366f1")
        backlog_item = BacklogItem(
            id=uuid.uuid4(), user_id=USER_ID, course_id=course.id,
            title="Homework", priority=1, estimated_minutes=30, status="pending",
        )
        profile = _make_profile()
        schedule = WeeklySchedule(
            id=uuid.uuid4(), user_id=USER_ID, schedule=_make_schedule_data(),
        )

        mock_db.execute.side_effect = [
            _mock_scalar(profile),
            _mock_scalar(schedule),
            _mock_scalars([course]),
            _mock_scalars([backlog_item]),
            _mock_scalars([]),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user] = lambda: mock_user

        empty_ai = {
            "sessions": [],
            "daily_message": "",
            "overflow": [],
        }

        with patch("app.api.v1.plans.create_ai_service") as mock_factory:
            mock_service = AsyncMock()
            mock_service.generate_plan = AsyncMock(return_value=empty_ai)
            mock_factory.return_value = mock_service

            client = TestClient(app)
            response = client.post("/api/v1/plans/generate")

        app.dependency_overrides.clear()

        assert response.status_code == 200
        data = response.json()
        assert data["source"] == "ai"
        assert len(data["plan"]["sessions"]) == 0
        assert len(data["plan"]["overflow"]) == 1

    def test_ai_network_error_falls_back(self, app, mock_db, mock_user):
        course = Course(id=uuid.uuid4(), user_id=USER_ID, name="Math", color="#6366f1")
        backlog_item = BacklogItem(
            id=uuid.uuid4(), user_id=USER_ID, course_id=course.id,
            title="Homework", priority=1, estimated_minutes=30, status="pending",
        )
        profile = _make_profile()
        schedule = WeeklySchedule(
            id=uuid.uuid4(), user_id=USER_ID, schedule=_make_schedule_data(),
        )

        mock_db.execute.side_effect = [
            _mock_scalar(profile),
            _mock_scalar(schedule),
            _mock_scalars([course]),
            _mock_scalars([backlog_item]),
            _mock_scalars([]),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user] = lambda: mock_user

        with patch("app.api.v1.plans.create_ai_service") as mock_factory:
            mock_service = AsyncMock()
            mock_service.generate_plan = AsyncMock(return_value=None)
            mock_factory.return_value = mock_service

            client = TestClient(app)
            response = client.post("/api/v1/plans/generate")

        app.dependency_overrides.clear()

        assert response.status_code == 200
        data = response.json()
        assert data["source"] == "deterministic"
        assert len(data["plan"]["sessions"]) >= 1
