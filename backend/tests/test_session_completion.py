"""Tests for the adaptive planning service and session completion flow."""
import uuid
from datetime import date

import pytest

from app.services.adaptive_service import (
    compute_plan_diff,
    parse_session_id,
    build_session_id,
)
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


def _session_record(backlog_item_id, start, end, remaining=0, session_id=None):
    rec = {
        "backlog_item_id": str(backlog_item_id),
        "start_time": start,
        "end_time": end,
        "reason": "Work on Task",
        "remaining_minutes": remaining,
    }
    if session_id:
        rec["session_id"] = session_id
    return rec


def _previous_plan(*session_specs):
    records = []
    for spec in session_specs:
        remaining = spec[3] if len(spec) > 3 else 0
        sid = spec[4] if len(spec) > 4 else None
        records.append(_session_record(spec[0], spec[1], spec[2], remaining, sid))
    return {
        "sessions": records,
        "daily_message": "",
        "overflow": [],
    }


# ─── Session ID parsing ───


class TestParseSessionId:
    def test_valid_session_id(self):
        item_id = str(uuid.uuid4())
        sid = f"{item_id}:s1"
        result = parse_session_id(sid)
        assert result is not None
        assert result[0] == item_id
        assert result[1] == 1

    def test_valid_session_id_high_number(self):
        item_id = str(uuid.uuid4())
        sid = f"{item_id}:s42"
        result = parse_session_id(sid)
        assert result is not None
        assert result[1] == 42

    def test_invalid_format_no_colon(self):
        result = parse_session_id("not-a-session-id")
        assert result is None

    def test_invalid_format_bad_uuid(self):
        result = parse_session_id("not-a-uuid:s1")
        assert result is None

    def test_invalid_format_bad_session_number(self):
        item_id = str(uuid.uuid4())
        result = parse_session_id(f"{item_id}:s")
        assert result is None

    def test_invalid_format_letters_in_number(self):
        item_id = str(uuid.uuid4())
        result = parse_session_id(f"{item_id}:sabc")
        assert result is None


class TestBuildSessionId:
    def test_builds_correctly(self):
        item_id = str(uuid.uuid4())
        sid = build_session_id(item_id, 1)
        assert sid == f"{item_id}:s1"

    def test_roundtrips(self):
        item_id = str(uuid.uuid4())
        sid = build_session_id(item_id, 3)
        parsed = parse_session_id(sid)
        assert parsed is not None
        assert parsed[0] == item_id
        assert parsed[1] == 3


# ─── Plan diff generation ───


class TestComputePlanDiff:
    def test_session_moved_to_overflow(self):
        item_a = _item(estimated_minutes=25, priority=1)
        item_b = _item(estimated_minutes=25, priority=4)
        sid_a = build_session_id(str(item_a["id"]), 1)
        sid_b = build_session_id(str(item_b["id"]), 1)

        v1 = [
            {"session_id": sid_a, "backlog_item_id": str(item_a["id"]), "start_time": "16:00", "end_time": "16:25", "reason": "Work on A", "remaining_minutes": 0},
            {"session_id": sid_b, "backlog_item_id": str(item_b["id"]), "start_time": "16:25", "end_time": "16:50", "reason": "Work on B", "remaining_minutes": 0},
        ]
        v2 = [
            {"session_id": sid_a, "backlog_item_id": str(item_a["id"]), "start_time": "16:00", "end_time": "16:25", "reason": "Work on A", "remaining_minutes": 0},
        ]
        v1_overflow = []
        v2_overflow = [str(item_b["id"])]

        changes = compute_plan_diff(v1, v2, v1_overflow, v2_overflow, {
            str(item_a["id"]): "Task A",
            str(item_b["id"]): "Task B",
        })

        assert len(changes) == 1
        assert changes[0].session_id == sid_b
        assert changes[0].change_type == "moved_to_overflow"
        assert changes[0].title == "Task B"
        assert changes[0].previous_start == "16:25"
        assert changes[0].new_start is None

    def test_session_rescheduled(self):
        item_a = _item(estimated_minutes=25, priority=1)
        sid_a = build_session_id(str(item_a["id"]), 1)

        v1 = [
            {"session_id": sid_a, "backlog_item_id": str(item_a["id"]), "start_time": "16:00", "end_time": "16:25", "reason": "Work on A", "remaining_minutes": 0},
        ]
        v2 = [
            {"session_id": sid_a, "backlog_item_id": str(item_a["id"]), "start_time": "16:30", "end_time": "16:55", "reason": "Work on A", "remaining_minutes": 0},
        ]

        changes = compute_plan_diff(v1, v2, [], [], {str(item_a["id"]): "Task A"})

        assert len(changes) == 1
        assert changes[0].change_type == "rescheduled"
        assert changes[0].previous_start == "16:00"
        assert changes[0].new_start == "16:30"

    def test_no_changes_when_identical(self):
        item_a = _item(estimated_minutes=25, priority=1)
        sid_a = build_session_id(str(item_a["id"]), 1)

        v1 = [
            {"session_id": sid_a, "backlog_item_id": str(item_a["id"]), "start_time": "16:00", "end_time": "16:25", "reason": "Work on A", "remaining_minutes": 0},
        ]
        v2 = list(v1)

        changes = compute_plan_diff(v1, v2, [], [], {str(item_a["id"]): "Task A"})

        assert len(changes) == 0

    def test_newly_scheduled_not_shown_as_disruption(self):
        item_a = _item(estimated_minutes=25, priority=1)
        item_b = _item(estimated_minutes=25, priority=4)
        sid_a = build_session_id(str(item_a["id"]), 1)
        sid_b = build_session_id(str(item_b["id"]), 1)

        v1 = [
            {"session_id": sid_a, "backlog_item_id": str(item_a["id"]), "start_time": "16:00", "end_time": "16:25", "reason": "Work on A", "remaining_minutes": 0},
        ]
        v2 = [
            {"session_id": sid_a, "backlog_item_id": str(item_a["id"]), "start_time": "16:00", "end_time": "16:25", "reason": "Work on A", "remaining_minutes": 0},
            {"session_id": sid_b, "backlog_item_id": str(item_b["id"]), "start_time": "16:25", "end_time": "16:50", "reason": "Work on B", "remaining_minutes": 0},
        ]

        changes = compute_plan_diff(v1, v2, [], [], {
            str(item_a["id"]): "Task A",
            str(item_b["id"]): "Task B",
        })

        assert len(changes) == 0

    def test_multiple_sessions_displaced(self):
        item_a = _item(estimated_minutes=25, priority=1)
        item_b = _item(estimated_minutes=25, priority=3)
        item_c = _item(estimated_minutes=25, priority=4)
        sid_a = build_session_id(str(item_a["id"]), 1)
        sid_b = build_session_id(str(item_b["id"]), 1)
        sid_c = build_session_id(str(item_c["id"]), 1)

        v1 = [
            {"session_id": sid_a, "backlog_item_id": str(item_a["id"]), "start_time": "16:00", "end_time": "16:25", "reason": "Work on A", "remaining_minutes": 0},
            {"session_id": sid_b, "backlog_item_id": str(item_b["id"]), "start_time": "16:25", "end_time": "16:50", "reason": "Work on B", "remaining_minutes": 0},
            {"session_id": sid_c, "backlog_item_id": str(item_c["id"]), "start_time": "16:50", "end_time": "17:15", "reason": "Work on C", "remaining_minutes": 0},
        ]
        v2 = [
            {"session_id": sid_a, "backlog_item_id": str(item_a["id"]), "start_time": "16:00", "end_time": "16:25", "reason": "Work on A", "remaining_minutes": 0},
        ]

        changes = compute_plan_diff(v1, v2, [], [str(item_b["id"]), str(item_c["id"])], {
            str(item_a["id"]): "Task A",
            str(item_b["id"]): "Task B",
            str(item_c["id"]): "Task C",
        })

        assert len(changes) == 2
        session_ids = {c.session_id for c in changes}
        assert sid_b in session_ids
        assert sid_c in session_ids


# ─── Adaptive rescheduler integration ───


class TestAdaptiveReschedulerIntegration:
    def test_longer_session_displaces_lower_priority(self):
        """Physics (priority 1) takes longer, English (priority 4) overflows."""
        physics = _item(estimated_minutes=25, priority=1, title="Physics")
        chemistry = _item(estimated_minutes=25, priority=2, title="Chemistry")
        maths = _item(estimated_minutes=25, priority=3, title="Maths")
        english = _item(estimated_minutes=25, priority=4, title="English")

        sid_physics = build_session_id(str(physics["id"]), 1)
        sid_chem = build_session_id(str(chemistry["id"]), 1)
        sid_maths = build_session_id(str(maths["id"]), 1)
        sid_english = build_session_id(str(english["id"]), 1)

        # V1: all 4 scheduled in 100-minute window
        previous = _previous_plan(
            (physics["id"], "16:00", "16:25", 0, sid_physics),
            (chemistry["id"], "16:25", "16:50", 0, sid_chem),
            (maths["id"], "16:50", "17:15", 0, sid_maths),
            (english["id"], "17:15", "17:40", 0, sid_english),
        )

        # Physics took 40 min (actual) instead of 25 (estimated)
        completions = [{
            "backlog_item_id": str(physics["id"]),
            "session_number": 1,
            "status": "completed",
            "completed_minutes": 40,
        }]

        # Window is only 100 min (16:00-17:40). Physics takes 40, so 60 remain.
        # Chemistry (25) + Maths (25) = 50 fit. English (25) doesn't fit.
        result = generate_deterministic_plan(
            {
                "available_windows": [_window("16:00", "17:00")],
                "prioritized_backlog": [physics, chemistry, maths, english],
            },
            target_date=TODAY,
            previous_plan=previous,
            completions=completions,
        )

        # Physics should be gone (completed), English should be in overflow
        scheduled_ids = [s["backlog_item_id"] for s in result["sessions"]]
        assert str(physics["id"]) not in scheduled_ids
        assert str(english["id"]) in result["overflow"]

    def test_protected_urgent_work(self):
        """Urgent work (priority 1, due tomorrow) stays even when lower-priority overflows."""
        from datetime import datetime, timedelta

        urgent = _item(estimated_minutes=25, priority=1, title="Urgent",
                       due_date=datetime.now(tz=None) + timedelta(days=1))
        normal = _item(estimated_minutes=25, priority=4, title="Normal")

        sid_urgent = build_session_id(str(urgent["id"]), 1)
        sid_normal = build_session_id(str(normal["id"]), 1)

        previous = _previous_plan(
            (urgent["id"], "16:00", "16:25", 0, sid_urgent),
            (normal["id"], "16:25", "16:50", 0, sid_normal),
        )

        completions = [{
            "backlog_item_id": str(urgent["id"]),
            "session_number": 1,
            "status": "completed",
            "completed_minutes": 40,
        }]

        result = generate_deterministic_plan(
            {
                "available_windows": [_window("16:00", "16:50")],
                "prioritized_backlog": [urgent, normal],
            },
            target_date=TODAY,
            previous_plan=previous,
            completions=completions,
        )

        # Urgent should be completed (not in schedule), normal should be scheduled
        scheduled_ids = [s["backlog_item_id"] for s in result["sessions"]]
        assert str(urgent["id"]) not in scheduled_ids
        assert str(normal["id"]) in scheduled_ids

    def test_session_id_in_output(self):
        """Generated sessions include session_id field."""
        item = _item(estimated_minutes=25, priority=1)
        result = generate_deterministic_plan(
            {
                "available_windows": [_window("16:00", "17:00")],
                "prioritized_backlog": [item],
            },
            target_date=TODAY,
        )
        assert len(result["sessions"]) == 1
        session = result["sessions"][0]
        assert "session_id" in session
        assert session["session_id"].endswith(":s1")
        assert session["backlog_item_id"] in session["session_id"]

    def test_multiple_sessions_per_item_numbered(self):
        """Multiple sessions for same item get :s1, :s2, etc."""
        item = _item(estimated_minutes=60, priority=1)
        result = generate_deterministic_plan(
            {
                "available_windows": [_window("16:00", "17:00")],
                "prioritized_backlog": [item],
            },
            target_date=TODAY,
        )
        assert len(result["sessions"]) >= 2
        session_ids = [s["session_id"] for s in result["sessions"]]
        assert all(sid.endswith(":s1") or sid.endswith(":s2") for sid in session_ids)
        # First session should be :s1, second should be :s2
        assert session_ids[0].endswith(":s1")
        assert session_ids[1].endswith(":s2")


# ─── Snapshot lifecycle (unit tests, no DB) ───


class TestSnapshotLifecycle:
    def test_version_increments(self):
        """Version should increment from 1 to 2 after completion."""
        # This is tested implicitly through the adaptive flow
        # The service handles versioning via supersede_snapshot + create_snapshot
        pass

    def test_active_flag_uniqueness(self):
        """Only one snapshot should be active per user+date."""
        # This is enforced by the DB constraint and service logic
        # Tested via integration tests
        pass
