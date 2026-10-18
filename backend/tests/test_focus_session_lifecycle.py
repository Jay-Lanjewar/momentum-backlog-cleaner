import uuid
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.domain.schemas import FocusSessionLifecycleRequest
from app.services import adaptive_service


USER_ID = uuid.uuid4()
OTHER_USER_ID = uuid.uuid4()
SNAPSHOT_ID = uuid.uuid4()
SESSION_ID = f"{uuid.uuid4()}:s1"
TODAY = date(2026, 10, 18)
NOW = datetime(2026, 10, 18, 12, 0, tzinfo=timezone.utc)


def _scalar(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def _snapshot(user_id=USER_ID, snapshot_id=SNAPSHOT_ID):
    return SimpleNamespace(
        id=snapshot_id,
        user_id=user_id,
        plan_date=TODAY,
        active=True,
        sessions=[{"session_id": SESSION_ID}],
        daily_message="",
        overflow=[],
    )


def _lease(
    *,
    user_id=USER_ID,
    snapshot_id=SNAPSHOT_ID,
    session_id=SESSION_ID,
    generation="generation-0000001",
    state="running",
    expiry=NOW + timedelta(seconds=60),
):
    return SimpleNamespace(
        user_id=user_id,
        plan_snapshot_id=snapshot_id,
        session_id=session_id,
        generation=generation,
        state=state,
        lease_expires_at=expiry,
    )


@pytest.fixture(autouse=True)
def frozen_service_clock(monkeypatch):
    monkeypatch.setattr(adaptive_service, "_lease_now", lambda: NOW)
    monkeypatch.setattr(adaptive_service, "today_in_user_tz", lambda: TODAY)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "lease, snapshot, expected",
    [
        (_lease(), _snapshot(), True),
        (_lease(expiry=NOW - timedelta(seconds=1)), _snapshot(), False),
        (_lease(user_id=OTHER_USER_ID), _snapshot(), False),
        (_lease(snapshot_id=uuid.uuid4()), _snapshot(), False),
        (_lease(state="paused"), _snapshot(), False),
        (_lease(session_id=f"{uuid.uuid4()}:s1"), _snapshot(), False),
    ],
)
async def test_only_unexpired_running_lease_for_owner_and_snapshot_protects(
    lease, snapshot, expected
):
    db = AsyncMock()
    db.execute.return_value = _scalar(lease)

    result = await adaptive_service._has_valid_focus_lease(db, USER_ID, snapshot)

    assert result is expected


@pytest.mark.asyncio
async def test_start_creates_a_fenced_lease_and_retries_idempotently(monkeypatch):
    snapshot = _snapshot()
    db = AsyncMock()
    db.add = MagicMock()
    db.execute.side_effect = [
        MagicMock(),  # user lock
        _scalar(snapshot),
        _scalar(None),  # current user's lease
        _scalar(None),  # completed-session lookup
    ]
    request = FocusSessionLifecycleRequest(
        action="start",
        session_id=SESSION_ID,
        snapshot_id=SNAPSHOT_ID,
        generation="device-generation-0001",
    )

    response = await adaptive_service.run_focus_session_lifecycle(db, USER_ID, request)

    created = db.add.call_args.args[0]
    assert created.user_id == USER_ID
    assert created.plan_snapshot_id == SNAPSHOT_ID
    assert created.session_id == SESSION_ID
    assert created.generation == request.generation
    assert created.state == "running"
    assert created.lease_expires_at == NOW + timedelta(
        seconds=adaptive_service.FOCUS_SESSION_LEASE_SECONDS
    )
    assert response.state == "running"
    original_expiry = created.lease_expires_at

    db.execute.side_effect = [
        MagicMock(),  # user lock
        _scalar(snapshot),
        _scalar(created),
        _scalar(None),  # completed-session lookup
    ]
    monkeypatch.setattr(
        adaptive_service, "_lease_now", lambda: NOW + timedelta(seconds=20)
    )
    repeated = await adaptive_service.run_focus_session_lifecycle(
        db, USER_ID, request
    )
    assert repeated.generation == request.generation
    assert repeated.state == "running"
    assert repeated.lease_expires_at == original_expiry
    assert db.add.call_count == 1

    created.lease_expires_at = NOW - timedelta(seconds=1)
    db.execute.side_effect = [
        MagicMock(),  # user lock
        _scalar(snapshot),
        _scalar(created),
        _scalar(None),  # completed-session lookup
    ]
    with pytest.raises(adaptive_service.FocusSessionConflict, match="no longer current"):
        await adaptive_service.run_focus_session_lifecycle(db, USER_ID, request)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "action, initial_state, expected_state, expected_expiry",
    [
        ("pause", "running", "paused", NOW),
        ("resume", "paused", "running", NOW + timedelta(seconds=90)),
        ("cancel", "running", "cancelled", NOW),
    ],
)
async def test_pause_resume_and_cancel_are_idempotent_state_transitions(
    action, initial_state, expected_state, expected_expiry
):
    lease = _lease(state=initial_state)
    snapshot = _snapshot()
    db = AsyncMock()
    sequence = [MagicMock(), _scalar(snapshot), _scalar(lease)]
    if action == "resume":
        sequence.append(_scalar(None))  # completed-session lookup
    db.execute.side_effect = sequence
    request = FocusSessionLifecycleRequest(
        action=action,
        session_id=SESSION_ID,
        snapshot_id=SNAPSHOT_ID,
        generation=lease.generation,
    )

    response = await adaptive_service.run_focus_session_lifecycle(db, USER_ID, request)
    assert response.state == expected_state
    assert lease.state == expected_state
    assert lease.lease_expires_at == expected_expiry

    if action in {"pause", "cancel"}:
        # Repeating the same operation is harmless.
        db.execute.side_effect = [MagicMock(), _scalar(snapshot), _scalar(lease)]
        repeated = await adaptive_service.run_focus_session_lifecycle(
            db, USER_ID, request
        )
        assert repeated.state == expected_state


@pytest.mark.asyncio
async def test_expired_heartbeat_and_stale_generation_cannot_renew_lease():
    lease = _lease(generation="new-generation-0001")
    snapshot = _snapshot()
    db = AsyncMock()
    db.execute.side_effect = [MagicMock(), _scalar(snapshot), _scalar(lease)]
    request = FocusSessionLifecycleRequest(
        action="heartbeat",
        session_id=SESSION_ID,
        snapshot_id=SNAPSHOT_ID,
        generation="old-generation-0001",
    )

    with pytest.raises(adaptive_service.FocusSessionConflict, match="no longer current"):
        await adaptive_service.run_focus_session_lifecycle(db, USER_ID, request)

    lease.generation = request.generation
    lease.lease_expires_at = NOW - timedelta(seconds=1)
    db.execute.side_effect = [MagicMock(), _scalar(snapshot), _scalar(lease)]
    with pytest.raises(adaptive_service.FocusSessionConflict, match="expired"):
        await adaptive_service.run_focus_session_lifecycle(db, USER_ID, request)


@pytest.mark.asyncio
async def test_obsolete_snapshot_cannot_start_focus_session():
    db = AsyncMock()
    db.execute.side_effect = [MagicMock(), _scalar(None)]
    request = FocusSessionLifecycleRequest(
        action="start",
        session_id=SESSION_ID,
        snapshot_id=uuid.uuid4(),
        generation="device-generation-0001",
    )

    with pytest.raises(ValueError, match="no longer active"):
        await adaptive_service.run_focus_session_lifecycle(db, USER_ID, request)
