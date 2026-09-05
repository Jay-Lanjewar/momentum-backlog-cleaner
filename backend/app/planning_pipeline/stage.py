"""Pipeline stages.

Every stage has exactly one responsibility and implements ``Stage.execute``.
Stages communicate only through ``PlanningContext``; no stage knows how any
other stage is implemented. The pipeline executes stages in order.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import replace
from datetime import date
from typing import Callable

from app.estimation import estimate
from app.rescheduler import (
    CompletionStatus,
    PlannedSession,
    ReschedulableTask,
    reschedule,
)
from app.scoring import (
    PlanningContext as ScoringContext,
    PlanningScoreEngine,
    ScoringTask,
)
from app.session_splitter import split

from .contract import (
    _ID_STR_KEY,
    _PLANNING_SCORE_KEY,
    _PRIORITY_BOOST_KEY,
    _RESOLVED_MINUTES_KEY,
    _SESSION_DURATIONS_KEY,
    PlanningContext,
)

EstimateFn = Callable[[dict], object]


class Stage(ABC):
    @abstractmethod
    def execute(self, context: PlanningContext) -> PlanningContext:
        raise NotImplementedError


def _resolve_estimated_minutes(item: dict, estimate_fn: EstimateFn) -> int:
    existing = item.get("estimated_minutes")
    if isinstance(existing, (int, float)) and existing > 0:
        return int(existing)
    return estimate_fn(item).estimated_minutes


def _planning_task(item: dict, estimated_minutes: int) -> ScoringTask:
    return ScoringTask(
        title=item.get("title") or "",
        priority=item.get("priority"),
        due_date=item.get("due_date"),
        estimated_minutes=estimated_minutes,
        overdue=item.get("overdue"),
    )


class EstimationStage(Stage):
    """Resolve ``estimated_minutes`` for every backlog item."""

    def __init__(self, estimate_fn: EstimateFn = estimate):
        self._estimate_fn = estimate_fn

    def execute(self, context: PlanningContext) -> PlanningContext:
        prepared = []
        for item in context.backlog:
            entry = dict(item)
            entry[_ID_STR_KEY] = str(item["id"])
            entry[_RESOLVED_MINUTES_KEY] = _resolve_estimated_minutes(
                item, self._estimate_fn
            )
            prepared.append(entry)
        return replace(context, backlog=tuple(prepared))


class PlanningScoreStage(Stage):
    """Compute the planning score for every backlog item."""

    def __init__(self, engine: PlanningScoreEngine | None = None):
        self._engine = engine or PlanningScoreEngine()

    def execute(self, context: PlanningContext) -> PlanningContext:
        scoring_context = ScoringContext(today=context.planning_date)
        for item in context.backlog:
            item[_PLANNING_SCORE_KEY] = self._engine.score(
                _planning_task(item, item[_RESOLVED_MINUTES_KEY]),
                scoring_context,
            ).score
        return context


_SPLIT_DURATIONS_CACHE: dict[tuple[int, str], tuple[int, ...]] = {}
_SPLIT_CACHE_MAX = 128


def _split_durations(
    estimated_minutes: int, session_type: str = "study"
) -> tuple[int, ...]:
    key = (estimated_minutes, session_type)
    cached = _SPLIT_DURATIONS_CACHE.get(key)
    if cached is not None:
        return cached
    durations = tuple(
        s.duration_minutes for s in split("", estimated_minutes, session_type).sessions
    )
    if len(_SPLIT_DURATIONS_CACHE) < _SPLIT_CACHE_MAX:
        _SPLIT_DURATIONS_CACHE[key] = durations
    return durations


class SessionSplitterStage(Stage):
    """Materialize session durations for every backlog item."""

    def execute(self, context: PlanningContext) -> PlanningContext:
        cache = _SPLIT_DURATIONS_CACHE
        get = cache.get
        for item in context.backlog:
            key = (item[_RESOLVED_MINUTES_KEY], "study")
            durations = get(key)
            if durations is None:
                durations = tuple(
                    s.duration_minutes
                    for s in split("", key[0], "study").sessions
                )
                if len(cache) < _SPLIT_CACHE_MAX:
                    cache[key] = durations
            item[_SESSION_DURATIONS_KEY] = durations
        return context


_STATUS_BY_VALUE = {s.value: s for s in CompletionStatus}
_COMPLETED = CompletionStatus.COMPLETED
_SKIPPED = CompletionStatus.SKIPPED


def _previous_sessions(previous_plan: dict | None) -> list[dict]:
    if not previous_plan:
        return []
    if isinstance(previous_plan, dict):
        return list(previous_plan.get("sessions", []))
    return list(previous_plan)


def _completion_status(completion: dict | None) -> CompletionStatus:
    if completion is None:
        return _SKIPPED
    status = completion.get("status")
    if status is None:
        return _SKIPPED
    return _STATUS_BY_VALUE.get(status, _SKIPPED)


def _completion_lookup(
    completions: list[dict] | None,
) -> dict[tuple[str, int], dict]:
    lookup: dict[tuple[str, int], dict] = {}
    for completion in completions or []:
        backlog_id = completion.get("backlog_item_id")
        lookup[
            (
                backlog_id if isinstance(backlog_id, str) else str(backlog_id),
                int(completion.get("session_number", 0)),
            )
        ] = completion
    return lookup


def _build_rescheduling(
    previous_plan: dict | None,
    completions: list[dict] | None,
    target_date: date,
) -> dict[str, object]:
    sessions = _previous_sessions(previous_plan)
    if not sessions:
        return {}
    lookup = _completion_lookup(completions)
    task_ids: list[str] = []
    task_sessions: list[list[tuple[int, int, CompletionStatus, int]]] = []
    session_counts: list[int] = []
    index_by_id: dict[str, int] = {}
    last_remaining: dict[str, int] = {}
    to_minutes = _to_minutes
    for session in sessions:
        backlog_id = session.get("backlog_item_id")
        if not isinstance(backlog_id, str):
            backlog_id = str(backlog_id)
        task_index = index_by_id.get(backlog_id)
        if task_index is None:
            task_index = len(task_ids)
            index_by_id[backlog_id] = task_index
            task_ids.append(backlog_id)
            task_sessions.append([])
            session_counts.append(0)
        group = task_sessions[task_index]
        number = session_counts[task_index] + 1
        session_counts[task_index] = number
        completion = lookup.get((backlog_id, number))
        status = _completion_status(completion)
        if status is not _COMPLETED:
            group.append((
                number,
                max(
                    0,
                    to_minutes(session["end_time"])
                    - to_minutes(session["start_time"]),
                ),
                status,
                int(completion.get("completed_minutes", 0)) if completion else 0,
            ))
        last_remaining[backlog_id] = int(session.get("remaining_minutes", 0))

    tasks = [
        ReschedulableTask(
            backlog_item_id=task_ids[task_index],
            sessions=tuple(
                PlannedSession(*session_data)
                for session_data in task_sessions[task_index]
            ),
            overflow_minutes=max(0, last_remaining.get(task_ids[task_index], 0)),
        )
        for task_index in range(len(task_ids))
    ]
    result = reschedule(tasks, target_date)
    return {adjustment.backlog_item_id: adjustment for adjustment in result.adjustments}


class AdaptiveReschedulerStage(Stage):
    """Apply rescheduling adjustments and produce the final priority order."""

    def execute(self, context: PlanningContext) -> PlanningContext:
        adjustments = _build_rescheduling(
            context.previous_plan, context.completed_sessions, context.planning_date
        )
        ranked = []
        for item in context.backlog:
            adjustment = adjustments.get(item[_ID_STR_KEY]) if adjustments else None
            if adjustment is not None:
                if adjustment.remaining_minutes == 0:
                    continue
                item[_PRIORITY_BOOST_KEY] = adjustment.priority_boost
                if adjustment.session_durations:
                    item[_SESSION_DURATIONS_KEY] = adjustment.session_durations
            ranked.append(item)
        ranked.sort(
            key=lambda x: (
                -(x[_PLANNING_SCORE_KEY] + x.get(_PRIORITY_BOOST_KEY, 0)),
                -x["score"],
                x["priority"],
            )
        )
        return replace(context, backlog=tuple(ranked))


_TIME_CACHE: dict[str, int] = {}


def _to_minutes(time_str: str) -> int:
    cached = _TIME_CACHE.get(time_str)
    if cached is not None:
        return cached
    parts = time_str.split(":")
    minutes = int(parts[0]) * 60 + int(parts[1])
    _TIME_CACHE[time_str] = minutes
    return minutes


def _format_time(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _find_best_slot(
    needed_minutes: int,
    windows: tuple[dict, ...],
    occupied: list[list[int]],
) -> tuple[int, int, int, int, int] | None:
    for w in windows:
        w_start = _to_minutes(w["start"])
        w_end = _to_minutes(w["end"])
        cursor = w_start
        for occ_start, occ_end in occupied:
            if occ_start >= w_end:
                break
            if occ_end > cursor:
                filler_end = min(occ_start, w_end)
                if filler_end > cursor:
                    avail = filler_end - cursor
                    if avail >= needed_minutes and avail >= 5:
                        return (
                            w_start,
                            w_end,
                            cursor,
                            cursor + needed_minutes,
                            needed_minutes,
                        )
                cursor = max(cursor, occ_end)
        if cursor < w_end:
            avail = w_end - cursor
            if avail >= needed_minutes and avail >= 5:
                return (
                    w_start,
                    w_end,
                    cursor,
                    cursor + needed_minutes,
                    needed_minutes,
                )
    return None


class DeterministicSchedulerStage(Stage):
    """Place sessions into scheduling windows.

    Consumes the priority-ordered, duration-annotated backlog and produces the
    generated sessions plus overflow ids.
    """

    def execute(self, context: PlanningContext) -> PlanningContext:
        windows = context.scheduling_windows
        total_available = sum(w.get("total_minutes", 0) for w in windows)
        capacity = (
            context.daily_capacity_minutes
            if context.daily_capacity_minutes
            and context.daily_capacity_minutes > 0
            else total_available
        )
        total_span = sum(_to_minutes(w["end"]) - _to_minutes(w["start"]) for w in windows)

        occupied_intervals: list[list[int]] = []
        sessions = []
        overflow_ids = set()
        time_used = 0
        item_session_counter: dict[str, int] = {}

        for item in context.backlog:
            if time_used >= capacity or time_used >= total_span:
                overflow_ids.add(item[_ID_STR_KEY])
                continue

            item_id = item[_ID_STR_KEY]
            durations = item.get(_SESSION_DURATIONS_KEY)
            if durations is None:
                durations = _split_durations(item[_RESOLVED_MINUTES_KEY])
            if not durations:
                overflow_ids.add(item_id)
                continue

            total_minutes = sum(durations)
            scheduled_minutes = 0
            for minutes in durations:
                if minutes > capacity - time_used:
                    break
                slot = _find_best_slot(minutes, windows, occupied_intervals)
                if slot is None:
                    break

                _, _, slot_start, slot_end, used = slot
                session_num = item_session_counter.get(item_id, 0) + 1
                item_session_counter[item_id] = session_num
                sessions.append({
                    "backlog_item_id": item_id,
                    "session_id": f"{item_id}:s{session_num}",
                    "start_time": _format_time(slot_start),
                    "end_time": _format_time(slot_end),
                    "reason": f"Work on {item['title']}",
                    "remaining_minutes": total_minutes - scheduled_minutes - used,
                })
                occupied_intervals.append([slot_start, slot_end])
                occupied_intervals.sort(key=lambda x: x[0])
                scheduled_minutes += used
                time_used += used

            if scheduled_minutes < total_minutes:
                overflow_ids.add(item_id)

        return replace(
            context,
            generated_sessions=tuple(sessions),
            overflow=tuple(overflow_ids),
        )
