"""Authenticated, read-only Study Buddy tutoring endpoint."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import case, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_tutor.service import (
    CloudflareTutor,
    GeminiTutor,
    TutorProviderError,
    TutorRateLimited,
    TutorUnavailable,
    get_tutor,
)
from app.core.config import settings
from app.core.dependencies import get_current_user, get_db
from app.core.timezone import today_in_user_tz
from app.domain.models import (
    ActiveFocusSession, BacklogItem, Course, PlanSnapshot, StudyBuddyRateLimit, User,
)
from app.domain.schemas import StudyBuddyChatRequest, StudyBuddyChatResponse
from app.services.adaptive_service import parse_session_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/study-buddy", tags=["study-buddy"])


async def _resolve_context(db: AsyncSession, user_id: uuid.UUID, session_id: str):
    parsed = parse_session_id(session_id)
    if parsed is None:
        return None
    backlog_id = uuid.UUID(parsed[0])
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(ActiveFocusSession, PlanSnapshot, BacklogItem, Course)
        .join(PlanSnapshot, PlanSnapshot.id == ActiveFocusSession.plan_snapshot_id)
        .join(BacklogItem, BacklogItem.id == backlog_id)
        .join(Course, Course.id == BacklogItem.course_id)
        .where(
            ActiveFocusSession.user_id == user_id,
            ActiveFocusSession.session_id == session_id,
            ActiveFocusSession.state == "running",
            ActiveFocusSession.lease_expires_at > now,
            PlanSnapshot.user_id == user_id,
            PlanSnapshot.active.is_(True),
            PlanSnapshot.plan_date == today_in_user_tz(),
            BacklogItem.user_id == user_id,
            Course.user_id == user_id,
        )
    )
    row = result.one_or_none()
    if row is None:
        return None
    _lease, snapshot, task, course = row
    if not any(
        isinstance(item, dict) and item.get("session_id") == session_id
        for item in (snapshot.sessions or [])
    ):
        return None
    return task.title, course.name


async def _check_and_consume_rate_limit(
    db: AsyncSession, user_id: uuid.UUID
) -> tuple[bool, int]:
    """Atomically consume one fixed-window request slot across app workers."""
    now = datetime.now(timezone.utc)
    window = timedelta(seconds=settings.STUDY_BUDDY_RATE_LIMIT_WINDOW_SECONDS)
    cutoff = now - window
    table = StudyBuddyRateLimit.__table__
    expired = table.c.window_started_at <= cutoff
    statement = insert(table).values(
        user_id=user_id, window_started_at=now, request_count=1
    ).on_conflict_do_update(
        index_elements=[table.c.user_id],
        set_={
            "window_started_at": case((expired, now), else_=table.c.window_started_at),
            "request_count": case((expired, 1), else_=table.c.request_count + 1),
        },
    ).returning(table.c.request_count, table.c.window_started_at)
    result = await db.execute(statement)
    count, window_started_at = result.one()
    retry_after = max(
        1,
        int((window_started_at + window - now).total_seconds() + 0.999),
    )
    return count <= settings.STUDY_BUDDY_RATE_LIMIT_REQUESTS, retry_after


@router.post("/chat", response_model=StudyBuddyChatResponse)
async def study_buddy_chat(
    data: StudyBuddyChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    context = await _resolve_context(db, user.id, data.session_id)
    if context is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An active Focus session is required to use Study Buddy.",
        )
    allowed, retry_after = await _check_and_consume_rate_limit(db, user.id)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Study Buddy request limit reached. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )
    # Persist the consumed slot before calling the tutor provider. Otherwise
    # a provider failure raises HTTPException and get_db rolls the request
    # transaction back, allowing failed requests to avoid the per-user cap.
    await db.commit()
    tutor = get_tutor()
    try:
        answer = await tutor.answer(
            data.question,
            data.history,
            task_title=context[0],
            subject_name=context[1],
        )
    except TutorUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Study Buddy is temporarily unavailable.",
        ) from exc
    except TutorRateLimited as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Study Buddy is temporarily busy. Please try again later.",
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc
    except TutorProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Study Buddy could not answer right now. Please try again.",
        ) from exc
    return StudyBuddyChatResponse(answer=answer)
