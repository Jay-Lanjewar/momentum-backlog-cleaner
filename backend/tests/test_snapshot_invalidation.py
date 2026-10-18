import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest

from app.services import adaptive_service


def _snapshot_for_plan(sessions):
    return SimpleNamespace(
        id=uuid.uuid4(),
        sessions=sessions,
        plan_date=date(2026, 10, 17),
        version=1,
        daily_message="existing",
        overflow=[],
        source="deterministic",
        active=True,
    )


def _snapshot_reuse_harness(
    monkeypatch, candidate_sessions, existing_sessions=None
):
    day = date(2026, 10, 17)
    existing = _snapshot_for_plan(existing_sessions or [])
    state = {
        "superseded": [],
        "created": [],
        "generated": [],
        "completions": [],
        "completion_lookups": [],
    }

    async def get_active(db, user_id, requested_date):
        assert requested_date == day
        return existing

    async def supersede(db, snapshot_id):
        state["superseded"].append(snapshot_id)

    async def create(db, user_id, requested_date, plan, source="deterministic"):
        state["created"].append(plan)
        return _snapshot_for_plan(plan.get("sessions", []))

    def generate(planning_data, **kwargs):
        state["generated"].append(kwargs)
        return {
            "sessions": candidate_sessions,
            "daily_message": "candidate",
            "overflow": [],
        }

    async def fake_lock_user(db, user_id):
        return None

    async def no_focus_lease(db, user_id, snapshot):
        return False

    async def get_completions(db, snapshot_id):
        state["completion_lookups"].append(snapshot_id)
        return state["completions"]

    monkeypatch.setattr(adaptive_service, "today_in_user_tz", lambda: day)
    monkeypatch.setattr(
        adaptive_service,
        "now_in_user_tz",
        lambda: datetime(2026, 10, 17, 15, 30, tzinfo=timezone.utc),
    )
    monkeypatch.setattr(adaptive_service, "_lock_user", fake_lock_user)
    monkeypatch.setattr(adaptive_service, "_has_valid_focus_lease", no_focus_lease)
    monkeypatch.setattr(adaptive_service, "get_active_snapshot", get_active)
    monkeypatch.setattr(adaptive_service, "supersede_snapshot", supersede)
    monkeypatch.setattr(adaptive_service, "create_snapshot", create)
    monkeypatch.setattr(adaptive_service, "generate_deterministic_plan", generate)
    monkeypatch.setattr(adaptive_service, "get_completions_for_snapshot", get_completions)

    return day, existing, state


@pytest.mark.asyncio
async def test_empty_active_snapshot_is_replaced_when_candidate_has_sessions(
    monkeypatch,
):
    candidate_sessions = [
        {
            "backlog_item_id": str(uuid.uuid4()),
            "session_id": "task:s1",
            "start_time": "20:30",
            "end_time": "21:00",
            "reason": "Work on task",
            "remaining_minutes": 0,
        }
    ]
    day, existing, state = _snapshot_reuse_harness(
        monkeypatch, candidate_sessions
    )

    result = await adaptive_service.get_or_create_active_snapshot(
        None,
        uuid.uuid4(),
        day,
        {"prioritized_backlog": [{"id": "task"}], "available_windows": []},
        daily_capacity_minutes=120,
    )

    assert result.sessions == candidate_sessions
    assert state["superseded"] == [existing.id]
    assert len(state["created"]) == 1
    assert state["created"][0]["sessions"] == candidate_sessions


@pytest.mark.asyncio
async def test_empty_active_snapshot_and_empty_candidate_do_not_churn_snapshots(
    monkeypatch,
):
    day, existing, state = _snapshot_reuse_harness(monkeypatch, [])
    planning_data = {
        "prioritized_backlog": [{"id": "task"}],
        "available_windows": [],
    }

    first = await adaptive_service.get_or_create_active_snapshot(
        None, uuid.uuid4(), day, planning_data
    )
    second = await adaptive_service.get_or_create_active_snapshot(
        None, uuid.uuid4(), day, planning_data
    )

    assert first is existing
    assert second is existing
    assert len(state["generated"]) == 2
    assert state["superseded"] == []
    assert state["created"] == []


@pytest.mark.asyncio
async def test_non_empty_active_snapshot_is_reused_without_generating_candidate(
    monkeypatch,
):
    day, existing, state = _snapshot_reuse_harness(monkeypatch, [])
    existing.sessions = [
        {
            "backlog_item_id": str(uuid.uuid4()),
            "session_id": "task:s1",
            "start_time": "20:30",
            "end_time": "21:00",
        }
    ]

    result = await adaptive_service.get_or_create_active_snapshot(
        None,
        uuid.uuid4(),
        day,
        {"prioritized_backlog": [{"id": "task"}], "available_windows": []},
    )

    assert result is existing
    assert state["generated"] == []
    assert state["superseded"] == []
    assert state["created"] == []


@pytest.mark.asyncio
async def test_legacy_back_to_back_plan_is_refreshed_and_completed_sessions_preserved(
    monkeypatch,
):
    completed = {
        "backlog_item_id": str(uuid.uuid4()),
        "session_id": "completed-task:s1",
        "start_time": "14:30",
        "end_time": "15:00",
        "reason": "Work on completed task",
        "remaining_minutes": 0,
    }
    old_upcoming = [
        {
            "backlog_item_id": str(uuid.uuid4()),
            "session_id": "english:s1",
            "start_time": "16:00",
            "end_time": "16:30",
            "reason": "Work on English",
            "remaining_minutes": 30,
        },
        {
            "backlog_item_id": str(uuid.uuid4()),
            "session_id": "english:s2",
            "start_time": "16:30",
            "end_time": "17:00",
            "reason": "Work on English",
            "remaining_minutes": 0,
        },
    ]
    candidate_sessions = [
        {
            "backlog_item_id": str(uuid.uuid4()),
            "session_id": "new-task:s1",
            "start_time": "16:00",
            "end_time": "16:30",
            "reason": "Work on new task",
            "remaining_minutes": 0,
        }
    ]
    day, existing, state = _snapshot_reuse_harness(
        monkeypatch, candidate_sessions, [completed, *old_upcoming]
    )
    state["completions"] = [
        {"session_id": completed["session_id"], "status": "completed"}
    ]

    result = await adaptive_service.get_or_create_active_snapshot(
        None,
        uuid.uuid4(),
        day,
        {"prioritized_backlog": [{"id": "task"}], "available_windows": []},
    )

    assert result.sessions == [completed, *candidate_sessions]
    assert state["superseded"] == [existing.id]
    assert state["created"][0]["sessions"] == [completed, *candidate_sessions]
    assert state["completion_lookups"] == [existing.id]
    assert len(state["generated"]) == 1


@pytest.mark.asyncio
async def test_valid_upcoming_transition_plan_is_reused(monkeypatch):
    sessions = [
        {
            "session_id": "task-a:s1",
            "start_time": "16:00",
            "end_time": "16:30",
        },
        {
            "session_id": "task-b:s1",
            "start_time": "16:35",
            "end_time": "17:05",
        },
    ]
    day, existing, state = _snapshot_reuse_harness(monkeypatch, [], sessions)

    result = await adaptive_service.get_or_create_active_snapshot(
        None,
        uuid.uuid4(),
        day,
        {"prioritized_backlog": [{"id": "task"}], "available_windows": []},
    )

    assert result is existing
    assert state["generated"] == []
    assert state["superseded"] == []
    assert state["created"] == []


@pytest.mark.asyncio
async def test_scheduled_time_interval_without_focus_lease_does_not_protect_plan(
    monkeypatch,
):
    sessions = [
        {
            "session_id": "active:s1",
            "start_time": "15:00",
            "end_time": "15:45",
        },
        {
            "session_id": "task-a:s1",
            "start_time": "16:00",
            "end_time": "16:30",
        },
        {
            "session_id": "task-b:s1",
            "start_time": "16:30",
            "end_time": "17:00",
        },
    ]
    candidate = [{
        "session_id": "replacement:s1",
        "backlog_item_id": str(uuid.uuid4()),
        "start_time": "16:00",
        "end_time": "16:30",
        "reason": "Replacement",
        "remaining_minutes": 0,
    }]
    day, existing, state = _snapshot_reuse_harness(monkeypatch, candidate, sessions)
    monkeypatch.setattr(
        adaptive_service,
        "now_in_user_tz",
        lambda: datetime(2026, 10, 17, 15, 30, tzinfo=timezone.utc),
    )

    result = await adaptive_service.get_or_create_active_snapshot(
        None,
        uuid.uuid4(),
        day,
        {"prioritized_backlog": [{"id": "task"}], "available_windows": []},
    )

    assert result is not existing
    assert result.sessions == candidate
    assert len(state["generated"]) == 1
    assert state["superseded"] == [existing.id]
    assert state["created"][0]["sessions"] == candidate


@pytest.mark.asyncio
async def test_valid_focus_lease_protects_invalid_plan(monkeypatch):
    sessions = [
        {"session_id": "active:s1", "start_time": "15:00", "end_time": "15:45"},
        {"session_id": "task-a:s1", "start_time": "16:00", "end_time": "16:30"},
        {"session_id": "task-b:s1", "start_time": "16:30", "end_time": "17:00"},
    ]
    day, existing, state = _snapshot_reuse_harness(
        monkeypatch,
        [{"session_id": "candidate:s1", "start_time": "17:00", "end_time": "17:30"}],
        sessions,
    )

    async def active_lease(db, user_id, snapshot):
        return True

    monkeypatch.setattr(adaptive_service, "_has_valid_focus_lease", active_lease)
    monkeypatch.setattr(
        adaptive_service,
        "now_in_user_tz",
        lambda: datetime(2026, 10, 17, 15, 30, tzinfo=timezone.utc),
    )

    result = await adaptive_service.get_or_create_active_snapshot(
        None,
        uuid.uuid4(),
        day,
        {"prioritized_backlog": [{"id": "task"}], "available_windows": []},
    )

    assert result is existing
    assert state["generated"] == []
    assert state["superseded"] == []
    assert state["created"] == []


@pytest.mark.asyncio
async def test_completed_current_schedule_does_not_trigger_false_transition_refresh(
    monkeypatch,
):
    completed = {
        "session_id": "completed:s1",
        "start_time": "15:00",
        "end_time": "15:45",
    }
    sessions = [
        completed,
        {"session_id": "task-a:s1", "start_time": "15:45", "end_time": "16:15"},
        {"session_id": "task-b:s1", "start_time": "16:20", "end_time": "16:50"},
    ]
    day, existing, state = _snapshot_reuse_harness(monkeypatch, [], sessions)
    state["completions"] = [
        {"session_id": completed["session_id"], "status": "completed"}
    ]

    result = await adaptive_service.get_or_create_active_snapshot(
        None,
        uuid.uuid4(),
        day,
        {"prioritized_backlog": [{"id": "task"}], "available_windows": []},
    )

    assert result is existing
    assert state["generated"] == []
    assert state["superseded"] == []
    assert state["created"] == []


@pytest.mark.asyncio
async def test_back_to_back_plan_does_not_churn_when_refresh_candidate_is_empty(
    monkeypatch,
):
    sessions = [
        {"session_id": "task-a:s1", "start_time": "16:00", "end_time": "16:30"},
        {"session_id": "task-b:s1", "start_time": "16:30", "end_time": "17:00"},
    ]
    day, existing, state = _snapshot_reuse_harness(monkeypatch, [], sessions)

    result = await adaptive_service.get_or_create_active_snapshot(
        None,
        uuid.uuid4(),
        day,
        {"prioritized_backlog": [{"id": "task"}], "available_windows": []},
    )
    second_result = await adaptive_service.get_or_create_active_snapshot(
        None,
        uuid.uuid4(),
        day,
        {"prioritized_backlog": [{"id": "task"}], "available_windows": []},
    )

    assert result is existing
    assert second_result is existing
    assert len(state["generated"]) == 2
    assert state["superseded"] == []
    assert state["created"] == []


@pytest.mark.asyncio
async def test_supersede_current_day_snapshot_uses_only_current_local_day(
    monkeypatch,
):
    user_id = uuid.uuid4()
    current_day = date(2026, 10, 9)
    snapshot = SimpleNamespace(id=uuid.uuid4())
    seen = {}

    async def get_active(db, requested_user_id, requested_date):
        seen["lookup"] = (requested_user_id, requested_date)
        return snapshot

    async def supersede(db, snapshot_id):
        seen["superseded"] = snapshot_id

    monkeypatch.setattr(adaptive_service, "today_in_user_tz", lambda: current_day)
    async def fake_lock_user(db, user_id):
        return None

    monkeypatch.setattr(adaptive_service, "_lock_user", fake_lock_user)
    monkeypatch.setattr(adaptive_service, "get_active_snapshot", get_active)
    monkeypatch.setattr(adaptive_service, "supersede_snapshot", supersede)

    await adaptive_service.supersede_current_day_snapshot("db", user_id)

    assert seen["lookup"] == (user_id, current_day)
    assert seen["superseded"] == snapshot.id


@pytest.mark.asyncio
async def test_supersede_current_day_snapshot_does_nothing_without_active_plan(
    monkeypatch,
):
    async def get_active(db, user_id, requested_date):
        return None

    async def fake_lock_user(db, user_id):
        return None

    monkeypatch.setattr(adaptive_service, "_lock_user", fake_lock_user)
    async def fail_if_called(db, snapshot_id):
        raise AssertionError("no snapshot should be superseded")

    monkeypatch.setattr(adaptive_service, "get_active_snapshot", get_active)
    monkeypatch.setattr(adaptive_service, "supersede_snapshot", fail_if_called)

    await adaptive_service.supersede_current_day_snapshot("db", uuid.uuid4())
