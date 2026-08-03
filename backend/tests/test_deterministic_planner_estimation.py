import uuid

import pytest

from app.estimation import EstimationResult
from app.services.deterministic_planner import generate_deterministic_plan


def _to_minutes(time_str: str) -> int:
    hours, minutes = time_str.split(":")
    return int(hours) * 60 + int(minutes)


def _duration(session: dict) -> int:
    return _to_minutes(session["end_time"]) - _to_minutes(session["start_time"])


def _window(start: str = "06:00", end: str = "08:00") -> dict:
    minutes = _to_minutes(end) - _to_minutes(start)
    return {"start": start, "end": end, "total_minutes": minutes}


def _item(**overrides) -> dict:
    base = {
        "id": uuid.uuid4(),
        "title": "Solve exercise 4",
        "priority": 3,
        "score": 100,
        "estimated_minutes": None,
        "course_name": "A",
    }
    base.update(overrides)
    return base


class TestUserEstimateOverridesEngine:
    def test_present_estimate_is_used_as_is(self):
        result = generate_deterministic_plan({
            "available_windows": [_window()],
            "prioritized_backlog": [
                _item(title="Solve exercise 4", priority=1, estimated_minutes=30)
            ],
        })
        assert [_duration(s) for s in result["sessions"]] == [25, 5]

    def test_engine_not_called_when_estimate_present(self, monkeypatch):
        calls = []

        def fake_estimate(item):
            calls.append(item)
            return EstimationResult(estimated_minutes=999, confidence=0.5, reasoning=[])

        monkeypatch.setattr("app.services.deterministic_planner.estimate", fake_estimate)
        result = generate_deterministic_plan({
            "available_windows": [_window()],
            "prioritized_backlog": [_item(estimated_minutes=60)],
        })
        assert calls == []
        assert [_duration(s) for s in result["sessions"]] == [35, 25]

    def test_float_positive_estimate_is_used(self):
        result = generate_deterministic_plan({
            "available_windows": [_window()],
            "prioritized_backlog": [_item(estimated_minutes=45.0)],
        })
        assert [_duration(s) for s in result["sessions"]] == [25, 20]


class TestMissingEstimateUsesEngine:
    def test_missing_estimate_uses_engine(self, monkeypatch):
        calls = []

        def fake_estimate(item):
            calls.append(item)
            return EstimationResult(estimated_minutes=45, confidence=0.5, reasoning=[])

        monkeypatch.setattr("app.services.deterministic_planner.estimate", fake_estimate)
        result = generate_deterministic_plan({
            "available_windows": [_window()],
            "prioritized_backlog": [_item(title="Solve exercise 4", estimated_minutes=None)],
        })
        assert len(calls) == 1
        assert [_duration(s) for s in result["sessions"]] == [25, 20]

    def test_missing_estimate_uses_real_engine(self):
        result = generate_deterministic_plan({
            "available_windows": [_window()],
            "prioritized_backlog": [
                _item(title="Solve exercise 4", priority=3, estimated_minutes=None)
            ],
        })
        assert [_duration(s) for s in result["sessions"]] == [25, 20]

    def test_zero_estimate_falls_back_to_engine(self):
        result = generate_deterministic_plan({
            "available_windows": [_window()],
            "prioritized_backlog": [
                _item(title="Solve exercise 4", priority=3, estimated_minutes=0)
            ],
        })
        assert [_duration(s) for s in result["sessions"]] == [25, 20]

    def test_negative_estimate_falls_back_to_engine(self):
        result = generate_deterministic_plan({
            "available_windows": [_window()],
            "prioritized_backlog": [
                _item(title="Solve exercise 4", priority=3, estimated_minutes=-5)
            ],
        })
        assert [_duration(s) for s in result["sessions"]] == [25, 20]


class TestEmptyTask:
    def test_empty_task_still_gets_estimate(self):
        result = generate_deterministic_plan({
            "available_windows": [_window()],
            "prioritized_backlog": [_item(title="", priority=3, estimated_minutes=None)],
        })
        assert len(result["sessions"]) == 1
        assert _duration(result["sessions"][0]) == 15

    def test_whitespace_task_still_gets_estimate(self):
        result = generate_deterministic_plan({
            "available_windows": [_window()],
            "prioritized_backlog": [_item(title="   ", estimated_minutes=None)],
        })
        assert _duration(result["sessions"][0]) == 15


class TestSchedulesUnchanged:
    def test_explicit_estimates_produce_identical_output(self):
        first = uuid.uuid4()
        second = uuid.uuid4()
        result = generate_deterministic_plan({
            "available_windows": [_window("06:00", "08:00")],
            "prioritized_backlog": [
                {
                    "id": first, "title": "Homework", "priority": 1, "score": 100,
                    "estimated_minutes": 60, "course_name": "A",
                },
                {
                    "id": second, "title": "Reading", "priority": 2, "score": 90,
                    "estimated_minutes": 30, "course_name": "B",
                },
            ],
        })
        assert result == {
            "sessions": [
                {
                    "backlog_item_id": str(first),
                    "start_time": "06:00",
                    "end_time": "06:35",
                    "reason": "Work on Homework",
                    "remaining_minutes": 25,
                },
                {
                    "backlog_item_id": str(first),
                    "start_time": "06:35",
                    "end_time": "07:00",
                    "reason": "Work on Homework",
                    "remaining_minutes": 0,
                },
                {
                    "backlog_item_id": str(second),
                    "start_time": "07:00",
                    "end_time": "07:25",
                    "reason": "Work on Reading",
                    "remaining_minutes": 5,
                },
                {
                    "backlog_item_id": str(second),
                    "start_time": "07:25",
                    "end_time": "07:30",
                    "reason": "Work on Reading",
                    "remaining_minutes": 0,
                },
            ],
            "daily_message": "Planned 2 of 2 items. All tasks scheduled!",
            "overflow": [],
        }

    def test_structure_identical_except_durations(self):
        item = _item(title="Solve exercise 4", priority=3, estimated_minutes=60)
        with_estimate = generate_deterministic_plan({
            "available_windows": [_window("06:00", "09:00")],
            "prioritized_backlog": [item],
        })
        missing_estimate = generate_deterministic_plan({
            "available_windows": [_window("06:00", "09:00")],
            "prioritized_backlog": [{**item, "estimated_minutes": None}],
        })

        a = with_estimate["sessions"][0]
        b = missing_estimate["sessions"][0]
        assert _duration(a) == 35
        assert _duration(b) == 25
        assert b["backlog_item_id"] == a["backlog_item_id"]
        assert b["reason"] == a["reason"]
        assert missing_estimate["daily_message"] == with_estimate["daily_message"]
        assert missing_estimate["overflow"] == with_estimate["overflow"]
        assert len(missing_estimate["sessions"]) == len(with_estimate["sessions"])

    def test_priority_ordering_preserved_with_engine_estimates(self):
        low = uuid.uuid4()
        high = uuid.uuid4()
        result = generate_deterministic_plan({
            "available_windows": [_window("06:00", "08:00")],
            "prioritized_backlog": [
                _item(id=low, title="Low priority", priority=4, estimated_minutes=None),
                _item(id=high, title="High priority", priority=1, estimated_minutes=None),
            ],
        })
        scheduled = [s["backlog_item_id"] for s in result["sessions"]]
        assert scheduled == [str(high), str(high), str(low), str(low)]
        assert result["overflow"] == []
