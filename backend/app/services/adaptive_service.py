"""Adaptive planning service.

Handles plan snapshot lifecycle, session completion recording,
plan diff generation, and human-readable change explanations.
"""
from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    ActiveFocusSession,
    ActivityType,
    BacklogItem,
    PlanSnapshot,
    SessionCompletion,
    User,
)
from app.domain.schemas import (
    AdaptivePlanResponse,
    FocusSessionLifecycleRequest,
    FocusSessionLifecycleResponse,
    GeneratedPlan,
    PlanChange,
    PlanSession,
)
from app.planning_pipeline.stage import SESSION_TRANSITION_MINUTES
from app.core.timezone import now_in_user_tz, today_in_user_tz
from app.services.activity_service import ActivityService
from app.services.deterministic_planner import generate_deterministic_plan

_SESSION_ID_RE = re.compile(
    r"^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):s(\d+)$",
    re.IGNORECASE,
)
FOCUS_SESSION_LEASE_SECONDS = 90


class FocusSessionConflict(Exception):
    """The requested Focus lifecycle transition is stale or conflicts."""


def parse_session_id(session_id: str) -> tuple[str, int] | None:
    """Parse a stable session_id into (backlog_item_id_str, session_number).

    Returns None if the format is invalid.
    """
    m = _SESSION_ID_RE.match(session_id)
    if m is None:
        return None
    return m.group(1), int(m.group(2))


# ─── Snapshot CRUD ───


async def get_active_snapshot(
    db: AsyncSession, user_id: uuid.UUID, plan_date: date
) -> PlanSnapshot | None:
    """Return the active plan snapshot for a user+date, or None."""
    result = await db.execute(
        select(PlanSnapshot)
        .where(
            PlanSnapshot.user_id == user_id,
            PlanSnapshot.plan_date == plan_date,
            PlanSnapshot.active.is_(True),
        )
        .order_by(PlanSnapshot.version.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _lock_user(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Serialize snapshot lifecycle changes for one user."""
    await db.execute(
        select(User.id).where(User.id == user_id).with_for_update()
    )


async def create_snapshot(
    db: AsyncSession,
    user_id: uuid.UUID,
    plan_date: date,
    plan: dict,
    source: str = "deterministic",
) -> PlanSnapshot:
    """Create a snapshot with the next version for this user and date."""
    await _lock_user(db, user_id)
    result = await db.execute(
        select(func.max(PlanSnapshot.version)).where(
            PlanSnapshot.user_id == user_id,
            PlanSnapshot.plan_date == plan_date,
        )
    )
    latest_version = result.scalar_one() or 0
    snapshot = PlanSnapshot(
        user_id=user_id,
        plan_date=plan_date,
        version=latest_version + 1,
        sessions=plan.get("sessions", []),
        daily_message=plan.get("daily_message", ""),
        overflow=plan.get("overflow", []),
        source=source,
        active=True,
    )
    db.add(snapshot)
    await db.flush()
    await db.refresh(snapshot)
    return snapshot


async def supersede_snapshot(db: AsyncSession, snapshot_id: uuid.UUID) -> None:
    """Mark a snapshot as superseded (active=false)."""
    await db.execute(
        update(PlanSnapshot)
        .where(PlanSnapshot.id == snapshot_id)
        .values(active=False)
    )


async def supersede_current_day_snapshot(
    db: AsyncSession, user_id: uuid.UUID
) -> None:
    """Supersede only the user's active plan for their current local day."""
    await _lock_user(db, user_id)
    snapshot = await get_active_snapshot(db, user_id, today_in_user_tz())
    if snapshot is not None:
        await supersede_snapshot(db, snapshot.id)


async def get_or_create_active_snapshot(
    db: AsyncSession,
    user_id: uuid.UUID,
    plan_date: date,
    planning_data: dict,
    daily_capacity_minutes: int | None = None,
) -> PlanSnapshot:
    """Return the active snapshot, creating one if none exists.

    This is used by the dashboard endpoint.

    A stored snapshot is regenerated when it has become stale, or when its
    empty session list can now be replaced by a non-empty candidate for the
    user's current local day. Empty candidates are not persisted, avoiding a
    new snapshot version on every request when nothing is schedulable.
    """
    await _lock_user(db, user_id)
    existing = await get_active_snapshot(db, user_id, plan_date)
    if existing is not None:
        pending_backlog = planning_data.get("prioritized_backlog") or []
        existing_sessions = existing.sessions or []
        if pending_backlog and not existing_sessions:
            if plan_date == today_in_user_tz():
                candidate = generate_deterministic_plan(
                    planning_data,
                    daily_capacity_minutes=daily_capacity_minutes,
                    target_date=plan_date,
                )
                if candidate.get("sessions"):
                    await supersede_snapshot(db, existing.id)
                    return await create_snapshot(
                        db,
                        user_id,
                        plan_date,
                        candidate,
                    )
            return existing

        invalidation_now = now_in_user_tz()
        completed_session_ids: set[str] = set()
        available_windows = planning_data.get("available_windows") or []
        stale_snapshot = _is_stale_snapshot(
            existing, plan_date, now=invalidation_now
        )
        availability_violation = _has_upcoming_availability_violation(
            existing, plan_date, available_windows, now=invalidation_now
        )
        current_scheduled_session = _has_current_scheduled_session(
            existing, plan_date, invalidation_now
        )
        current_completions = None
        if stale_snapshot or availability_violation or current_scheduled_session:
            current_completions = await get_completions_for_snapshot(
                db, existing.id
            )
            completed_session_ids = {
                row["session_id"]
                for row in current_completions
                if row.get("status") == "completed" and row.get("session_id")
            }
        stale_snapshot = _is_stale_snapshot(
            existing,
            plan_date,
            completed_session_ids=completed_session_ids,
            now=invalidation_now,
        )
        availability_violation = _has_upcoming_availability_violation(
            existing,
            plan_date,
            available_windows,
            completed_session_ids=completed_session_ids,
            now=invalidation_now,
        )
        transition_violation = _has_upcoming_transition_violation(
            existing, plan_date, completed_session_ids, invalidation_now
        )
        needs_refresh = stale_snapshot or transition_violation or availability_violation
        if (pending_backlog and needs_refresh) or availability_violation:
            if await _has_valid_focus_lease(db, user_id, existing):
                return existing
            plan = generate_deterministic_plan(
                planning_data,
                daily_capacity_minutes=daily_capacity_minutes,
                target_date=plan_date,
            )
            if transition_violation and not availability_violation and not plan.get("sessions"):
                # Keep the current plan if refreshing it cannot produce any
                # sessions; repeated dashboard requests must not churn.
                return existing
            candidate_sessions = list(plan.get("sessions") or [])
            if availability_violation or candidate_sessions:
                if current_completions is None:
                    completed_sessions = await _completed_sessions_for_snapshot(
                        db, existing
                    )
                else:
                    completed_sessions = [
                        session
                        for session in existing_sessions
                        if session.get("session_id") in completed_session_ids
                    ]
                plan["sessions"] = completed_sessions + candidate_sessions
            await supersede_snapshot(db, existing.id)
            return await create_snapshot(
                db,
                user_id,
                plan_date,
                plan,
            )
        return existing

    plan = generate_deterministic_plan(
        planning_data, daily_capacity_minutes=daily_capacity_minutes, target_date=plan_date
    )
    return await create_snapshot(db, user_id, plan_date, plan)


def _is_stale_snapshot(
    snapshot: PlanSnapshot,
    plan_date: date,
    completed_session_ids: set[str] | None = None,
    now: datetime | None = None,
) -> bool:
    """True when a stored snapshot can no longer drive the Today screen.

    All of the following must hold:

    * ``plan_date`` is the user's *current* local day — historical or
      future-dated snapshots are never regenerated.
    * The snapshot has at least one session.  An empty-session snapshot is
      not considered stale: there is nothing to move forward in time, and
      regenerating it would mint a new version on every dashboard request.
    * Every session has already ended strictly before the current local
      time-of-day (mixed past+future snapshots are reused as-is).
    """
    if plan_date != today_in_user_tz():
        return False

    sessions = snapshot.sessions or []
    if not sessions:
        return False

    completed_session_ids = completed_session_ids or set()
    if any(not isinstance(session, dict) for session in sessions):
        # Preserve malformed snapshots conservatively; availability validation
        # will invalidate them when they cannot be proven safe.
        return False
    unfinished_sessions = [
        session
        for session in sessions
        if session.get("session_id") not in completed_session_ids
    ]
    if not unfinished_sessions:
        return False

    end_times = [s.get("end_time") for s in unfinished_sessions]
    if not all(end_times):
        # Malformed session (missing end_time): be conservative and reuse.
        return False

    now = now or now_in_user_tz()
    now_minutes = now.hour * 60 + now.minute
    return all(_time_to_minutes(t) < now_minutes for t in end_times)


def _has_upcoming_availability_violation(
    snapshot: PlanSnapshot,
    plan_date: date,
    available_windows: list[dict],
    completed_session_ids: set[str] | None = None,
    now: datetime | None = None,
) -> bool:
    """Return whether an unfinished future session is outside all current windows."""
    if plan_date != today_in_user_tz():
        return False

    sessions = snapshot.sessions or []
    if not sessions:
        return False

    now = now or now_in_user_tz()
    now_minutes = now.hour * 60 + now.minute
    completed_session_ids = completed_session_ids or set()
    parsed_windows: list[tuple[int, int]] = []
    for window in available_windows:
        try:
            start = _time_to_minutes(window["start"])
            end = _time_to_minutes(window["end"])
        except (KeyError, AttributeError, TypeError, ValueError):
            continue
        if end > start:
            parsed_windows.append((start, end))

    for session in sessions:
        if not isinstance(session, dict):
            return True
        if session.get("session_id") in completed_session_ids:
            continue
        try:
            end = _time_to_minutes(session["end_time"])
        except (KeyError, AttributeError, TypeError, ValueError):
            # An unparseable session cannot be proven to have ended or fit.
            return True
        if end <= now_minutes:
            continue
        try:
            start = _time_to_minutes(session["start_time"])
        except (KeyError, AttributeError, TypeError, ValueError):
            return True
        if end <= start or not any(
            window_start <= start and end <= window_end
            for window_start, window_end in parsed_windows
        ):
            return True
    return False


def _has_upcoming_transition_violation(
    snapshot: PlanSnapshot,
    plan_date: date,
    completed_session_ids: set[str] | None = None,
    now: datetime | None = None,
) -> bool:
    """Return whether an upcoming pair violates the current transition rule.

    Completed and past sessions are excluded; only future sessions are checked.
    Focus state is checked separately from persisted lifecycle leases.
    """
    if plan_date != today_in_user_tz():
        return False

    sessions = snapshot.sessions or []
    if not sessions:
        return False

    now = now or now_in_user_tz()
    now_minutes = now.hour * 60 + now.minute
    completed_session_ids = completed_session_ids or set()
    upcoming: list[tuple[int, int]] = []
    for session in sessions:
        if not isinstance(session, dict):
            return False
        if session.get("session_id") in completed_session_ids:
            continue
        start_time = session.get("start_time")
        end_time = session.get("end_time")
        if not start_time or not end_time:
            # Be conservative with malformed snapshots.
            return False
        try:
            start = _time_to_minutes(start_time)
            end = _time_to_minutes(end_time)
        except (AttributeError, TypeError, ValueError):
            return False
        if end <= start:
            return False
        if end > now_minutes:
            upcoming.append((start, end))

    upcoming.sort()
    return any(
        next_start - previous_end < SESSION_TRANSITION_MINUTES
        for (_, previous_end), (next_start, _) in zip(upcoming, upcoming[1:])
    )


def _has_current_scheduled_session(
    snapshot: PlanSnapshot, plan_date: date, now: datetime | None = None
) -> bool:
    if plan_date != today_in_user_tz():
        return False
    now = now or now_in_user_tz()
    now_minutes = now.hour * 60 + now.minute
    for session in (snapshot.sessions or []):
        if not isinstance(session, dict):
            continue
        start_time = session.get("start_time")
        end_time = session.get("end_time")
        if not start_time or not end_time:
            continue
        try:
            start = _time_to_minutes(start_time)
            end = _time_to_minutes(end_time)
        except (AttributeError, TypeError, ValueError):
            continue
        if start <= now_minutes < end:
            return True
    return False


def _lease_now() -> datetime:
    return datetime.now(timezone.utc)


async def _get_focus_lease(
    db: AsyncSession, user_id: uuid.UUID, *, lock: bool = False
) -> ActiveFocusSession | None:
    query = select(ActiveFocusSession).where(
        ActiveFocusSession.user_id == user_id
    )
    if lock:
        query = query.with_for_update()
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def _focus_lease_is_current_and_incomplete(
    db: AsyncSession, user_id: uuid.UUID, lease: ActiveFocusSession
) -> bool:
    """Check whether a running lease still refers to a usable session today."""
    snapshot = await get_active_snapshot(db, user_id, today_in_user_tz())
    if snapshot is None or snapshot.id != lease.plan_snapshot_id or not any(
        session.get("session_id") == lease.session_id
        for session in (snapshot.sessions or [])
    ):
        return False

    completion_result = await db.execute(
        select(SessionCompletion.id)
        .where(
            SessionCompletion.plan_snapshot_id == snapshot.id,
            SessionCompletion.session_id == lease.session_id,
            SessionCompletion.status == "completed",
        )
        .limit(1)
    )
    return completion_result.scalar_one_or_none() is None


async def _has_valid_focus_lease(
    db: AsyncSession, user_id: uuid.UUID, snapshot: PlanSnapshot
) -> bool:
    lease = await _get_focus_lease(db, user_id)
    if (
        lease is None
        or lease.user_id != user_id
        or lease.state != "running"
        or lease.plan_snapshot_id != snapshot.id
        or lease.lease_expires_at <= _lease_now()
    ):
        return False
    return any(
        session.get("session_id") == lease.session_id
        for session in (snapshot.sessions or [])
    )


async def run_focus_session_lifecycle(
    db: AsyncSession,
    user_id: uuid.UUID,
    request: FocusSessionLifecycleRequest,
) -> FocusSessionLifecycleResponse:
    """Apply an authenticated, fenced Focus lifecycle transition."""
    if parse_session_id(request.session_id) is None:
        raise ValueError("Invalid session_id format")

    await _lock_user(db, user_id)
    now = _lease_now()
    result = await db.execute(
        select(PlanSnapshot).where(
            PlanSnapshot.id == request.snapshot_id,
            PlanSnapshot.user_id == user_id,
            PlanSnapshot.plan_date == today_in_user_tz(),
            PlanSnapshot.active.is_(True),
        )
    )
    snapshot = result.scalar_one_or_none()
    if snapshot is None:
        raise ValueError("Plan snapshot is no longer active")
    if not any(
        session.get("session_id") == request.session_id
        for session in (snapshot.sessions or [])
    ):
        raise ValueError("Session is not in the active plan")

    lease = await _get_focus_lease(db, user_id, lock=True)
    if request.action in {"start", "resume"}:
        completion_result = await db.execute(
            select(SessionCompletion.id).where(
                SessionCompletion.plan_snapshot_id == snapshot.id,
                SessionCompletion.session_id == request.session_id,
                SessionCompletion.status == "completed",
            ).limit(1)
        )
        if completion_result.scalar_one_or_none() is not None:
            raise ValueError("Session is already completed")

    if request.action == "start":
        same_lease = (
            lease is not None
            and lease.generation == request.generation
            and lease.session_id == request.session_id
            and lease.plan_snapshot_id == snapshot.id
        )
        if same_lease:
            if lease.state == "running" and lease.lease_expires_at > now:
                # A retry of the same start is idempotent and must not extend
                # the lease; only a foreground heartbeat may renew it.
                return FocusSessionLifecycleResponse(
                    session_id=lease.session_id,
                    snapshot_id=lease.plan_snapshot_id,
                    generation=lease.generation,
                    state=lease.state,
                    lease_expires_at=lease.lease_expires_at,
                )
            raise FocusSessionConflict("Focus session lease is no longer current")
        if (
            lease is not None
            and lease.state == "running"
            and lease.lease_expires_at > now
            and (
                lease.generation != request.generation
                or lease.session_id != request.session_id
                or lease.plan_snapshot_id != snapshot.id
            )
        ):
            if await _focus_lease_is_current_and_incomplete(db, user_id, lease):
                raise FocusSessionConflict("Another Focus session is active")
            # Snapshot invalidation, session removal, or completion makes the
            # old lease unusable. Retire it under the existing user/lease locks
            # before reusing the user's unique lease row for this start.
            lease.state = "cancelled"
            lease.lease_expires_at = now
            await db.flush()
        if lease is None:
            lease = ActiveFocusSession(
                user_id=user_id,
                plan_snapshot_id=snapshot.id,
                session_id=request.session_id,
                generation=request.generation,
                state="running",
                lease_expires_at=now + timedelta(seconds=FOCUS_SESSION_LEASE_SECONDS),
            )
            db.add(lease)
        else:
            if (
                lease.generation == request.generation
                and lease.state in {"cancelled", "completed"}
            ):
                raise FocusSessionConflict("Focus session has already ended")
            lease.plan_snapshot_id = snapshot.id
            lease.session_id = request.session_id
            lease.generation = request.generation
            lease.state = "running"
            lease.lease_expires_at = now + timedelta(
                seconds=FOCUS_SESSION_LEASE_SECONDS
            )
    else:
        if (
            lease is None
            or lease.plan_snapshot_id != snapshot.id
            or lease.session_id != request.session_id
            or lease.generation != request.generation
        ):
            raise FocusSessionConflict("Focus session lease is no longer current")

        if request.action == "heartbeat":
            if lease.state != "running" or lease.lease_expires_at <= now:
                raise FocusSessionConflict("Focus session lease has expired")
            lease.lease_expires_at = now + timedelta(
                seconds=FOCUS_SESSION_LEASE_SECONDS
            )
        elif request.action == "pause":
            if lease.state not in {"cancelled", "completed"}:
                lease.state = "paused"
                lease.lease_expires_at = now
        elif request.action == "resume":
            if lease.state in {"cancelled", "completed"}:
                raise FocusSessionConflict("Focus session has already ended")
            lease.state = "running"
            lease.lease_expires_at = now + timedelta(
                seconds=FOCUS_SESSION_LEASE_SECONDS
            )
        elif request.action == "cancel":
            lease.state = "cancelled"
            lease.lease_expires_at = now

    await db.flush()
    return FocusSessionLifecycleResponse(
        session_id=lease.session_id,
        snapshot_id=lease.plan_snapshot_id,
        generation=lease.generation,
        state=lease.state,
        lease_expires_at=lease.lease_expires_at,
    )


async def _completed_sessions_for_snapshot(
    db: AsyncSession, snapshot: PlanSnapshot
) -> list[dict]:
    """Keep completed sessions visible when refreshing a legacy plan."""
    completion_rows = await get_completions_for_snapshot(db, snapshot.id)
    completed_ids = {
        completion["session_id"]
        for completion in completion_rows
        if completion.get("status") == "completed"
    }
    return [
        session
        for session in (snapshot.sessions or [])
        if session.get("session_id") in completed_ids
    ]


# ─── Completion ───


async def record_completion(
    db: AsyncSession,
    snapshot: PlanSnapshot,
    session_id: str,
    actual_minutes: int,
    backlog_item_id: uuid.UUID,
    session_number: int,
    estimated_minutes: int,
) -> SessionCompletion:
    """Record a session completion event."""
    completion = SessionCompletion(
        plan_snapshot_id=snapshot.id,
        session_id=session_id,
        backlog_item_id=backlog_item_id,
        session_number=session_number,
        estimated_minutes=estimated_minutes,
        actual_minutes=actual_minutes,
        status="completed",
    )
    db.add(completion)
    await db.flush()
    await db.refresh(completion)
    return completion


async def get_completions_for_snapshot(
    db: AsyncSession, snapshot_id: uuid.UUID
) -> list[dict]:
    """Return all completions for a snapshot as dicts for the rescheduler."""
    result = await db.execute(
        select(SessionCompletion).where(SessionCompletion.plan_snapshot_id == snapshot_id)
    )
    rows = result.scalars().all()
    return [
        {
            "session_id": row.session_id,
            "backlog_item_id": str(row.backlog_item_id),
            "session_number": row.session_number,
            "status": row.status,
            "completed_minutes": row.actual_minutes,
        }
        for row in rows
    ]


async def _already_completed_response(
    db: AsyncSession,
    user_id: uuid.UUID,
    active_snapshot: PlanSnapshot,
    session_id: str,
) -> AdaptivePlanResponse | None:
    result = await db.execute(
        select(SessionCompletion.id)
        .join(PlanSnapshot, SessionCompletion.plan_snapshot_id == PlanSnapshot.id)
        .where(
            PlanSnapshot.user_id == user_id,
            SessionCompletion.session_id == session_id,
            SessionCompletion.status == "completed",
        )
        .limit(1)
    )
    if result.scalar_one_or_none() is None:
        return None
    sessions = [PlanSession(**session) for session in (active_snapshot.sessions or [])]
    return AdaptivePlanResponse(
        plan=GeneratedPlan(
            sessions=sessions,
            daily_message=active_snapshot.daily_message,
            overflow=[uuid.UUID(value) for value in (active_snapshot.overflow or [])],
        ),
        changes=[],
        snapshot_id=active_snapshot.id,
        previous_sessions=[],
    )


# ─── Adaptive flow ───


async def run_adaptive_completion(
    db: AsyncSession,
    user_id: uuid.UUID,
    plan_date: date,
    session_id: str,
    actual_minutes: int,
    planning_data: dict,
    daily_capacity_minutes: int | None = None,
    focus_generation: str | None = None,
) -> AdaptivePlanResponse:
    """Execute the full adaptive completion transaction.

    1. Validate session_id and active snapshot
    2. Mark backlog item completed
    3. Record SessionCompletion
    4. Run AdaptiveRescheduler
    5. Create new active snapshot
    6. Compute diff
    7. Return AdaptivePlanResponse
    """
    # 1. Parse and validate session_id
    parsed = parse_session_id(session_id)
    if parsed is None:
        raise ValueError(f"Invalid session_id format: {session_id}")
    backlog_item_id_str, session_number = parsed
    backlog_item_id = uuid.UUID(backlog_item_id_str)

    # 2. Serialize snapshot lifecycle changes before loading the active plan.
    await _lock_user(db, user_id)
    snapshot = await get_active_snapshot(db, user_id, plan_date)
    if snapshot is None:
        raise ValueError("No active plan for today")

    # 3. Validate session exists in snapshot
    v1_sessions = snapshot.sessions or []
    session_found = False
    estimated_minutes = 0
    for s in v1_sessions:
        if s.get("session_id") == session_id:
            session_found = True
            # Compute estimated_minutes from start/end times
            est = _time_to_minutes(s["end_time"]) - _time_to_minutes(s["start_time"])
            estimated_minutes = max(1, est)
            break
    if not session_found:
        duplicate_response = await _already_completed_response(
            db, user_id, snapshot, session_id
        )
        if duplicate_response is not None:
            return duplicate_response
        raise ValueError(f"Session {session_id} not found in active plan")

    lease = await _get_focus_lease(db, user_id, lock=True)
    if (
        lease is not None
        and lease.plan_snapshot_id == snapshot.id
        and lease.state == "running"
        and lease.lease_expires_at > _lease_now()
        and lease.session_id != session_id
    ):
        raise FocusSessionConflict("Another Focus session is active")
    if lease is not None and (
        lease.plan_snapshot_id == snapshot.id and lease.session_id == session_id
    ):
        if lease.state in {"cancelled", "completed"}:
            raise FocusSessionConflict("Focus session has already ended")
        if focus_generation != lease.generation:
            raise FocusSessionConflict("Focus session ownership changed")
    elif focus_generation is not None:
        raise FocusSessionConflict("Focus session lease is no longer current")

    # 4. Mark backlog item completed
    result = await db.execute(
        select(BacklogItem).where(
            BacklogItem.id == backlog_item_id,
            BacklogItem.user_id == user_id,
        )
    )
    backlog_item = result.scalar_one_or_none()
    if backlog_item is None:
        raise ValueError("Backlog item not found")

    old_status = backlog_item.status
    backlog_item.status = "completed"
    await db.flush()

    # Record activity and update streaks on fresh completion
    if old_status != "completed":
        act = ActivityService(db)
        await act.record(
            user_id,
            ActivityType.TASK_COMPLETED,
            {"item_id": str(backlog_item.id), "title": backlog_item.title},
        )

        # Update momentum + subject streaks
        from app.services.streak_service import StreakService
        streak_svc = StreakService(db)
        await streak_svc.update_streaks(user_id, [backlog_item.course_id])

    # 5. Record SessionCompletion
    await record_completion(
        db, snapshot, session_id, actual_minutes,
        backlog_item_id, session_number, estimated_minutes,
    )
    if lease is not None and (
        lease.plan_snapshot_id == snapshot.id and lease.session_id == session_id
    ):
        lease.state = "completed"
        lease.lease_expires_at = _lease_now()
        await db.flush()

    # 6. Build completions list for rescheduler
    all_completions = await get_completions_for_snapshot(db, snapshot.id)

    # 7. Run adaptive rescheduler
    new_plan = generate_deterministic_plan(
        planning_data,
        daily_capacity_minutes=daily_capacity_minutes,
        target_date=plan_date,
        previous_plan={"sessions": v1_sessions, "daily_message": snapshot.daily_message, "overflow": snapshot.overflow},
        completions=all_completions,
    )

    # 8. Supersede old snapshot, create new one
    await supersede_snapshot(db, snapshot.id)
    new_snapshot = await create_snapshot(
        db, user_id, plan_date, new_plan, source="deterministic"
    )

    # 9. Build item title map for diff
    item_titles = {backlog_item_id_str: backlog_item.title}

    # 10. Compute diff
    changes = compute_plan_diff(
        v1_sessions, list(new_plan.get("sessions", [])),
        list(snapshot.overflow or []), list(new_plan.get("overflow", [])),
        item_titles,
    )

    # 11. Build response
    plan_sessions = [PlanSession(**s) for s in new_plan.get("sessions", [])]
    previous_sessions = [PlanSession(**s) for s in v1_sessions]
    return AdaptivePlanResponse(
        plan=GeneratedPlan(
            sessions=plan_sessions,
            daily_message=new_plan.get("daily_message", ""),
            overflow=[uuid.UUID(oid) for oid in new_plan.get("overflow", [])],
        ),
        changes=changes,
        snapshot_id=new_snapshot.id,
        previous_sessions=previous_sessions,
    )


# ─── Diff generation ───


def compute_plan_diff(
    v1_sessions: list[dict],
    v2_sessions: list[dict],
    v1_overflow: list[str],
    v2_overflow: list[str],
    item_titles: dict[str, str],
) -> list[PlanChange]:
    """Compute the diff between v1 and v2 plan sessions.

    Returns only disruption changes (moved, overflowed, removed).
    Newly scheduled sessions from overflow are not shown as disruptions.
    """
    v1_map: dict[str, dict] = {s["session_id"]: s for s in v1_sessions if s.get("session_id")}
    v2_map: dict[str, dict] = {s["session_id"]: s for s in v2_sessions if s.get("session_id")}

    changes: list[PlanChange] = []

    # Sessions in v1 but not in v2
    for sid, v1_session in v1_map.items():
        if sid not in v2_map:
            backlog_id = v1_session["backlog_item_id"]
            in_overflow = backlog_id in v2_overflow
            title = item_titles.get(backlog_id, _title_from_reason(v1_session.get("reason", "")))
            changes.append(PlanChange(
                session_id=sid,
                backlog_item_id=backlog_id,
                title=title,
                change_type="moved_to_overflow" if in_overflow else "removed",
                previous_start=v1_session["start_time"],
                previous_end=v1_session["end_time"],
                new_start=None,
                new_end=None,
                reason="",
            ))

    # Sessions in both v1 and v2 but with different times
    for sid, v1_session in v1_map.items():
        if sid in v2_map:
            v2_session = v2_map[sid]
            if (v1_session["start_time"] != v2_session["start_time"] or
                    v1_session["end_time"] != v2_session["end_time"]):
                backlog_id = v1_session["backlog_item_id"]
                title = item_titles.get(backlog_id, _title_from_reason(v1_session.get("reason", "")))
                changes.append(PlanChange(
                    session_id=sid,
                    backlog_item_id=backlog_id,
                    title=title,
                    change_type="rescheduled",
                    previous_start=v1_session["start_time"],
                    previous_end=v1_session["end_time"],
                    new_start=v2_session["start_time"],
                    new_end=v2_session["end_time"],
                    reason="",
                ))

    # Build explanations
    _attach_reasons(changes, v1_sessions, v2_sessions, v1_overflow, v2_overflow)

    return changes


def _title_from_reason(reason: str) -> str:
    """Extract task title from reason string like 'Work on Physics'."""
    if reason.startswith("Work on "):
        return reason[len("Work on "):]
    return reason


def _time_to_minutes(t: str) -> int:
    """Convert 'HH:MM' to minutes since midnight."""
    parts = t.split(":")
    return int(parts[0]) * 60 + int(parts[1])


def _attach_reasons(
    changes: list[PlanChange],
    v1_sessions: list[dict],
    v2_sessions: list[dict],
    v1_overflow: list[str],
    v2_overflow: list[str],
) -> None:
    """Attach human-readable reasons to each change."""
    v1_map = {s["session_id"]: s for s in v1_sessions if s.get("session_id")}
    v2_map = {s["session_id"]: s for s in v2_sessions if s.get("session_id")}

    # Find sessions that were completed/removed (in changes but not in v2)
    completed_session_ids = {
        c.session_id for c in changes
        if c.change_type in ("moved_to_overflow", "removed")
    }

    # Find displaced tasks (in v1 but not in v2, excluding completed ones)
    displaced = [
        v1_map[sid]
        for sid in v1_map
        if sid not in v2_map and sid not in completed_session_ids
    ]

    for change in changes:
        if change.change_type in ("moved_to_overflow", "removed"):
            if displaced:
                task_names = [_title_from_reason(d.get("reason", "")) for d in displaced]
                if len(task_names) == 1:
                    move_text = f"{task_names[0]} was moved to the next available day"
                else:
                    move_text = f"{', '.join(task_names[:-1])} and {task_names[-1]} were moved to the next available day"
                change.reason = (
                    f"{change.title} took longer than expected. "
                    f"We protected your higher-priority work and {move_text.lower()}."
                )
            else:
                change.reason = f"{change.title} was completed and removed from the schedule."

        elif change.change_type == "rescheduled":
            change.reason = f"{change.title} was rescheduled to a later time."


# ─── Session ID helpers ───


def build_session_id(backlog_item_id: str, session_number: int) -> str:
    """Build a stable session_id."""
    return f"{backlog_item_id}:s{session_number}"
