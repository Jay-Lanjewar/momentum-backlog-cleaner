import uuid
from datetime import date, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1 import router as v1_router
from app.core.dependencies import get_current_user, get_db
from app.domain.models import BacklogItem, Course, Goal, StudentProfile, User, WeeklySchedule

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


def _make_profile():
    return StudentProfile(
        id=uuid.uuid4(), user_id=USER_ID,
        sleep_schedule={"start": "22:00", "end": "06:00"},
        preferred_study_window={"earliest_start": "06:00", "latest_end": "22:00"},
        energy_peak="morning", daily_target_minutes=120,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )


def _make_schedule():
    return WeeklySchedule(
        id=uuid.uuid4(), user_id=USER_ID,
        schedule={"monday": [{"start": "09:00", "end": "17:00"}]},
    )


MOCK_STREAKS = {
    "momentum": {
        "current_streak": 5,
        "longest_streak": 12,
        "total_study_days": 30,
        "last_completed_date": None,
        "recovery_tokens_current": 0,
        "recovery_tokens_earned": 0,
        "recovery_tokens_used": 0,
        "streak_protected_today": False,
    },
    "subjects": [],
}


MOCK_BALANCE = {"score": 72, "message": "Good balance", "neglected_subjects": []}


MOCK_INSIGHT = {"title": "Keep going!", "message": "You're doing great.", "priority": 1}


class TestDashboardEndpoint:
    def test_dashboard_returns_deterministic_plan(self, app, mock_db, mock_user):
        course = Course(id=uuid.uuid4(), user_id=USER_ID, name="Math", color="#6366f1")
        backlog_item = BacklogItem(
            id=uuid.uuid4(), user_id=USER_ID, course_id=course.id,
            title="Homework", priority=1, estimated_minutes=60, status="pending",
        )
        profile = _make_profile()
        schedule = _make_schedule()

        mock_db.execute.side_effect = [
            _mock_scalar(profile),
            _mock_scalar(schedule),
            _mock_scalars([course]),
            _mock_scalars([backlog_item]),
            _mock_scalars([]),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user] = lambda: mock_user

        with patch("app.api.v1.dashboard.StreakService") as mock_streak_cls, \
             patch("app.api.v1.dashboard.MotivationService") as mock_motivation_cls:
            mock_streak = mock_streak_cls.return_value
            mock_streak.get_streaks = AsyncMock(return_value=MOCK_STREAKS)
            mock_streak.compute_balance_score = AsyncMock(return_value=MOCK_BALANCE)
            mock_motivation = mock_motivation_cls.return_value
            mock_motivation.get_insight = AsyncMock(return_value=MOCK_INSIGHT)

            client = TestClient(app)
            response = client.get("/api/v1/dashboard")

        app.dependency_overrides.clear()

        assert response.status_code == 200
        data = response.json()
        assert data["plan"]["source"] == "deterministic"
        assert "plan" in data
        assert "sessions" in data["plan"]["plan"]
        assert "daily_message" in data["plan"]["plan"]
        assert "overflow" in data["plan"]["plan"]

    def test_dashboard_does_not_call_gemini(self, app, mock_db, mock_user):
        course = Course(id=uuid.uuid4(), user_id=USER_ID, name="Math", color="#6366f1")
        backlog_item = BacklogItem(
            id=uuid.uuid4(), user_id=USER_ID, course_id=course.id,
            title="Homework", priority=1, estimated_minutes=60, status="pending",
        )
        profile = _make_profile()
        schedule = _make_schedule()

        mock_db.execute.side_effect = [
            _mock_scalar(profile),
            _mock_scalar(schedule),
            _mock_scalars([course]),
            _mock_scalars([backlog_item]),
            _mock_scalars([]),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user] = lambda: mock_user

        with patch("app.api.v1.dashboard.generate_deterministic_plan") as mock_deterministic, \
             patch("app.api.v1.dashboard.StreakService") as mock_streak_cls, \
             patch("app.api.v1.dashboard.MotivationService") as mock_motivation_cls:
            mock_deterministic.return_value = {
                "sessions": [],
                "daily_message": "No tasks scheduled",
                "overflow": [],
            }
            mock_streak = mock_streak_cls.return_value
            mock_streak.get_streaks = AsyncMock(return_value=MOCK_STREAKS)
            mock_streak.compute_balance_score = AsyncMock(return_value=MOCK_BALANCE)
            mock_motivation = mock_motivation_cls.return_value
            mock_motivation.get_insight = AsyncMock(return_value=MOCK_INSIGHT)

            client = TestClient(app)
            response = client.get("/api/v1/dashboard")

        app.dependency_overrides.clear()

        assert response.status_code == 200
        mock_deterministic.assert_called_once()

    def test_dashboard_response_schema_unchanged(self, app, mock_db, mock_user):
        course = Course(id=uuid.uuid4(), user_id=USER_ID, name="Math", color="#6366f1")
        backlog_item = BacklogItem(
            id=uuid.uuid4(), user_id=USER_ID, course_id=course.id,
            title="Homework", priority=1, estimated_minutes=60, status="pending",
        )
        profile = _make_profile()
        schedule = _make_schedule()

        mock_db.execute.side_effect = [
            _mock_scalar(profile),
            _mock_scalar(schedule),
            _mock_scalars([course]),
            _mock_scalars([backlog_item]),
            _mock_scalars([]),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user] = lambda: mock_user

        with patch("app.api.v1.dashboard.StreakService") as mock_streak_cls, \
             patch("app.api.v1.dashboard.MotivationService") as mock_motivation_cls:
            mock_streak = mock_streak_cls.return_value
            mock_streak.get_streaks = AsyncMock(return_value=MOCK_STREAKS)
            mock_streak.compute_balance_score = AsyncMock(return_value=MOCK_BALANCE)
            mock_motivation = mock_motivation_cls.return_value
            mock_motivation.get_insight = AsyncMock(return_value=MOCK_INSIGHT)

            client = TestClient(app)
            response = client.get("/api/v1/dashboard")

        app.dependency_overrides.clear()

        assert response.status_code == 200
        data = response.json()
        assert "profile" in data
        assert "streaks" in data
        assert "balance" in data
        assert "insight" in data
        assert "planning" in data
        assert "plan" in data
        assert "sessions" in data["plan"]["plan"]
        assert "daily_message" in data["plan"]["plan"]
        assert "overflow" in data["plan"]["plan"]
        assert "source" in data["plan"]

    def test_dashboard_succeeds_when_gemini_unavailable(self, app, mock_db, mock_user):
        course = Course(id=uuid.uuid4(), user_id=USER_ID, name="Math", color="#6366f1")
        backlog_item = BacklogItem(
            id=uuid.uuid4(), user_id=USER_ID, course_id=course.id,
            title="Homework", priority=1, estimated_minutes=60, status="pending",
        )
        profile = _make_profile()
        schedule = _make_schedule()

        mock_db.execute.side_effect = [
            _mock_scalar(profile),
            _mock_scalar(schedule),
            _mock_scalars([course]),
            _mock_scalars([backlog_item]),
            _mock_scalars([]),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user] = lambda: mock_user

        with patch("app.api.v1.dashboard.generate_deterministic_plan") as mock_deterministic, \
             patch("app.api.v1.dashboard.StreakService") as mock_streak_cls, \
             patch("app.api.v1.dashboard.MotivationService") as mock_motivation_cls:
            mock_deterministic.return_value = {
                "sessions": [
                    {
                        "backlog_item_id": str(backlog_item.id),
                        "start_time": "09:00",
                        "end_time": "10:00",
                        "reason": "Focus on high priority homework",
                    }
                ],
                "daily_message": "You've got this!",
                "overflow": [],
            }
            mock_streak = mock_streak_cls.return_value
            mock_streak.get_streaks = AsyncMock(return_value=MOCK_STREAKS)
            mock_streak.compute_balance_score = AsyncMock(return_value=MOCK_BALANCE)
            mock_motivation = mock_motivation_cls.return_value
            mock_motivation.get_insight = AsyncMock(return_value=MOCK_INSIGHT)

            client = TestClient(app)
            response = client.get("/api/v1/dashboard")

        app.dependency_overrides.clear()

        assert response.status_code == 200
        data = response.json()
        assert data["plan"]["source"] == "deterministic"
        assert len(data["plan"]["plan"]["sessions"]) == 1
        assert data["plan"]["plan"]["daily_message"] == "You've got this!"
