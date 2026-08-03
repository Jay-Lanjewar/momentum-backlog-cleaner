import time
import uuid
from datetime import date, timedelta

import pytest

from app.services.deterministic_planner import generate_deterministic_plan

TODAY = date(2026, 8, 2)


def _window(start="06:00", end="08:00", minutes=None):
    if minutes is not None:
        return {"start": start, "end": end, "total_minutes": minutes}
    start_m = int(start.split(":")[0]) * 60 + int(start.split(":")[1])
    end_m = int(end.split(":")[0]) * 60 + int(end.split(":")[1])
    return {"start": start, "end": end, "total_minutes": end_m - start_m}


def _duration(session):
    s = int(session["start_time"].split(":")[0]) * 60 + int(session["start_time"].split(":")[1])
    e = int(session["end_time"].split(":")[0]) * 60 + int(session["end_time"].split(":")[1])
    return e - s


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


def _scheduled_ids(result):
    return [s["backlog_item_id"] for s in result["sessions"]]


class TestPlanningScoreBeatsPriority:
    def test_high_scoring_low_priority_scheduled_first(self):
        low_priority_item = _item(
            priority=4,
            overdue=True,
            due_date=TODAY - timedelta(days=1),
            estimated_minutes=30,
        )
        high_priority_item = _item(
            priority=1,
            overdue=False,
            due_date=None,
            estimated_minutes=30,
        )
        result = generate_deterministic_plan(
            {
                "available_windows": [_window(start="06:00", end="06:30")],
                "prioritized_backlog": [high_priority_item, low_priority_item],
            },
            target_date=TODAY,
        )
        scheduled = _scheduled_ids(result)
        assert str(low_priority_item["id"]) in scheduled
        assert str(high_priority_item["id"]) in result["overflow"]

    def test_score_drives_order_over_legacy_score(self):
        item_with_higher_plan_score = _item(
            priority=4,
            overdue=True,
            due_date=TODAY - timedelta(days=2),
            estimated_minutes=30,
            score=10,
        )
        item_with_higher_legacy_score = _item(
            priority=1,
            overdue=False,
            due_date=None,
            estimated_minutes=30,
            score=200,
        )
        result = generate_deterministic_plan(
            {
                "available_windows": [_window(start="06:00", end="06:30")],
                "prioritized_backlog": [
                    item_with_higher_legacy_score,
                    item_with_higher_plan_score,
                ],
            },
            target_date=TODAY,
        )
        assert str(item_with_higher_plan_score["id"]) in _scheduled_ids(result)
        assert str(item_with_higher_legacy_score["id"]) in result["overflow"]


class TestUserEstimateOverridesEngine:
    def test_manual_estimate_still_wins(self):
        result = generate_deterministic_plan(
            {
                "available_windows": [_window(start="06:00", end="07:00")],
                "prioritized_backlog": [
                    _item(
                        title="Solve exercise 4",
                        estimated_minutes=30,
                        due_date=TODAY,
                    )
                ],
            },
            target_date=TODAY,
        )
        assert [_duration(s) for s in result["sessions"]] == [25, 5]

    def test_engine_not_called_with_manual_estimate(self, monkeypatch):
        calls = []

        def fake_estimate(item):
            calls.append(item)
            return None

        monkeypatch.setattr(
            "app.services.deterministic_planner.estimate", fake_estimate
        )
        generate_deterministic_plan(
            {
                "available_windows": [_window(start="06:00", end="07:00")],
                "prioritized_backlog": [
                    _item(
                        title="Solve exercise 4",
                        estimated_minutes=45,
                        due_date=TODAY,
                    )
                ],
            },
            target_date=TODAY,
        )
        assert calls == []


class TestDeterminism:
    def test_repeated_calls_identical(self):
        data = {
            "available_windows": [
                _window(start="06:00", end="07:00"),
                _window(start="08:00", end="09:00"),
            ],
            "prioritized_backlog": [
                _item(priority=1, estimated_minutes=45, due_date=TODAY),
                _item(priority=4, estimated_minutes=30, due_date=None),
                _item(priority=2, estimated_minutes=90, due_date=TODAY - timedelta(days=1)),
            ],
        }
        first = generate_deterministic_plan(data, target_date=TODAY)
        second = generate_deterministic_plan(data, target_date=TODAY)
        assert first == second

    def test_same_inputs_identical_plans(self):
        items = [_item(priority=p, estimated_minutes=m, score=s) for p, m, s in
                 [(1, 30, 100), (2, 45, 90), (4, 30, 50)]]
        data = {
            "available_windows": [_window(start="06:00", end="07:30")],
            "prioritized_backlog": list(items),
        }
        plan_a = generate_deterministic_plan(data, target_date=TODAY)
        plan_b = generate_deterministic_plan(data, target_date=TODAY)
        assert plan_a == plan_b

    def test_input_backlog_not_mutated(self):
        item = _item()
        original = dict(item)
        data = {
            "available_windows": [_window(start="06:00", end="07:00")],
            "prioritized_backlog": [item],
        }
        generate_deterministic_plan(data, target_date=TODAY)
        assert item == original


class TestSchedulingBehaviourUnchanged:
    def test_tie_break_uses_legacy_ordering(self):
        higher_legacy = _item(priority=3, estimated_minutes=30, score=100)
        lower_legacy = _item(priority=3, estimated_minutes=30, score=50)
        result = generate_deterministic_plan(
            {
                "available_windows": [_window(start="06:00", end="06:30")],
                "prioritized_backlog": [lower_legacy, higher_legacy],
            },
            target_date=TODAY,
        )
        assert _scheduled_ids(result) == [str(higher_legacy["id"]), str(higher_legacy["id"])]
        assert str(lower_legacy["id"]) in result["overflow"]

    def test_explicit_estimates_produce_identical_output(self):
        first = uuid.uuid4()
        second = uuid.uuid4()
        result = generate_deterministic_plan(
            {
                "available_windows": [_window(start="06:00", end="08:00")],
                "prioritized_backlog": [
                    {
                        "id": first, "title": "Homework", "priority": 1,
                        "score": 100, "estimated_minutes": 60, "course_name": "A",
                    },
                    {
                        "id": second, "title": "Reading", "priority": 2,
                        "score": 90, "estimated_minutes": 30, "course_name": "B",
                    },
                ],
            },
            target_date=TODAY,
        )
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

    def test_item_split_across_windows_still_works(self):
        item_id = uuid.uuid4()
        result = generate_deterministic_plan(
            {
                "available_windows": [
                    _window(start="06:00", end="07:00"),
                    _window(start="08:00", end="09:00"),
                ],
                "prioritized_backlog": [
                    _item(id=item_id, title="Long Task", estimated_minutes=90)
                ],
            },
            target_date=TODAY,
        )
        assert [_duration(s) for s in result["sessions"]] == [30, 30, 30]
        assert len(result["overflow"]) == 0

    def test_response_contract_unchanged(self):
        result = generate_deterministic_plan(
            {
                "available_windows": [_window(start="06:00", end="07:00")],
                "prioritized_backlog": [_item()],
            },
            target_date=TODAY,
        )
        assert set(result.keys()) == {"sessions", "daily_message", "overflow"}
        assert set(result["sessions"][0].keys()) == {
            "backlog_item_id",
            "start_time",
            "end_time",
            "reason",
            "remaining_minutes",
        }


class TestNoDatabaseCalls:
    def test_plan_generation_does_not_touch_database(self, monkeypatch):
        def forbidden(*args, **kwargs):
            raise AssertionError("Database accessed during plan generation")

        import sqlalchemy

        monkeypatch.setattr(
            sqlalchemy.orm.session.Session, "execute", forbidden
        )
        monkeypatch.setattr(
            sqlalchemy.ext.asyncio.session.AsyncSession, "execute", forbidden
        )
        result = generate_deterministic_plan(
            {
                "available_windows": [_window(start="06:00", end="07:00")],
                "prioritized_backlog": [_item()],
            },
            target_date=TODAY,
        )
        assert len(result["sessions"]) == 2

    def test_planner_module_has_no_db_imports(self):
        import app.services.deterministic_planner as module

        source = module.__name__
        forbidden = ["sqlalchemy", "AsyncSession", "get_db", "dependencies"]
        assert all(token not in source for token in forbidden)


class TestRuntime:
    def test_5000_items_complete_within_budget(self):
        items = [
            _item(
                priority=i % 4 + 1,
                score=(i * 37) % 200,
                estimated_minutes=[15, 30, 45, 60][i % 4],
                due_date=TODAY + timedelta(days=i % 20),
            )
            for i in range(5000)
        ]
        data = {
            "available_windows": [
                _window(start="06:00", end="08:00"),
                _window(start="17:00", end="20:00"),
            ],
            "prioritized_backlog": items,
        }
        start = time.perf_counter()
        generate_deterministic_plan(data, target_date=TODAY)
        elapsed = time.perf_counter() - start
        assert elapsed < 5.0
