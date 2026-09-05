import time
import uuid
from datetime import date

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


class TestSessionChunking:
    def test_60_minute_task_becomes_two_sessions(self):
        item = _item(estimated_minutes=60)
        result = generate_deterministic_plan(
            {
                "available_windows": [_window("06:00", "08:00")],
                "prioritized_backlog": [item],
            },
            target_date=TODAY,
        )
        assert [_duration(s) for s in result["sessions"]] == [35, 25]
        assert {s["backlog_item_id"] for s in result["sessions"]} == {str(item["id"])}
        assert [s["remaining_minutes"] for s in result["sessions"]] == [25, 0]
        assert result["overflow"] == []

    def test_110_minute_task_becomes_four_sessions(self):
        item = _item(estimated_minutes=110)
        result = generate_deterministic_plan(
            {
                "available_windows": [_window("06:00", "10:00")],
                "prioritized_backlog": [item],
            },
            target_date=TODAY,
        )
        assert [_duration(s) for s in result["sessions"]] == [28, 28, 27, 27]
        assert [s["remaining_minutes"] for s in result["sessions"]] == [82, 54, 27, 0]
        assert result["overflow"] == []


class TestSessionsStayTogether:
    def test_task_sessions_contiguous_in_output(self):
        first = _item(estimated_minutes=90)
        second = _item(estimated_minutes=15)
        result = generate_deterministic_plan(
            {
                "available_windows": [_window("06:00", "08:00")],
                "prioritized_backlog": [first, second],
            },
            target_date=TODAY,
        )
        scheduled = [s["backlog_item_id"] for s in result["sessions"]]
        assert scheduled == [str(first["id"])] * 3 + [str(second["id"])]
        assert result["overflow"] == []

    def test_sessions_never_interleaved_across_tasks(self):
        task_a = _item(estimated_minutes=60)
        task_b = _item(estimated_minutes=45)
        task_c = _item(estimated_minutes=30)
        result = generate_deterministic_plan(
            {
                "available_windows": [_window("06:00", "10:00")],
                "prioritized_backlog": [task_a, task_b, task_c],
            },
            target_date=TODAY,
        )
        ids = [s["backlog_item_id"] for s in result["sessions"]]
        seen = []
        for item_id in ids:
            if item_id not in seen:
                seen.append(item_id)
            else:
                assert item_id == seen[-1]
        assert len(seen) == 3


class TestWholeSessionScheduling:
    def test_no_truncation_partial_gap_left_unused(self):
        first = _item(estimated_minutes=45)
        second = _item(estimated_minutes=30)
        result = generate_deterministic_plan(
            {
                "available_windows": [_window("06:00", "07:00")],
                "prioritized_backlog": [first, second],
            },
            target_date=TODAY,
        )
        assert [_duration(s) for s in result["sessions"]] == [25, 20]
        assert {s["backlog_item_id"] for s in result["sessions"]} == {str(first["id"])}
        assert str(second["id"]) in result["overflow"]
        assert str(first["id"]) not in result["overflow"]

    def test_remaining_sessions_carry_to_overflow(self):
        item = _item(estimated_minutes=90)
        result = generate_deterministic_plan(
            {
                "available_windows": [_window("06:00", "07:00")],
                "prioritized_backlog": [item],
            },
            target_date=TODAY,
        )
        assert [_duration(s) for s in result["sessions"]] == [30, 30]
        assert [s["remaining_minutes"] for s in result["sessions"]] == [60, 30]
        assert str(item["id"]) in result["overflow"]

    def test_capacity_boundary_keeps_session_whole(self):
        item = _item(estimated_minutes=60)
        result = generate_deterministic_plan(
            {
                "available_windows": [_window("06:00", "08:00")],
                "prioritized_backlog": [item],
            },
            daily_capacity_minutes=40,
            target_date=TODAY,
        )
        assert [_duration(s) for s in result["sessions"]] == [35]
        assert [s["remaining_minutes"] for s in result["sessions"]] == [25]
        assert str(item["id"]) in result["overflow"]

    def test_capacity_beyond_window_space_caps_by_windows(self):
        first = _item(estimated_minutes=60)
        second = _item(estimated_minutes=45)
        result = generate_deterministic_plan(
            {
                "available_windows": [_window("06:00", "07:00")],
                "prioritized_backlog": [first, second],
            },
            daily_capacity_minutes=100000,
            target_date=TODAY,
        )
        assert [_duration(s) for s in result["sessions"]] == [35, 25]
        assert str(first["id"]) not in result["overflow"]
        assert str(second["id"]) in result["overflow"]

    def test_session_needing_bigger_gap_than_available_overflows(self):
        first = _item(estimated_minutes=40, priority=1)
        second = _item(estimated_minutes=10, priority=2)
        third = _item(estimated_minutes=45, priority=3)
        result = generate_deterministic_plan(
            {
                "available_windows": [_window("06:00", "07:00"), _window("08:00", "08:40")],
                "prioritized_backlog": [first, second, third],
            },
            target_date=TODAY,
        )
        assert [_duration(s) for s in result["sessions"]] == [25, 15, 10, 25]
        assert [s["remaining_minutes"] for s in result["sessions"]] == [15, 0, 0, 20]
        assert str(third["id"]) in result["overflow"]
        assert str(first["id"]) not in result["overflow"]
        assert str(second["id"]) not in result["overflow"]


class TestOutputContract:
    def test_top_level_keys_unchanged(self):
        result = generate_deterministic_plan(
            {
                "available_windows": [_window("06:00", "07:00")],
                "prioritized_backlog": [_item(estimated_minutes=60)],
            },
            target_date=TODAY,
        )
        assert set(result.keys()) == {"sessions", "daily_message", "overflow"}

    def test_session_keys_unchanged(self):
        result = generate_deterministic_plan(
            {
                "available_windows": [_window("06:00", "07:00")],
                "prioritized_backlog": [_item(estimated_minutes=60)],
            },
            target_date=TODAY,
        )
        for session in result["sessions"]:
            assert set(session.keys()) == {
                "backlog_item_id",
                "session_id",
                "start_time",
                "end_time",
                "reason",
                "remaining_minutes",
            }

    def test_sessions_reference_task_ids_not_session_objects(self):
        item = _item(estimated_minutes=110)
        result = generate_deterministic_plan(
            {
                "available_windows": [_window("06:00", "10:00")],
                "prioritized_backlog": [item],
            },
            target_date=TODAY,
        )
        assert all(s["backlog_item_id"] == str(item["id"]) for s in result["sessions"])
        assert all(isinstance(s["start_time"], str) for s in result["sessions"])
        assert all(isinstance(s["end_time"], str) for s in result["sessions"])


class TestDeterminism:
    def test_repeated_calls_identical(self):
        data = {
            "available_windows": [
                _window("06:00", "07:00"),
                _window("08:00", "09:00"),
            ],
            "prioritized_backlog": [
                _item(estimated_minutes=90),
                _item(estimated_minutes=110),
                _item(estimated_minutes=45),
            ],
        }
        first = generate_deterministic_plan(data, target_date=TODAY)
        second = generate_deterministic_plan(data, target_date=TODAY)
        assert first == second


class TestNoDatabaseCalls:
    def test_plan_generation_does_not_touch_database(self, monkeypatch):
        def forbidden(*args, **kwargs):
            raise AssertionError("Database accessed during plan generation")

        monkeypatch.setattr(
            sqlalchemy.orm.session.Session, "execute", forbidden
        )
        monkeypatch.setattr(
            sqlalchemy.ext.asyncio.session.AsyncSession, "execute", forbidden
        )
        result = generate_deterministic_plan(
            {
                "available_windows": [_window("06:00", "07:00")],
                "prioritized_backlog": [_item(estimated_minutes=60)],
            },
            target_date=TODAY,
        )
        assert len(result["sessions"]) == 2


class TestRuntime:
    def test_5000_items_complete_within_budget(self):
        items = [
            _item(
                priority=i % 4 + 1,
                score=(i * 37) % 200,
                estimated_minutes=[15, 30, 45, 60, 90, 120][i % 6],
            )
            for i in range(5000)
        ]
        data = {
            "available_windows": [
                _window("06:00", "08:00"),
                _window("17:00", "20:00"),
            ],
            "prioritized_backlog": items,
        }
        start = time.perf_counter()
        generate_deterministic_plan(data, target_date=TODAY)
        elapsed = time.perf_counter() - start
        assert elapsed < 5.0
