import time
import uuid
from datetime import date, timedelta

import sqlalchemy

from app.services.deterministic_planner import generate_deterministic_plan

TODAY = date(2026, 8, 2)


def _window(start, end):
    start_m = int(start.split(":")[0]) * 60 + int(start.split(":")[1])
    end_m = int(end.split(":")[0]) * 60 + int(end.split(":")[1])
    return {"start": start, "end": end, "total_minutes": end_m - start_m}


def _duration(session):
    start_m = int(session["start_time"].split(":")[0]) * 60 + int(session["start_time"].split(":")[1])
    end_m = int(session["end_time"].split(":")[0]) * 60 + int(session["end_time"].split(":")[1])
    return end_m - start_m


def _item(**overrides):
    base = {
        "id": uuid.uuid4(),
        "title": "Task",
        "course_id": uuid.uuid4(),
        "course_name": "A",
        "course_color": "#6366f1",
        "priority": 3,
        "score": 100,
        "estimated_minutes": 30,
        "due_date": None,
        "overdue": False,
        "status": "pending",
    }
    base.update(overrides)
    return base


def _session_record(backlog_item_id, start, end, remaining=0):
    return {
        "backlog_item_id": str(backlog_item_id),
        "start_time": start,
        "end_time": end,
        "reason": "Work on Task",
        "remaining_minutes": remaining,
    }


def _previous_plan(*session_specs):
    records = []
    for spec in session_specs:
        remaining = spec[3] if len(spec) > 3 else 0
        records.append(_session_record(spec[0], spec[1], spec[2], remaining))
    return {
        "sessions": records,
        "daily_message": "",
        "overflow": [],
    }


def _completion(backlog_item_id, number, status, completed=0):
    record = {
        "backlog_item_id": str(backlog_item_id),
        "session_number": number,
        "status": status,
    }
    if completed:
        record["completed_minutes"] = completed
    return record


def _scheduled_ids(result):
    return [s["backlog_item_id"] for s in result["sessions"]]


class TestCompletedSessionsRemoved:
    def test_fully_completed_task_disappears(self):
        a = _item(estimated_minutes=45, priority=1)
        b = _item(estimated_minutes=45, priority=2)
        previous = _previous_plan(
            (a["id"], "06:00", "06:25"),
            (a["id"], "06:25", "06:45"),
            (b["id"], "06:45", "07:10"),
            (b["id"], "07:10", "07:30"),
        )
        completions = [
            _completion(a["id"], 1, "completed"),
            _completion(a["id"], 2, "completed"),
        ]
        result = generate_deterministic_plan(
            {
                "available_windows": [_window("06:00", "08:00")],
                "prioritized_backlog": [a, b],
            },
            target_date=TODAY,
            previous_plan=previous,
            completions=completions,
        )
        assert str(a["id"]) not in _scheduled_ids(result)
        assert str(b["id"]) in _scheduled_ids(result)
        assert result["overflow"] == []
        assert result["daily_message"] == "Planned 1 of 1 items. All tasks scheduled!"

    def test_completed_session_removed_from_carried(self):
        a = _item(estimated_minutes=45, priority=1)
        previous = _previous_plan(
            (a["id"], "06:00", "06:25"),
            (a["id"], "06:25", "06:45"),
        )
        completions = [
            _completion(a["id"], 1, "completed"),
            _completion(a["id"], 2, "skipped"),
        ]
        result = generate_deterministic_plan(
            {
                "available_windows": [_window("06:00", "08:00")],
                "prioritized_backlog": [a],
            },
            target_date=TODAY,
            previous_plan=previous,
            completions=completions,
        )
        assert [_duration(s) for s in result["sessions"]] == [20]
        assert result["overflow"] == []


class TestPartialSessionsReduced:
    def test_partial_session_keeps_only_remaining(self):
        b = _item(estimated_minutes=45, priority=2)
        previous = _previous_plan(
            (b["id"], "06:45", "07:10"),
            (b["id"], "07:10", "07:30"),
        )
        completions = [
            _completion(b["id"], 1, "partial", completed=10),
        ]
        result = generate_deterministic_plan(
            {
                "available_windows": [_window("06:00", "08:00")],
                "prioritized_backlog": [b],
            },
            target_date=TODAY,
            previous_plan=previous,
            completions=completions,
        )
        assert [_duration(s) for s in result["sessions"]] == [15, 20]
        assert [s["remaining_minutes"] for s in result["sessions"]] == [20, 0]
        assert result["overflow"] == []


class TestSkippedSessionsMoved:
    def test_skipped_session_carried_forward(self):
        a = _item(estimated_minutes=45, priority=1)
        previous = _previous_plan(
            (a["id"], "06:00", "06:25"),
            (a["id"], "06:25", "06:45"),
        )
        completions = [
            _completion(a["id"], 1, "skipped"),
            _completion(a["id"], 2, "skipped"),
        ]
        result = generate_deterministic_plan(
            {
                "available_windows": [_window("06:00", "08:00")],
                "prioritized_backlog": [a],
            },
            target_date=TODAY,
            previous_plan=previous,
            completions=completions,
        )
        assert [_duration(s) for s in result["sessions"]] == [25, 20]
        assert result["overflow"] == []

    def test_missing_completion_defaults_to_skipped(self):
        a = _item(estimated_minutes=45, priority=1)
        previous = _previous_plan(
            (a["id"], "06:00", "06:25"),
            (a["id"], "06:25", "06:45"),
        )
        result = generate_deterministic_plan(
            {
                "available_windows": [_window("06:00", "08:00")],
                "prioritized_backlog": [a],
            },
            target_date=TODAY,
            previous_plan=previous,
        )
        assert [_duration(s) for s in result["sessions"]] == [25, 20]


class TestOrderingPreserved:
    def test_carried_sessions_keep_previous_order(self):
        a = _item(estimated_minutes=60, priority=1)
        previous = _previous_plan(
            (a["id"], "06:00", "06:35"),
            (a["id"], "06:35", "07:00"),
        )
        completions = [
            _completion(a["id"], 1, "completed"),
            _completion(a["id"], 2, "partial", completed=15),
        ]
        result = generate_deterministic_plan(
            {
                "available_windows": [_window("06:00", "08:00")],
                "prioritized_backlog": [a],
            },
            target_date=TODAY,
            previous_plan=previous,
            completions=completions,
        )
        assert [_duration(s) for s in result["sessions"]] == [10]
        assert [s["remaining_minutes"] for s in result["sessions"]] == [0]

    def test_overflow_tail_appended_after_carried_sessions(self):
        c = _item(estimated_minutes=90, priority=1)
        previous = _previous_plan(
            (c["id"], "06:00", "06:30", 60),
            (c["id"], "06:30", "07:00", 30),
        )
        completions = [
            _completion(c["id"], 1, "completed"),
            _completion(c["id"], 2, "skipped"),
        ]
        result = generate_deterministic_plan(
            {
                "available_windows": [_window("06:00", "08:00")],
                "prioritized_backlog": [c],
            },
            target_date=TODAY,
            previous_plan=previous,
            completions=completions,
        )
        assert [_duration(s) for s in result["sessions"]] == [30, 30]
        assert [s["remaining_minutes"] for s in result["sessions"]] == [30, 0]
        assert result["overflow"] == []


class TestPrioritization:
    def test_skipped_task_ranks_above_equivalent_task(self):
        x = _item(estimated_minutes=30, priority=3, score=100, title="X")
        y = _item(estimated_minutes=30, priority=3, score=100, title="Y")
        previous = _previous_plan(
            (y["id"], "06:00", "06:25"),
            (y["id"], "06:25", "06:30"),
        )
        completions = [
            _completion(y["id"], 1, "skipped"),
            _completion(y["id"], 2, "skipped"),
        ]
        result = generate_deterministic_plan(
            {
                "available_windows": [_window("06:00", "06:30")],
                "prioritized_backlog": [x, y],
            },
            target_date=TODAY,
            previous_plan=previous,
            completions=completions,
        )
        scheduled = _scheduled_ids(result)
        assert scheduled[0] == str(y["id"])
        assert str(x["id"]) in result["overflow"]
        assert str(y["id"]) not in result["overflow"]


class TestDeterminism:
    def test_repeated_calls_identical_with_completions(self):
        a = _item(estimated_minutes=60, priority=1)
        b = _item(estimated_minutes=45, priority=2)
        previous = _previous_plan(
            (a["id"], "06:00", "06:35"),
            (a["id"], "06:35", "07:00"),
            (b["id"], "07:00", "07:25"),
            (b["id"], "07:25", "07:45"),
        )
        completions = [
            _completion(a["id"], 1, "completed"),
            _completion(a["id"], 2, "skipped"),
            _completion(b["id"], 1, "partial", completed=5),
        ]
        data = {
            "available_windows": [_window("06:00", "08:00")],
            "prioritized_backlog": [a, b],
        }
        first = generate_deterministic_plan(data, target_date=TODAY, previous_plan=previous, completions=completions)
        second = generate_deterministic_plan(data, target_date=TODAY, previous_plan=previous, completions=completions)
        assert first == second


class TestOutputContract:
    def test_contract_keys_unchanged(self):
        a = _item(estimated_minutes=45, priority=1)
        previous = _previous_plan(
            (a["id"], "06:00", "06:25"),
            (a["id"], "06:25", "06:45"),
        )
        completions = [_completion(a["id"], 1, "skipped")]
        result = generate_deterministic_plan(
            {
                "available_windows": [_window("06:00", "08:00")],
                "prioritized_backlog": [a],
            },
            target_date=TODAY,
            previous_plan=previous,
            completions=completions,
        )
        assert set(result.keys()) == {"sessions", "daily_message", "overflow"}
        for session in result["sessions"]:
            assert set(session.keys()) == {
                "backlog_item_id",
                "session_id",
                "start_time",
                "end_time",
                "reason",
                "remaining_minutes",
            }


class TestBackwardCompatibility:
    def test_no_previous_plan_equivalent_to_omitted(self):
        a = _item(estimated_minutes=60)
        data = {
            "available_windows": [_window("06:00", "07:00")],
            "prioritized_backlog": [a],
        }
        with_previous = generate_deterministic_plan(data, target_date=TODAY, previous_plan=None)
        without = generate_deterministic_plan(data, target_date=TODAY)
        assert with_previous == without


class TestNoDatabaseCalls:
    def test_plan_generation_does_not_touch_database(self, monkeypatch):
        def forbidden(*args, **kwargs):
            raise AssertionError("Database accessed during plan generation")

        monkeypatch.setattr(sqlalchemy.orm.session.Session, "execute", forbidden)
        monkeypatch.setattr(
            sqlalchemy.ext.asyncio.session.AsyncSession, "execute", forbidden
        )
        a = _item(estimated_minutes=45)
        previous = _previous_plan(
            (a["id"], "06:00", "06:25"),
            (a["id"], "06:25", "06:45"),
        )
        completions = [_completion(a["id"], 1, "skipped")]
        result = generate_deterministic_plan(
            {
                "available_windows": [_window("06:00", "08:00")],
                "prioritized_backlog": [a],
            },
            target_date=TODAY,
            previous_plan=previous,
            completions=completions,
        )
        assert len(result["sessions"]) == 2


class TestRuntime:
    def test_5000_items_with_previous_plan_within_budget(self):
        items = [
            _item(
                priority=i % 4 + 1,
                score=(i * 37) % 200,
                estimated_minutes=[15, 30, 45, 60, 90, 120][i % 6],
            )
            for i in range(5000)
        ]
        previous_sessions = []
        completions = []
        for index, item in enumerate(items[:500]):
            first = item["estimated_minutes"]
            prev_end = 0
            for number in range(1, 4):
                start = f"{6 + prev_end // 60:02d}:{prev_end % 60:02d}"
                prev_end += 25
                end = f"{6 + prev_end // 60:02d}:{prev_end % 60:02d}"
                previous_sessions.append(
                    _session_record(item["id"], start, end, remaining=first - prev_end)
                )
                completions.append(_completion(item["id"], number, "skipped"))
                first -= 25
                if first <= 0:
                    break
        data = {
            "available_windows": [
                _window("06:00", "08:00"),
                _window("17:00", "20:00"),
            ],
            "prioritized_backlog": items,
        }
        start = time.perf_counter()
        generate_deterministic_plan(
            data,
            target_date=TODAY,
            previous_plan={"sessions": previous_sessions, "daily_message": "", "overflow": []},
            completions=completions,
        )
        elapsed = time.perf_counter() - start
        assert elapsed < 5.0
