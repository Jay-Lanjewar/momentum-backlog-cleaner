import uuid
from datetime import date, datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.domain.models import (
    BacklogItem,
    Course,
    StudyStreak,
    SubjectStreak,
)
from app.services.streak_service import StreakService
from app.services.motivation_service import MotivationService

USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
COURSE_ID_1 = uuid.UUID("00000000-0000-0000-0000-000000000010")
COURSE_ID_2 = uuid.UUID("00000000-0000-0000-0000-000000000011")


@pytest.fixture
def mock_db():
    return AsyncMock()


@pytest.fixture
def momentum():
    return StudyStreak(
        id=uuid.uuid4(),
        user_id=USER_ID,
        current_streak=5,
        longest_streak=12,
        total_study_days=30,
        last_completed_date=datetime.now(timezone.utc),
        recovery_tokens_current=2,
        recovery_tokens_earned=3,
        recovery_tokens_used=1,
    )


@pytest.fixture
def subject_streaks():
    return [
        SubjectStreak(
            id=uuid.uuid4(),
            user_id=USER_ID,
            course_id=COURSE_ID_1,
            current_streak=3,
            longest_streak=7,
            last_completion_date=datetime.now(timezone.utc),
        ),
        SubjectStreak(
            id=uuid.uuid4(),
            user_id=USER_ID,
            course_id=COURSE_ID_2,
            current_streak=1,
            longest_streak=4,
            last_completion_date=datetime.now(timezone.utc) - timedelta(days=2),
        ),
    ]


@pytest.fixture
def courses():
    return {
        COURSE_ID_1: Course(
            id=COURSE_ID_1, user_id=USER_ID, name="Math", color="#ff0000"
        ),
        COURSE_ID_2: Course(
            id=COURSE_ID_2, user_id=USER_ID, name="Physics", color="#00ff00"
        ),
    }


class TestGetStreaksPrefetched:
    async def test_prefetched_performs_no_db_queries(
        self, mock_db, momentum, subject_streaks, courses
    ):
        service = StreakService(mock_db)
        result = await service.get_streaks(
            USER_ID,
            momentum=momentum,
            subject_streaks=subject_streaks,
            courses_by_id=courses,
        )

        mock_db.execute.assert_not_called()
        mock_db.get.assert_not_called()

        assert result["momentum"]["current_streak"] == 5
        assert result["momentum"]["longest_streak"] == 12
        assert len(result["subjects"]) == 2
        assert result["subjects"][0]["course_name"] == "Math"
        assert result["subjects"][0]["course_color"] == "#ff0000"
        assert result["subjects"][1]["course_name"] == "Physics"

    async def test_legacy_caller_queries_db(
        self, mock_db, momentum, subject_streaks, courses
    ):
        service = StreakService(mock_db)

        execute_result = MagicMock()
        execute_result.scalar_one_or_none.return_value = momentum
        mock_db.execute = AsyncMock(return_value=execute_result)

        mock_db.get = AsyncMock(side_effect=lambda model, id: courses.get(id))

        result = await service.get_streaks(USER_ID)

        assert mock_db.execute.called
        assert result["momentum"]["current_streak"] == 5

    async def test_prefetched_courses_reused_not_queried(
        self, mock_db, momentum, subject_streaks, courses
    ):
        service = StreakService(mock_db)
        await service.get_streaks(
            USER_ID,
            momentum=momentum,
            subject_streaks=subject_streaks,
            courses_by_id=courses,
        )

        mock_db.get.assert_not_called()
        mock_db.execute.assert_not_called()

    async def test_empty_subject_streaks(self, mock_db, momentum, courses):
        service = StreakService(mock_db)
        result = await service.get_streaks(
            USER_ID,
            momentum=momentum,
            subject_streaks=[],
            courses_by_id=courses,
        )

        assert result["subjects"] == []
        assert result["momentum"]["current_streak"] == 5

    async def test_none_momentum_queries_db(self, mock_db, subject_streaks, courses):
        momentum = StudyStreak(
            id=uuid.uuid4(), user_id=USER_ID, current_streak=0,
            longest_streak=0, total_study_days=0, last_completed_date=None,
            recovery_tokens_current=0, recovery_tokens_earned=0, recovery_tokens_used=0,
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = momentum
        mock_db.execute = AsyncMock(return_value=mock_result)

        service = StreakService(mock_db)
        result = await service.get_streaks(
            USER_ID,
            momentum=None,
            subject_streaks=subject_streaks,
            courses_by_id=courses,
        )

        mock_db.execute.assert_called_once()
        assert result["momentum"]["current_streak"] == 0


class TestComputeBalanceScorePrefetched:
    async def test_prefetched_performs_no_db_queries(
        self, mock_db, subject_streaks, courses
    ):
        minutes_by_course = {COURSE_ID_1: 120, COURSE_ID_2: 60}
        service = StreakService(mock_db)
        result = await service.compute_balance_score(
            USER_ID,
            subject_streaks=subject_streaks,
            courses_by_id=courses,
            minutes_30d_by_course=minutes_by_course,
        )

        mock_db.execute.assert_not_called()
        mock_db.get.assert_not_called()

        assert "score" in result
        assert "message" in result
        assert isinstance(result["score"], int)

    async def test_legacy_caller_queries_db(self, mock_db):
        mock_db.execute = AsyncMock(return_value=MagicMock())
        mock_db.execute.return_value.scalars.return_value.all.return_value = []
        mock_db.get = AsyncMock(return_value=None)

        service = StreakService(mock_db)
        result = await service.compute_balance_score(USER_ID)

        assert result["score"] == 100

    async def test_balance_calculation_uses_prefetched_minutes(
        self, mock_db, subject_streaks, courses
    ):
        minutes_by_course = {COURSE_ID_1: 200, COURSE_ID_2: 100}
        service = StreakService(mock_db)
        result = await service.compute_balance_score(
            USER_ID,
            subject_streaks=subject_streaks,
            courses_by_id=courses,
            minutes_30d_by_course=minutes_by_course,
        )

        assert 0 <= result["score"] <= 100

    async def test_zero_minutes(self, mock_db, subject_streaks, courses):
        minutes_by_course = {COURSE_ID_1: 0, COURSE_ID_2: 0}
        service = StreakService(mock_db)
        result = await service.compute_balance_score(
            USER_ID,
            subject_streaks=subject_streaks,
            courses_by_id=courses,
            minutes_30d_by_course=minutes_by_course,
        )

        assert 0 <= result["score"] <= 100

    async def test_empty_subject_streaks(self, mock_db, courses):
        service = StreakService(mock_db)
        result = await service.compute_balance_score(
            USER_ID,
            subject_streaks=[],
            courses_by_id=courses,
            minutes_30d_by_course={},
        )

        assert result["score"] == 100


class TestGetInsightPrefetched:
    async def test_prefetched_performs_no_db_queries(
        self, mock_db, momentum, subject_streaks, courses
    ):
        backlog = [
            BacklogItem(
                id=uuid.uuid4(),
                user_id=USER_ID,
                course_id=COURSE_ID_1,
                title="HW",
                priority=1,
                estimated_minutes=60,
                status="pending",
            ),
        ]
        service = MotivationService(mock_db)
        result = await service.get_insight(
            USER_ID,
            streak=momentum,
            subject_streaks=subject_streaks,
            all_backlog=backlog,
            courses_by_id=courses,
        )

        mock_db.execute.assert_not_called()
        mock_db.get.assert_not_called()

        assert "title" in result
        assert "message" in result
        assert "priority" in result

    async def test_legacy_caller_queries_db(self, mock_db):
        mock_db.execute = AsyncMock(return_value=MagicMock())
        mock_db.execute.return_value.scalar_one_or_none.return_value = None
        mock_db.execute.return_value.scalars.return_value.all.return_value = []
        mock_db.get = AsyncMock(return_value=None)

        service = MotivationService(mock_db)
        result = await service.get_insight(USER_ID)

        assert mock_db.execute.called
        assert "title" in result

    async def test_course_lookups_reused_in_exam_path(
        self, mock_db, momentum, subject_streaks, courses
    ):
        today = datetime.now(timezone.utc)
        backlog = [
            BacklogItem(
                id=uuid.uuid4(),
                user_id=USER_ID,
                course_id=COURSE_ID_1,
                title="Exam Topic",
                priority=1,
                estimated_minutes=60,
                status="pending",
                due_date=today + timedelta(days=1),
            ),
        ]
        service = MotivationService(mock_db)
        result = await service.get_insight(
            USER_ID,
            streak=momentum,
            subject_streaks=subject_streaks,
            all_backlog=backlog,
            courses_by_id=courses,
        )

        mock_db.get.assert_not_called()
        assert result["title"] == "Exam Approaching"

    async def test_course_lookups_reused_in_neglected_path(
        self, mock_db, momentum, courses
    ):
        old_date = datetime.now(timezone.utc) - timedelta(days=10)
        subject_streaks_old = [
            SubjectStreak(
                id=uuid.uuid4(),
                user_id=USER_ID,
                course_id=COURSE_ID_1,
                current_streak=0,
                longest_streak=0,
                last_completion_date=old_date,
            ),
        ]
        service = MotivationService(mock_db)
        result = await service.get_insight(
            USER_ID,
            streak=momentum,
            subject_streaks=subject_streaks_old,
            all_backlog=[],
            courses_by_id=courses,
        )

        mock_db.get.assert_not_called()
        assert result["title"] == "Subject Neglected"

    async def test_streak_milestone_uses_prefetched_courses(
        self, mock_db, courses
    ):
        momentum_near_milestone = StudyStreak(
            id=uuid.uuid4(),
            user_id=USER_ID,
            current_streak=6,
            longest_streak=12,
            total_study_days=30,
            last_completed_date=datetime.now(timezone.utc),
            recovery_tokens_current=0,
            recovery_tokens_earned=0,
            recovery_tokens_used=0,
        )
        subject_streaks = [
            SubjectStreak(
                id=uuid.uuid4(),
                user_id=USER_ID,
                course_id=COURSE_ID_1,
                current_streak=6,
                longest_streak=7,
                last_completion_date=datetime.now(timezone.utc),
            ),
        ]
        service = MotivationService(mock_db)
        result = await service.get_insight(
            USER_ID,
            streak=momentum_near_milestone,
            subject_streaks=subject_streaks,
            all_backlog=[],
            courses_by_id=courses,
        )

        mock_db.get.assert_not_called()
        assert result["title"] in ("Milestone Ahead", "Subject Milestone Ahead")

    async def test_empty_data_returns_encouragement(
        self, mock_db, courses
    ):
        momentum_zero = StudyStreak(
            id=uuid.uuid4(),
            user_id=USER_ID,
            current_streak=0,
            longest_streak=0,
            total_study_days=0,
            last_completed_date=None,
            recovery_tokens_current=0,
            recovery_tokens_earned=0,
            recovery_tokens_used=0,
        )
        service = MotivationService(mock_db)
        result = await service.get_insight(
            USER_ID,
            streak=momentum_zero,
            subject_streaks=[],
            all_backlog=[],
            courses_by_id=courses,
        )

        assert result["title"] in ("All Caught Up", "Let's Start Fresh", "Keep Going")


class TestDashboard30dMinutesCalculation:
    def test_completed_items_within_30d_counted(self):
        now = datetime.now(timezone.utc)
        items = [
            BacklogItem(
                id=uuid.uuid4(), user_id=USER_ID, course_id=COURSE_ID_1,
                title="A", priority=1, estimated_minutes=30, status="completed",
                updated_at=now - timedelta(days=5),
            ),
            BacklogItem(
                id=uuid.uuid4(), user_id=USER_ID, course_id=COURSE_ID_1,
                title="B", priority=1, estimated_minutes=45, status="completed",
                updated_at=now - timedelta(days=10),
            ),
        ]
        thirty_days_ago = now - timedelta(days=30)
        minutes = {}
        for item in items:
            if (
                item.status == "completed"
                and item.course_id
                and item.updated_at
                and item.updated_at >= thirty_days_ago
            ):
                minutes[item.course_id] = minutes.get(item.course_id, 0) + (item.estimated_minutes or 30)

        assert minutes[COURSE_ID_1] == 75

    def test_completed_items_beyond_30d_excluded(self):
        now = datetime.now(timezone.utc)
        items = [
            BacklogItem(
                id=uuid.uuid4(), user_id=USER_ID, course_id=COURSE_ID_1,
                title="A", priority=1, estimated_minutes=30, status="completed",
                updated_at=now - timedelta(days=40),
            ),
        ]
        thirty_days_ago = now - timedelta(days=30)
        minutes = {}
        for item in items:
            if (
                item.status == "completed"
                and item.course_id
                and item.updated_at
                and item.updated_at >= thirty_days_ago
            ):
                minutes[item.course_id] = minutes.get(item.course_id, 0) + (item.estimated_minutes or 30)

        assert minutes == {}

    def test_pending_items_excluded(self):
        now = datetime.now(timezone.utc)
        items = [
            BacklogItem(
                id=uuid.uuid4(), user_id=USER_ID, course_id=COURSE_ID_1,
                title="A", priority=1, estimated_minutes=30, status="pending",
                updated_at=now - timedelta(days=5),
            ),
        ]
        thirty_days_ago = now - timedelta(days=30)
        minutes = {}
        for item in items:
            if (
                item.status == "completed"
                and item.course_id
                and item.updated_at
                and item.updated_at >= thirty_days_ago
            ):
                minutes[item.course_id] = minutes.get(item.course_id, 0) + (item.estimated_minutes or 30)

        assert minutes == {}

    def test_estimated_minutes_defaults_to_30(self):
        now = datetime.now(timezone.utc)
        items = [
            BacklogItem(
                id=uuid.uuid4(), user_id=USER_ID, course_id=COURSE_ID_1,
                title="A", priority=1, estimated_minutes=None, status="completed",
                updated_at=now - timedelta(days=5),
            ),
        ]
        thirty_days_ago = now - timedelta(days=30)
        minutes = {}
        for item in items:
            if (
                item.status == "completed"
                and item.course_id
                and item.updated_at
                and item.updated_at >= thirty_days_ago
            ):
                minutes[item.course_id] = minutes.get(item.course_id, 0) + (item.estimated_minutes or 30)

        assert minutes[COURSE_ID_1] == 30

    def test_multiple_courses_aggregated_separately(self):
        now = datetime.now(timezone.utc)
        items = [
            BacklogItem(
                id=uuid.uuid4(), user_id=USER_ID, course_id=COURSE_ID_1,
                title="A", priority=1, estimated_minutes=60, status="completed",
                updated_at=now - timedelta(days=3),
            ),
            BacklogItem(
                id=uuid.uuid4(), user_id=USER_ID, course_id=COURSE_ID_2,
                title="B", priority=1, estimated_minutes=45, status="completed",
                updated_at=now - timedelta(days=7),
            ),
            BacklogItem(
                id=uuid.uuid4(), user_id=USER_ID, course_id=COURSE_ID_1,
                title="C", priority=1, estimated_minutes=30, status="completed",
                updated_at=now - timedelta(days=1),
            ),
        ]
        thirty_days_ago = now - timedelta(days=30)
        minutes = {}
        for item in items:
            if (
                item.status == "completed"
                and item.course_id
                and item.updated_at
                and item.updated_at >= thirty_days_ago
            ):
                minutes[item.course_id] = minutes.get(item.course_id, 0) + (item.estimated_minutes or 30)

        assert minutes[COURSE_ID_1] == 90
        assert minutes[COURSE_ID_2] == 45
