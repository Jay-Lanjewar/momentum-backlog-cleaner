import uuid
from datetime import date
from types import SimpleNamespace

import pytest

from app.services import adaptive_service


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
