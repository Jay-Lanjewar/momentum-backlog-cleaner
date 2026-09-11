"""Tests for streak update integration in complete-session flow."""
import uuid
from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.domain.models import BacklogItem, PlanSnapshot, User
from app.services.adaptive_service import run_adaptive_completion


USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
TODAY = date(2026, 9, 11)


def _mock_scalar(value):
    m = MagicMock()
    m.scalar_one_or_none = MagicMock(return_value=value)
    return m


def _mock_scalars(values):
    scalars = MagicMock()
    scalars.all = MagicMock(return_value=values)
    m = MagicMock()
    m.scalars = MagicMock(return_value=scalars)
    return m


def _make_backlog_item(course_id, status="pending"):
    return BacklogItem(
        id=uuid.uuid4(), user_id=USER_ID, course_id=course_id,
        title="Task", priority=3, estimated_minutes=30, status=status,
    )


def _make_snapshot(sessions):
    return PlanSnapshot(
        id=uuid.uuid4(), user_id=USER_ID, plan_date=TODAY,
        version=1, sessions=sessions, daily_message="", overflow=[],
        source="deterministic", active=True,
    )


MOCK_STREAK_RESULT = {
    "momentum": {
        "current_streak": 1, "longest_streak": 1,
        "total_study_days": 1, "last_completed_date": datetime.now(timezone.utc),
        "recovery_tokens_current": 0, "recovery_tokens_earned": 0,
        "recovery_tokens_used": 0, "streak_protected_today": False,
    },
    "subjects": [],
}


def _make_mock_db(snapshot, backlog_item):
    """Build a mock db for the full run_adaptive_completion flow.

    db.add is synchronous in real SQLAlchemy (called without await in
    create_snapshot/record_completion), so we use MagicMock for it.
    db.flush and db.refresh are async.
    """
    mock_db = AsyncMock()

    def _add_sync(obj):
        pass

    async def _flush():
        pass

    async def _refresh(obj):
        if hasattr(obj, "id") and obj.id is None:
            obj.id = uuid.uuid4()

    mock_db.add = MagicMock(side_effect=_add_sync)
    mock_db.flush = AsyncMock(side_effect=_flush)
    mock_db.refresh = AsyncMock(side_effect=_refresh)

    mock_db.execute.side_effect = [
        _mock_scalar(snapshot),        # 1. get_active_snapshot
        _mock_scalar(backlog_item),    # 2. load BacklogItem
        _mock_scalars([]),             # 3. get_completions_for_snapshot
        MagicMock(),                   # 4. supersede_snapshot (UPDATE)
    ]

    return mock_db


class TestStreakUpdateOnCompletion:
    """Verify that completing a session triggers streak updates."""

    @pytest.mark.asyncio
    async def test_completion_updates_streak(self):
        """Successful completion of a pending item calls update_streaks."""
        course_id = uuid.uuid4()
        backlog_item = _make_backlog_item(course_id, status="pending")
        item_id_str = str(backlog_item.id)
        session_id = f"{item_id_str}:s1"

        snapshot = _make_snapshot([
            {"session_id": session_id, "backlog_item_id": item_id_str,
             "start_time": "16:00", "end_time": "16:30", "reason": "Work on Task",
             "remaining_minutes": 0},
        ])

        mock_db = _make_mock_db(snapshot, backlog_item)

        with patch("app.services.streak_service.StreakService") as MockStreakService:
            mock_svc = AsyncMock()
            mock_svc.update_streaks.return_value = MOCK_STREAK_RESULT
            MockStreakService.return_value = mock_svc

            await run_adaptive_completion(
                db=mock_db,
                user_id=USER_ID,
                plan_date=TODAY,
                session_id=session_id,
                actual_minutes=30,
                planning_data={
                    "available_windows": [],
                    "prioritized_backlog": [],
                },
            )

            mock_svc.update_streaks.assert_awaited_once_with(USER_ID, [course_id])

    @pytest.mark.asyncio
    async def test_already_completed_item_skips_streak_update(self):
        """Completing an already-completed item does NOT double-count streaks."""
        course_id = uuid.uuid4()
        backlog_item = _make_backlog_item(course_id, status="completed")
        item_id_str = str(backlog_item.id)
        session_id = f"{item_id_str}:s1"

        snapshot = _make_snapshot([
            {"session_id": session_id, "backlog_item_id": item_id_str,
             "start_time": "16:00", "end_time": "16:30", "reason": "Work on Task",
             "remaining_minutes": 0},
        ])

        mock_db = _make_mock_db(snapshot, backlog_item)

        with patch("app.services.streak_service.StreakService") as MockStreakService:
            mock_svc = AsyncMock()
            MockStreakService.return_value = mock_svc

            await run_adaptive_completion(
                db=mock_db,
                user_id=USER_ID,
                plan_date=TODAY,
                session_id=session_id,
                actual_minutes=30,
                planning_data={
                    "available_windows": [],
                    "prioritized_backlog": [],
                },
            )

            mock_svc.update_streaks.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_no_active_plan_does_not_update_streak(self):
        """No active plan raises ValueError and does NOT trigger streak update."""
        mock_db = AsyncMock()
        mock_db.execute.side_effect = [
            _mock_scalar(None),  # 1. get_active_snapshot → no plan
        ]

        with patch("app.services.streak_service.StreakService") as MockStreakService:
            mock_svc = AsyncMock()
            MockStreakService.return_value = mock_svc

            with pytest.raises(ValueError, match="No active plan for today"):
                await run_adaptive_completion(
                    db=mock_db,
                    user_id=USER_ID,
                    plan_date=TODAY,
                    session_id=f"{uuid.uuid4()}:s1",
                    actual_minutes=30,
                    planning_data={
                        "available_windows": [],
                        "prioritized_backlog": [],
                    },
                )

            mock_svc.update_streaks.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_streak_update_receives_correct_course_id(self):
        """The course_id from the completed backlog item is passed to update_streaks."""
        course_id = uuid.uuid4()
        backlog_item = _make_backlog_item(course_id, status="pending")
        item_id_str = str(backlog_item.id)
        session_id = f"{item_id_str}:s1"

        snapshot = _make_snapshot([
            {"session_id": session_id, "backlog_item_id": item_id_str,
             "start_time": "16:00", "end_time": "16:30", "reason": "Work on Task",
             "remaining_minutes": 0},
        ])

        mock_db = _make_mock_db(snapshot, backlog_item)

        with patch("app.services.streak_service.StreakService") as MockStreakService:
            mock_svc = AsyncMock()
            mock_svc.update_streaks.return_value = MOCK_STREAK_RESULT
            MockStreakService.return_value = mock_svc

            await run_adaptive_completion(
                db=mock_db,
                user_id=USER_ID,
                plan_date=TODAY,
                session_id=session_id,
                actual_minutes=30,
                planning_data={
                    "available_windows": [],
                    "prioritized_backlog": [],
                },
            )

            call_args = mock_svc.update_streaks.call_args
            assert call_args[0][0] == USER_ID
            assert call_args[0][1] == [course_id]
