import uuid
from datetime import date
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


def _snapshot_reuse_harness(monkeypatch, candidate_sessions):
    day = date(2026, 10, 17)
    existing = _snapshot_for_plan([])
    state = {"superseded": [], "created": [], "generated": []}

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

    monkeypatch.setattr(adaptive_service, "today_in_user_tz", lambda: day)
    monkeypatch.setattr(adaptive_service, "_lock_user", fake_lock_user)
    monkeypatch.setattr(adaptive_service, "get_active_snapshot", get_active)
    monkeypatch.setattr(adaptive_service, "supersede_snapshot", supersede)
    monkeypatch.setattr(adaptive_service, "create_snapshot", create)
    monkeypatch.setattr(adaptive_service, "generate_deterministic_plan", generate)

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
