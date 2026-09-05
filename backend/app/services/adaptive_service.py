"""Adaptive planning service.

Handles plan snapshot lifecycle, session completion recording,
plan diff generation, and human-readable change explanations.
"""
from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    ActivityType,
    BacklogItem,
    PlanSnapshot,
    SessionCompletion,
)
from app.domain.schemas import (
    AdaptivePlanResponse,
    GeneratedPlan,
    PlanChange,
    PlanSession,
)
from app.services.activity_service import ActivityService
from app.services.deterministic_planner import generate_deterministic_plan

_SESSION_ID_RE = re.compile(
    r"^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):s(\d+)$",
    re.IGNORECASE,
)


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


async def create_snapshot(
    db: AsyncSession,
    user_id: uuid.UUID,
    plan_date: date,
    plan: dict,
    source: str = "deterministic",
    version: int = 1,
) -> PlanSnapshot:
    """Create a new active plan snapshot."""
    snapshot = PlanSnapshot(
        user_id=user_id,
        plan_date=plan_date,
        version=version,
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


async def get_or_create_active_snapshot(
    db: AsyncSession,
    user_id: uuid.UUID,
    plan_date: date,
    planning_data: dict,
    daily_capacity_minutes: int | None = None,
) -> PlanSnapshot:
    """Return the active snapshot, creating one if none exists.

    This is used by the dashboard endpoint.
    """
    existing = await get_active_snapshot(db, user_id, plan_date)
    if existing is not None:
        return existing

    plan = generate_deterministic_plan(
        planning_data, daily_capacity_minutes=daily_capacity_minutes, target_date=plan_date
    )
    return await create_snapshot(db, user_id, plan_date, plan)


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
            "backlog_item_id": str(row.backlog_item_id),
            "session_number": row.session_number,
            "status": row.status,
            "completed_minutes": row.actual_minutes,
        }
        for row in rows
    ]


# ─── Adaptive flow ───


async def run_adaptive_completion(
    db: AsyncSession,
    user_id: uuid.UUID,
    plan_date: date,
    session_id: str,
    actual_minutes: int,
    planning_data: dict,
    daily_capacity_minutes: int | None = None,
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

    # 2. Load active snapshot
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
        raise ValueError(f"Session {session_id} not found in active plan")

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

    # Record activity
    if old_status != "completed":
        act = ActivityService(db)
        await act.record(
            user_id,
            ActivityType.TASK_COMPLETED,
            {"item_id": str(backlog_item.id), "title": backlog_item.title},
        )

    # 5. Record SessionCompletion
    await record_completion(
        db, snapshot, session_id, actual_minutes,
        backlog_item_id, session_number, estimated_minutes,
    )

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
        db, user_id, plan_date, new_plan, source="deterministic", version=snapshot.version + 1
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
    return AdaptivePlanResponse(
        plan=GeneratedPlan(
            sessions=plan_sessions,
            daily_message=new_plan.get("daily_message", ""),
            overflow=[uuid.UUID(oid) for oid in new_plan.get("overflow", [])],
        ),
        changes=changes,
        snapshot_id=new_snapshot.id,
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
