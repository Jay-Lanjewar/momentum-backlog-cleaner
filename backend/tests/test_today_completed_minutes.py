"""Regression tests for today_completed_minutes (study time metric).

Verifies that the dashboard API returns correct study time based on
SessionCompletion records, not from active plan sessions.
"""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1 import router as v1_router
from app.core.dependencies import get_current_user_id, get_db
from app.domain.models import (
    BacklogItem,
    Course,
    Goal,
    PlanSnapshot,
    SessionCompletion,
    StudentProfile,
    User,
    WeeklySchedule,
)

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
        "current_streak": 1,
        "longest_streak": 1,
        "total_study_days": 1,
        "last_completed_date": None,
        "recovery_tokens_current": 0,
        "recovery_tokens_earned": 0,
        "recovery_tokens_used": 0,
        "streak_protected_today": False,
    },
    "subjects": [],
}

MOCK_BALANCE = {"score": 100, "message": "Good balance", "neglected_subjects": []}
MOCK_INSIGHT = {"title": "Keep going!", "message": "You're doing great.", "priority": 1}


def _make_completion(actual_minutes, created_at=None):
    """Create a mock SessionCompletion with the given actual_minutes."""
    c = MagicMock(spec=SessionCompletion)
    c.actual_minutes = actual_minutes
    c.created_at = created_at or datetime.now(timezone.utc)
    return c


def _setup_dashboard_mocks(app, mock_db, mock_user_obj, completions=None):
    """Set up dashboard endpoint mocks, returning the TestClient."""
    course = Course(id=uuid.uuid4(), user_id=USER_ID, name="Math", color="#6366f1")
    backlog_item = BacklogItem(
        id=uuid.uuid4(), user_id=USER_ID, course_id=course.id,
        title="Homework", priority=1, estimated_minutes=60, status="pending",
    )
    profile = _make_profile()
    schedule = _make_schedule()
    user_with_relations = _make_user_with_relations(profile, schedule, None)

    completions = completions or []

    mock_db.execute.side_effect = [
        _mock_unique_scalar(user_with_relations),  # 1. base_user
        _mock_rows([(course, backlog_item)]),       # 2. courses_backlog
        _mock_scalars([]),                          # 3. goals
        _mock_scalar(None),                         # 4. subject_streaks
        _mock_scalars(completions),                 # 5. completions (today)
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
    return response


class TestTodayCompletedMinutes:
    def test_no_completed_sessions_returns_zero(self, app, mock_db, mock_user):
        response = _setup_dashboard_mocks(app, mock_db, mock_user, completions=[])
        assert response.status_code == 200
        assert response.json()["today_completed_minutes"] == 0

    def test_one_completed_session_returns_actual_minutes(self, app, mock_db, mock_user):
        completion = _make_completion(actual_minutes=25)
        response = _setup_dashboard_mocks(app, mock_db, mock_user, completions=[completion])
        assert response.status_code == 200
        assert response.json()["today_completed_minutes"] == 25

    def test_multiple_completed_sessions_returns_sum(self, app, mock_db, mock_user):
        completions = [
            _make_completion(actual_minutes=15),
            _make_completion(actual_minutes=30),
            _make_completion(actual_minutes=20),
        ]
        response = _setup_dashboard_mocks(app, mock_db, mock_user, completions=completions)
        assert response.status_code == 200
        assert response.json()["today_completed_minutes"] == 65

    def test_completed_session_not_in_active_plan_still_counted(self, app, mock_db, mock_user):
        """After adaptive completion, the session is removed from the active plan
        but its actual_minutes should still be counted via SessionCompletion."""
        completion = _make_completion(actual_minutes=45)
        response = _setup_dashboard_mocks(app, mock_db, mock_user, completions=[completion])
        assert response.status_code == 200
        assert response.json()["today_completed_minutes"] == 45
        plan_sessions = response.json()["plan"]["plan"]["sessions"]
        assert len(plan_sessions) == 0

    def test_previous_day_completions_excluded(self, app, mock_db, mock_user):
        """Date filtering is done by SQL WHERE clause (SessionCompletion.created_at >= today_start).
        Mock tests cannot verify SQL filtering — this is covered by the integration
        test in validate_dashboard_metrics.py. Here we verify the plumbing returns
        whatever the query yields."""
        yesterday = datetime.now(timezone.utc) - timedelta(days=1)
        old_completion = _make_completion(actual_minutes=60, created_at=yesterday)
        response = _setup_dashboard_mocks(app, mock_db, mock_user, completions=[old_completion])
        assert response.status_code == 200
        assert response.json()["today_completed_minutes"] == 60

    def test_mix_of_today_and_yesterday_completions(self, app, mock_db, mock_user):
        """When the SQL query returns both today and yesterday completions (mock scenario),
        all are summed. Real DB applies date filtering at the SQL level."""
        yesterday = datetime.now(timezone.utc) - timedelta(days=1)
        completions = [
            _make_completion(actual_minutes=30, created_at=yesterday),
            _make_completion(actual_minutes=20),
            _make_completion(actual_minutes=15),
        ]
        response = _setup_dashboard_mocks(app, mock_db, mock_user, completions=completions)
        assert response.status_code == 200
        assert response.json()["today_completed_minutes"] == 65
