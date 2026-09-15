import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1 import router as v1_router
from app.core.dependencies import get_current_user_id, get_db
from app.domain.models import BacklogItem, Course, SessionCompletion, PlanSnapshot, StudyStreak

USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
COURSE_ID = uuid.UUID("00000000-0000-0000-0000-000000000010")
SNAPSHOT_ID = uuid.UUID("00000000-0000-0000-0000-000000000020")


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


def _utc_midnight(dt: datetime) -> datetime:
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


def _mock_rows(rows):
    m = MagicMock()
    m.all = MagicMock(return_value=rows)
    m.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[r for r in rows if not isinstance(r, tuple)])))
    return m


def _mock_scalars(values):
    scalars = MagicMock()
    scalars.all = MagicMock(return_value=values)
    m = MagicMock()
    m.scalars = MagicMock(return_value=scalars)
    return m


def _mock_scalar_one(value):
    m = MagicMock()
    m.scalar_one_or_none = MagicMock(return_value=value)
    return m


def _make_completion(actual_minutes, estimated_minutes=None, created_at=None, course_id=COURSE_ID):
    c = MagicMock(spec=SessionCompletion)
    c.actual_minutes = actual_minutes
    c.estimated_minutes = estimated_minutes or actual_minutes
    c.created_at = created_at or datetime.now(timezone.utc)
    c.plan_snapshot_id = SNAPSHOT_ID
    c.backlog_item_id = uuid.uuid4()
    return c


def _make_course(course_id=COURSE_ID, name="Math", color="#6366f1"):
    return Course(id=course_id, user_id=USER_ID, name=name, color=color)


def _make_streak(current=0, best=0, total_days=0):
    return StudyStreak(
        id=uuid.uuid4(),
        user_id=USER_ID,
        current_streak=current,
        longest_streak=best,
        total_study_days=total_days,
    )


class TestAnalyticsProgress:
    def test_zero_activity(self, app, mock_db):
        now = datetime.now(timezone.utc)
        mock_db.execute.side_effect = [
            _mock_rows([]),     # completions
            _mock_scalars([]),  # courses
            _mock_scalar_one(None),  # streaks
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_id] = lambda: USER_ID

        client = TestClient(app)
        response = client.get("/api/v1/analytics/progress")

        app.dependency_overrides.clear()

        assert response.status_code == 200
        data = response.json()
        assert data["today"]["study_minutes"] == 0
        assert data["today"]["sessions_completed"] == 0
        assert data["week"]["total_study_minutes"] == 0
        assert data["subjects"] == []
        assert data["streaks"]["current"] == 0

    def test_one_completion_today(self, app, mock_db):
        now = datetime.now(timezone.utc)
        today_start = _utc_midnight(now)
        completion = _make_completion(actual_minutes=25, estimated_minutes=30, created_at=today_start + timedelta(hours=10))
        course = _make_course()
        streak = _make_streak()

        mock_db.execute.side_effect = [
            _mock_rows([(completion, today_start.date(), COURSE_ID)]),
            _mock_scalars([course]),
            _mock_scalar_one(streak),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_id] = lambda: USER_ID

        client = TestClient(app)
        response = client.get("/api/v1/analytics/progress")

        app.dependency_overrides.clear()

        assert response.status_code == 200
        data = response.json()
        assert data["today"]["study_minutes"] == 25
        assert data["today"]["sessions_completed"] == 1
        assert data["today"]["estimated_minutes"] == 30
        assert data["week"]["total_study_minutes"] == 25
        assert data["week"]["total_sessions"] == 1

    def test_multiple_completions_same_day(self, app, mock_db):
        now = datetime.now(timezone.utc)
        today_start = _utc_midnight(now)
        c1 = _make_completion(actual_minutes=25, estimated_minutes=30, created_at=today_start + timedelta(hours=9))
        c2 = _make_completion(actual_minutes=15, estimated_minutes=20, created_at=today_start + timedelta(hours=11))
        c3 = _make_completion(actual_minutes=30, estimated_minutes=30, created_at=today_start + timedelta(hours=14))
        course = _make_course()
        streak = _make_streak()

        mock_db.execute.side_effect = [
            _mock_rows([
                (c1, today_start.date(), COURSE_ID),
                (c2, today_start.date(), COURSE_ID),
                (c3, today_start.date(), COURSE_ID),
            ]),
            _mock_scalars([course]),
            _mock_scalar_one(streak),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_id] = lambda: USER_ID

        client = TestClient(app)
        response = client.get("/api/v1/analytics/progress")

        app.dependency_overrides.clear()

        assert response.status_code == 200
        data = response.json()
        assert data["today"]["study_minutes"] == 70  # 25 + 15 + 30
        assert data["today"]["sessions_completed"] == 3
        assert data["today"]["estimated_minutes"] == 80  # 30 + 20 + 30

    def test_multiple_subjects(self, app, mock_db):
        now = datetime.now(timezone.utc)
        today_start = _utc_midnight(now)
        course1 = _make_course(course_id=COURSE_ID, name="Math", color="#ff0000")
        course2_id = uuid.uuid4()
        course2 = _make_course(course_id=course2_id, name="Physics", color="#00ff00")
        c1 = _make_completion(actual_minutes=30, created_at=today_start + timedelta(hours=9), course_id=COURSE_ID)
        c2 = _make_completion(actual_minutes=20, created_at=today_start + timedelta(hours=11), course_id=course2_id)
        streak = _make_streak()

        mock_db.execute.side_effect = [
            _mock_rows([
                (c1, today_start.date(), COURSE_ID),
                (c2, today_start.date(), course2_id),
            ]),
            _mock_scalars([course1, course2]),
            _mock_scalar_one(streak),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_id] = lambda: USER_ID

        client = TestClient(app)
        response = client.get("/api/v1/analytics/progress")

        app.dependency_overrides.clear()

        assert response.status_code == 200
        data = response.json()
        assert len(data["subjects"]) == 2
        subjects = sorted(data["subjects"], key=lambda s: s["study_minutes"], reverse=True)
        assert subjects[0]["course_name"] == "Math"
        assert subjects[0]["study_minutes"] == 30
        assert subjects[1]["course_name"] == "Physics"
        assert subjects[1]["study_minutes"] == 20

    def test_today_calculation(self, app, mock_db):
        now = datetime.now(timezone.utc)
        today_start = _utc_midnight(now)
        # Completion at 10:30 today
        c_today = _make_completion(actual_minutes=20, created_at=today_start + timedelta(hours=10, minutes=30))
        course = _make_course()
        streak = _make_streak()

        mock_db.execute.side_effect = [
            _mock_rows([(c_today, today_start.date(), COURSE_ID)]),
            _mock_scalars([course]),
            _mock_scalar_one(streak),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_id] = lambda: USER_ID

        client = TestClient(app)
        response = client.get("/api/v1/analytics/progress")

        app.dependency_overrides.clear()

        data = response.json()
        assert data["today"]["study_minutes"] == 20
        assert data["today"]["sessions_completed"] == 1

    def test_previous_day_excluded_from_today(self, app, mock_db):
        now = datetime.now(timezone.utc)
        today_start = _utc_midnight(now)
        yesterday = today_start - timedelta(days=1)
        c_yesterday = _make_completion(actual_minutes=45, created_at=yesterday + timedelta(hours=14))
        course = _make_course()
        streak = _make_streak()

        mock_db.execute.side_effect = [
            _mock_rows([(c_yesterday, yesterday.date(), COURSE_ID)]),
            _mock_scalars([course]),
            _mock_scalar_one(streak),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_id] = lambda: USER_ID

        client = TestClient(app)
        response = client.get("/api/v1/analytics/progress")

        app.dependency_overrides.clear()

        data = response.json()
        assert data["today"]["study_minutes"] == 0
        assert data["today"]["sessions_completed"] == 0
        # Yesterday should still appear in week if within Mon-Sun window
        # and in subject totals (30-day scope)

    def test_week_aggregation(self, app, mock_db):
        now = datetime.now(timezone.utc)
        week_start = _utc_midnight(now) - timedelta(days=_utc_midnight(now).weekday())
        # Two days of data this week
        c1 = _make_completion(actual_minutes=30, created_at=week_start + timedelta(days=1, hours=10))
        c2 = _make_completion(actual_minutes=20, created_at=week_start + timedelta(days=3, hours=14))
        course = _make_course()
        streak = _make_streak()

        mock_db.execute.side_effect = [
            _mock_rows([
                (c1, (week_start + timedelta(days=1)).date(), COURSE_ID),
                (c2, (week_start + timedelta(days=3)).date(), COURSE_ID),
            ]),
            _mock_scalars([course]),
            _mock_scalar_one(streak),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_id] = lambda: USER_ID

        client = TestClient(app)
        response = client.get("/api/v1/analytics/progress")

        app.dependency_overrides.clear()

        data = response.json()
        assert data["week"]["total_study_minutes"] == 50
        assert data["week"]["total_sessions"] == 2
        assert len(data["week"]["daily"]) == 7
        # Find the days with data
        days_with_data = [d for d in data["week"]["daily"] if d["study_minutes"] > 0]
        assert len(days_with_data) == 2

    def test_30_day_subject_aggregation(self, app, mock_db):
        now = datetime.now(timezone.utc)
        today_start = _utc_midnight(now)
        thirty_days_ago = now - timedelta(days=30)
        # Data from 20 days ago
        c_old = _make_completion(actual_minutes=60, created_at=thirty_days_ago + timedelta(days=10, hours=10))
        # Data from today
        c_new = _make_completion(actual_minutes=30, created_at=today_start + timedelta(hours=10))
        course = _make_course()
        streak = _make_streak()

        mock_db.execute.side_effect = [
            _mock_rows([
                (c_old, (thirty_days_ago + timedelta(days=10)).date(), COURSE_ID),
                (c_new, today_start.date(), COURSE_ID),
            ]),
            _mock_scalars([course]),
            _mock_scalar_one(streak),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_id] = lambda: USER_ID

        client = TestClient(app)
        response = client.get("/api/v1/analytics/progress")

        app.dependency_overrides.clear()

        data = response.json()
        # Subject total should be 90 (60 + 30) across 30-day window
        assert len(data["subjects"]) == 1
        assert data["subjects"][0]["study_minutes"] == 90
        assert data["subjects"][0]["sessions_completed"] == 2

    def test_week_boundary_monday(self, app, mock_db):
        now = datetime.now(timezone.utc)
        today_start = _utc_midnight(now)
        # Find this week's Monday
        monday = today_start - timedelta(days=today_start.weekday())
        # Sunday before this Monday (last week)
        sunday = monday - timedelta(days=1)
        c_sunday = _make_completion(actual_minutes=40, created_at=sunday + timedelta(hours=14))
        c_monday = _make_completion(actual_minutes=25, created_at=monday + timedelta(hours=10))
        course = _make_course()
        streak = _make_streak()

        mock_db.execute.side_effect = [
            _mock_rows([
                (c_sunday, sunday.date(), COURSE_ID),
                (c_monday, monday.date(), COURSE_ID),
            ]),
            _mock_scalars([course]),
            _mock_scalar_one(streak),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_id] = lambda: USER_ID

        client = TestClient(app)
        response = client.get("/api/v1/analytics/progress")

        app.dependency_overrides.clear()

        data = response.json()
        # Sunday is last week, Monday is this week
        assert data["week"]["total_study_minutes"] == 25
        assert data["week"]["total_sessions"] == 1
        # Monday should have data in the daily breakdown
        monday_data = next(d for d in data["week"]["daily"] if d["date"] == monday.strftime("%Y-%m-%d"))
        assert monday_data["study_minutes"] == 25

    def test_midnight_boundary(self, app, mock_db):
        now = datetime.now(timezone.utc)
        today_start = _utc_midnight(now)
        # Completion at 23:59 yesterday (should NOT be today)
        yesterday_end = today_start - timedelta(seconds=1)
        c_yesterday = _make_completion(actual_minutes=15, created_at=yesterday_end)
        # Completion at 00:00 today (should BE today)
        c_today = _make_completion(actual_minutes=10, created_at=today_start)
        course = _make_course()
        streak = _make_streak()

        mock_db.execute.side_effect = [
            _mock_rows([
                (c_yesterday, (today_start - timedelta(days=1)).date(), COURSE_ID),
                (c_today, today_start.date(), COURSE_ID),
            ]),
            _mock_scalars([course]),
            _mock_scalar_one(streak),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_id] = lambda: USER_ID

        client = TestClient(app)
        response = client.get("/api/v1/analytics/progress")

        app.dependency_overrides.clear()

        data = response.json()
        # Only the 00:00 completion counts as today
        assert data["today"]["study_minutes"] == 10
        assert data["today"]["sessions_completed"] == 1

    def test_completed_session_still_counted(self, app, mock_db):
        """A completed session is counted even though the backlog item
        is no longer in the active plan's prioritized_backlog."""
        now = datetime.now(timezone.utc)
        today_start = _utc_midnight(now)
        completion = _make_completion(actual_minutes=25, created_at=today_start + timedelta(hours=10))
        course = _make_course()
        streak = _make_streak()

        mock_db.execute.side_effect = [
            _mock_rows([(completion, today_start.date(), COURSE_ID)]),
            _mock_scalars([course]),
            _mock_scalar_one(streak),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_id] = lambda: USER_ID

        client = TestClient(app)
        response = client.get("/api/v1/analytics/progress")

        app.dependency_overrides.clear()

        data = response.json()
        # The SessionCompletion record persists because the backlog item
        # was marked completed (status='completed'), not deleted.
        # ON DELETE CASCADE only fires on actual row deletion.
        assert data["today"]["study_minutes"] == 25
        assert data["today"]["sessions_completed"] == 1

    def test_no_subject_activity(self, app, mock_db):
        """User has completions but courses are empty (e.g. course was deleted)."""
        now = datetime.now(timezone.utc)
        today_start = _utc_midnight(now)
        unknown_course_id = uuid.uuid4()
        completion = _make_completion(actual_minutes=20, created_at=today_start + timedelta(hours=10), course_id=unknown_course_id)
        streak = _make_streak()

        mock_db.execute.side_effect = [
            _mock_rows([(completion, today_start.date(), unknown_course_id)]),
            _mock_scalars([]),  # no courses found
            _mock_scalar_one(streak),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_id] = lambda: USER_ID

        client = TestClient(app)
        response = client.get("/api/v1/analytics/progress")

        app.dependency_overrides.clear()

        data = response.json()
        assert len(data["subjects"]) == 1
        assert data["subjects"][0]["course_name"] == "Unknown"
        assert data["subjects"][0]["study_minutes"] == 20

    def test_all_activity_one_subject(self, app, mock_db):
        now = datetime.now(timezone.utc)
        today_start = _utc_midnight(now)
        week_start = today_start - timedelta(days=today_start.weekday())
        completions = [
            _make_completion(actual_minutes=30, created_at=week_start + timedelta(days=i, hours=10))
            for i in range(5)
        ]
        course = _make_course()
        streak = _make_streak(current=5, best=10, total_days=20)

        mock_db.execute.side_effect = [
            _mock_rows([(c, (week_start + timedelta(days=i)).date(), COURSE_ID) for i, c in enumerate(completions)]),
            _mock_scalars([course]),
            _mock_scalar_one(streak),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_id] = lambda: USER_ID

        client = TestClient(app)
        response = client.get("/api/v1/analytics/progress")

        app.dependency_overrides.clear()

        data = response.json()
        assert len(data["subjects"]) == 1
        assert data["subjects"][0]["study_minutes"] == 150  # 5 * 30
        assert data["subjects"][0]["sessions_completed"] == 5
        assert data["week"]["total_study_minutes"] == 150
        assert data["streaks"]["current"] == 5
        assert data["streaks"]["best"] == 10
        assert data["streaks"]["total_study_days"] == 20

    def test_streak_milestones(self, app, mock_db):
        mock_db.execute.side_effect = [
            _mock_rows([]),
            _mock_scalars([]),
            _mock_scalar_one(_make_streak(current=15, best=30, total_days=45)),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_id] = lambda: USER_ID

        client = TestClient(app)
        response = client.get("/api/v1/analytics/progress")

        app.dependency_overrides.clear()

        data = response.json()
        milestones = data["streaks"]["milestones"]
        assert len(milestones) == 6
        # 3, 7, 14 are achieved (current=15)
        achieved = [m for m in milestones if m["achieved"]]
        not_achieved = [m for m in milestones if not m["achieved"]]
        assert len(achieved) == 3  # 3, 7, 14
        assert len(not_achieved) == 3  # 30, 100, 365

    def test_response_schema(self, app, mock_db):
        mock_db.execute.side_effect = [
            _mock_rows([]),
            _mock_scalars([]),
            _mock_scalar_one(None),
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_id] = lambda: USER_ID

        client = TestClient(app)
        response = client.get("/api/v1/analytics/progress")

        app.dependency_overrides.clear()

        assert response.status_code == 200
        data = response.json()
        assert "today" in data
        assert "week" in data
        assert "subjects" in data
        assert "streaks" in data
        assert "daily" in data["week"]
        assert isinstance(data["week"]["daily"], list)
        assert len(data["week"]["daily"]) == 7
        assert "milestones" in data["streaks"]
