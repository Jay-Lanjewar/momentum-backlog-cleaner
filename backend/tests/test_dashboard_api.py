import uuid
from datetime import date, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1 import router as v1_router
from app.core.dependencies import get_current_user_id, get_db
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


def _mock_unique_scalar(return_value):
    m = MagicMock()
    unique_mock = MagicMock()
    unique_mock.scalar_one_or_none = MagicMock(return_value=return_value)
    m.unique = MagicMock(return_value=unique_mock)
    return m


def _mock_rows(rows):
    m = MagicMock()
    m.all = MagicMock(return_value=rows)
    return m


def _make_user_with_relations(profile=None, schedule=None, streak=None):
    user = User(id=USER_ID, email="test@test.com", name="Test")
    user.profile = profile
    user.schedule = schedule
    user.study_streak = streak
    return user


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
        user_with_relations = _make_user_with_relations(profile, schedule, None)

        mock_db.execute.side_effect = [
            _mock_unique_scalar(user_with_relations),
            _mock_rows([(course, backlog_item)]),
            _mock_scalars([]),
            _mock_scalar(None),
            _mock_scalars([]),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_id] = lambda: USER_ID

        with patch("app.api.v1.dashboard.get_or_create_active_snapshot") as mock_snapshot, \
             patch("app.api.v1.dashboard.StreakService") as mock_streak_cls, \
             patch("app.api.v1.dashboard.MotivationService") as mock_motivation_cls:
            mock_snapshot.return_value = MagicMock(
                id=uuid.uuid4(),
                sessions=[],
                daily_message="No tasks scheduled",
                overflow=[],
                source="deterministic",
            )
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
        user_with_relations = _make_user_with_relations(profile, schedule, None)

        mock_db.execute.side_effect = [
            _mock_unique_scalar(user_with_relations),
            _mock_rows([(course, backlog_item)]),
            _mock_scalars([]),
            _mock_scalar(None),
            _mock_scalars([]),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_id] = lambda: USER_ID

        with patch("app.api.v1.dashboard.get_or_create_active_snapshot") as mock_snapshot, \
             patch("app.api.v1.dashboard.StreakService") as mock_streak_cls, \
             patch("app.api.v1.dashboard.MotivationService") as mock_motivation_cls:
            mock_snapshot.return_value = MagicMock(
                id=uuid.uuid4(),
                sessions=[],
                daily_message="No tasks scheduled",
                overflow=[],
                source="deterministic",
            )
            mock_streak = mock_streak_cls.return_value
            mock_streak.get_streaks = AsyncMock(return_value=MOCK_STREAKS)
            mock_streak.compute_balance_score = AsyncMock(return_value=MOCK_BALANCE)
            mock_motivation = mock_motivation_cls.return_value
            mock_motivation.get_insight = AsyncMock(return_value=MOCK_INSIGHT)

            client = TestClient(app)
            response = client.get("/api/v1/dashboard")

        app.dependency_overrides.clear()

        assert response.status_code == 200
        mock_snapshot.assert_called_once()

    def test_dashboard_response_schema_unchanged(self, app, mock_db, mock_user):
        course = Course(id=uuid.uuid4(), user_id=USER_ID, name="Math", color="#6366f1")
        backlog_item = BacklogItem(
            id=uuid.uuid4(), user_id=USER_ID, course_id=course.id,
            title="Homework", priority=1, estimated_minutes=60, status="pending",
        )
        profile = _make_profile()
        schedule = _make_schedule()
        user_with_relations = _make_user_with_relations(profile, schedule, None)

        mock_db.execute.side_effect = [
            _mock_unique_scalar(user_with_relations),
            _mock_rows([(course, backlog_item)]),
            _mock_scalars([]),
            _mock_scalar(None),
            _mock_scalars([]),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_id] = lambda: USER_ID

        with patch("app.api.v1.dashboard.get_or_create_active_snapshot") as mock_snapshot, \
             patch("app.api.v1.dashboard.StreakService") as mock_streak_cls, \
             patch("app.api.v1.dashboard.MotivationService") as mock_motivation_cls:
            mock_snapshot.return_value = MagicMock(
                id=uuid.uuid4(),
                sessions=[],
                daily_message="",
                overflow=[],
                source="deterministic",
            )
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
        user_with_relations = _make_user_with_relations(profile, schedule, None)

        mock_db.execute.side_effect = [
            _mock_unique_scalar(user_with_relations),
            _mock_rows([(course, backlog_item)]),
            _mock_scalars([]),
            _mock_scalar(None),
            _mock_scalars([]),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_id] = lambda: USER_ID

        with patch("app.api.v1.dashboard.get_or_create_active_snapshot") as mock_snapshot, \
             patch("app.api.v1.dashboard.StreakService") as mock_streak_cls, \
             patch("app.api.v1.dashboard.MotivationService") as mock_motivation_cls:
            mock_snapshot.return_value = MagicMock(
                id=uuid.uuid4(),
                sessions=[
                    {
                        "backlog_item_id": str(backlog_item.id),
                        "session_id": f"{backlog_item.id}:s1",
                        "start_time": "09:00",
                        "end_time": "10:00",
                        "reason": "Focus on high priority homework",
                        "remaining_minutes": 0,
                    }
                ],
                daily_message="You've got this!",
                overflow=[],
                source="deterministic",
            )
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

    def test_dashboard_performs_five_queries(self, app, mock_db, mock_user):
        course = Course(id=uuid.uuid4(), user_id=USER_ID, name="Math", color="#6366f1")
        backlog_item = BacklogItem(
            id=uuid.uuid4(), user_id=USER_ID, course_id=course.id,
            title="Homework", priority=1, estimated_minutes=60, status="pending",
        )
        profile = _make_profile()
        schedule = _make_schedule()
        user_with_relations = _make_user_with_relations(profile, schedule, None)

        mock_db.execute.side_effect = [
            _mock_unique_scalar(user_with_relations),
            _mock_rows([(course, backlog_item)]),
            _mock_scalars([]),
            _mock_scalar(None),
            _mock_scalars([]),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_id] = lambda: USER_ID

        with patch("app.api.v1.dashboard.get_or_create_active_snapshot") as mock_snapshot, \
             patch("app.api.v1.dashboard.StreakService") as mock_streak_cls, \
             patch("app.api.v1.dashboard.MotivationService") as mock_motivation_cls:
            mock_snapshot.return_value = MagicMock(
                id=uuid.uuid4(),
                sessions=[],
                daily_message="No tasks scheduled",
                overflow=[],
                source="deterministic",
            )
            mock_streak = mock_streak_cls.return_value
            mock_streak.get_streaks = AsyncMock(return_value=MOCK_STREAKS)
            mock_streak.compute_balance_score = AsyncMock(return_value=MOCK_BALANCE)
            mock_motivation = mock_motivation_cls.return_value
            mock_motivation.get_insight = AsyncMock(return_value=MOCK_INSIGHT)

            client = TestClient(app)
            response = client.get("/api/v1/dashboard")

        app.dependency_overrides.clear()

        assert response.status_code == 200
        assert mock_db.execute.call_count == 4
        mock_snapshot.assert_called_once()

    def test_dashboard_deduplicates_courses(self, app, mock_db, mock_user):
        course = Course(id=uuid.uuid4(), user_id=USER_ID, name="Math", color="#6366f1")
        backlog_item1 = BacklogItem(
            id=uuid.uuid4(), user_id=USER_ID, course_id=course.id,
            title="Homework 1", priority=1, estimated_minutes=60, status="pending",
        )
        backlog_item2 = BacklogItem(
            id=uuid.uuid4(), user_id=USER_ID, course_id=course.id,
            title="Homework 2", priority=2, estimated_minutes=30, status="pending",
        )
        profile = _make_profile()
        schedule = _make_schedule()
        user_with_relations = _make_user_with_relations(profile, schedule, None)

        mock_db.execute.side_effect = [
            _mock_unique_scalar(user_with_relations),
            _mock_rows([(course, backlog_item1), (course, backlog_item2)]),
            _mock_scalars([]),
            _mock_scalar(None),
            _mock_scalars([]),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_id] = lambda: USER_ID

        with patch("app.api.v1.dashboard.get_or_create_active_snapshot") as mock_snapshot, \
             patch("app.api.v1.dashboard.StreakService") as mock_streak_cls, \
             patch("app.api.v1.dashboard.MotivationService") as mock_motivation_cls:
            mock_snapshot.return_value = MagicMock(
                id=uuid.uuid4(),
                sessions=[],
                daily_message="No tasks scheduled",
                overflow=[],
                source="deterministic",
            )
            mock_streak = mock_streak_cls.return_value
            mock_streak.get_streaks = AsyncMock(return_value=MOCK_STREAKS)
            mock_streak.compute_balance_score = AsyncMock(return_value=MOCK_BALANCE)
            mock_motivation = mock_motivation_cls.return_value
            mock_motivation.get_insight = AsyncMock(return_value=MOCK_INSIGHT)

            client = TestClient(app)
            response = client.get("/api/v1/dashboard")

        app.dependency_overrides.clear()

        assert response.status_code == 200
        planning = response.json()["planning"]
        assert len(planning["prioritized_backlog"]) == 2

    def test_dashboard_handles_zero_courses(self, app, mock_db, mock_user):
        profile = _make_profile()
        schedule = _make_schedule()
        user_with_relations = _make_user_with_relations(profile, schedule, None)

        mock_db.execute.side_effect = [
            _mock_unique_scalar(user_with_relations),
            _mock_rows([]),
            _mock_scalars([]),
            _mock_scalar(None),
            _mock_scalars([]),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_id] = lambda: USER_ID

        with patch("app.api.v1.dashboard.get_or_create_active_snapshot") as mock_snapshot, \
             patch("app.api.v1.dashboard.StreakService") as mock_streak_cls, \
             patch("app.api.v1.dashboard.MotivationService") as mock_motivation_cls:
            mock_snapshot.return_value = MagicMock(
                id=uuid.uuid4(),
                sessions=[],
                daily_message="No tasks scheduled",
                overflow=[],
                source="deterministic",
            )
            mock_streak = mock_streak_cls.return_value
            mock_streak.get_streaks = AsyncMock(return_value=MOCK_STREAKS)
            mock_streak.compute_balance_score = AsyncMock(return_value=MOCK_BALANCE)
            mock_motivation = mock_motivation_cls.return_value
            mock_motivation.get_insight = AsyncMock(return_value=MOCK_INSIGHT)

            client = TestClient(app)
            response = client.get("/api/v1/dashboard")

        app.dependency_overrides.clear()

        assert response.status_code == 200
        planning = response.json()["planning"]
        assert planning["prioritized_backlog"] == []

    def test_dashboard_handles_zero_backlog_items(self, app, mock_db, mock_user):
        course = Course(id=uuid.uuid4(), user_id=USER_ID, name="Math", color="#6366f1")
        profile = _make_profile()
        schedule = _make_schedule()
        user_with_relations = _make_user_with_relations(profile, schedule, None)

        mock_db.execute.side_effect = [
            _mock_unique_scalar(user_with_relations),
            _mock_rows([(course, None)]),
            _mock_scalars([]),
            _mock_scalar(None),
            _mock_scalars([]),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_id] = lambda: USER_ID

        with patch("app.api.v1.dashboard.get_or_create_active_snapshot") as mock_snapshot, \
             patch("app.api.v1.dashboard.StreakService") as mock_streak_cls, \
             patch("app.api.v1.dashboard.MotivationService") as mock_motivation_cls:
            mock_snapshot.return_value = MagicMock(
                id=uuid.uuid4(),
                sessions=[],
                daily_message="No tasks scheduled",
                overflow=[],
                source="deterministic",
            )
            mock_streak = mock_streak_cls.return_value
            mock_streak.get_streaks = AsyncMock(return_value=MOCK_STREAKS)
            mock_streak.compute_balance_score = AsyncMock(return_value=MOCK_BALANCE)
            mock_motivation = mock_motivation_cls.return_value
            mock_motivation.get_insight = AsyncMock(return_value=MOCK_INSIGHT)

            client = TestClient(app)
            response = client.get("/api/v1/dashboard")

        app.dependency_overrides.clear()

        assert response.status_code == 200
        planning = response.json()["planning"]
        assert planning["prioritized_backlog"] == []
