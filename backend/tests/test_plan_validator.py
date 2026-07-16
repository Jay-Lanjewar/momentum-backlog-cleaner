import uuid

from app.services.plan_validator import PlanValidator


class TestPlanValidator:
    def test_valid_plan_passes(self):
        item_id = uuid.uuid4()
        validator = PlanValidator()
        result = validator.validate(
            {
                "sessions": [
                    {
                        "backlog_item_id": str(item_id),
                        "start_time": "06:00",
                        "end_time": "07:00",
                        "reason": "Study math",
                    }
                ],
                "daily_message": "Great job!",
                "overflow": [],
            },
            valid_backlog_ids={item_id},
            available_windows=[
                {"start": "06:00", "end": "08:00", "total_minutes": 120}
            ],
        )
        assert result is not None
        assert len(result["sessions"]) == 1
        assert result["sessions"][0]["backlog_item_id"] == str(item_id)
        assert result["daily_message"] == "Great job!"

    def test_invalid_id_rejected(self):
        valid_id = uuid.uuid4()
        invalid_id = uuid.uuid4()
        validator = PlanValidator()
        result = validator.validate(
            {
                "sessions": [
                    {
                        "backlog_item_id": str(invalid_id),
                        "start_time": "06:00",
                        "end_time": "07:00",
                        "reason": "Study",
                    }
                ],
                "daily_message": "ok",
                "overflow": [],
            },
            valid_backlog_ids={valid_id},
            available_windows=[{"start": "06:00", "end": "08:00", "total_minutes": 120}],
        )
        assert result is not None
        assert len(result["sessions"]) == 0
        assert str(valid_id) in result["overflow"]

    def test_overlapping_sessions_rejected(self):
        item_id_1 = uuid.uuid4()
        item_id_2 = uuid.uuid4()
        validator = PlanValidator()
        result = validator.validate(
            {
                "sessions": [
                    {
                        "backlog_item_id": str(item_id_1),
                        "start_time": "06:00",
                        "end_time": "07:30",
                        "reason": "First",
                    },
                    {
                        "backlog_item_id": str(item_id_2),
                        "start_time": "07:00",
                        "end_time": "08:00",
                        "reason": "Overlap",
                    },
                ],
                "daily_message": "ok",
                "overflow": [],
            },
            valid_backlog_ids={item_id_1, item_id_2},
            available_windows=[{"start": "06:00", "end": "08:00", "total_minutes": 120}],
        )
        assert result is not None
        assert len(result["sessions"]) == 1
        assert result["sessions"][0]["backlog_item_id"] == str(item_id_1)
        assert str(item_id_2) in result["overflow"]

    def test_session_exceeds_window_rejected(self):
        item_id = uuid.uuid4()
        validator = PlanValidator()
        result = validator.validate(
            {
                "sessions": [
                    {
                        "backlog_item_id": str(item_id),
                        "start_time": "05:00",
                        "end_time": "07:00",
                        "reason": "Before window",
                    }
                ],
                "daily_message": "ok",
                "overflow": [],
            },
            valid_backlog_ids={item_id},
            available_windows=[{"start": "06:00", "end": "08:00", "total_minutes": 120}],
        )
        assert result is not None
        assert len(result["sessions"]) == 0

    def test_invalid_json_structure_returns_none(self):
        validator = PlanValidator()
        assert validator.validate(None, set(), []) is None
        assert validator.validate("not a dict", set(), []) is None
        assert validator.validate({"sessions": "not a list", "overflow": [], "daily_message": ""}, set(), []) is None

    def test_overflow_adds_unscheduled_ids(self):
        valid_id = uuid.uuid4()
        validator = PlanValidator()
        result = validator.validate(
            {
                "sessions": [],
                "daily_message": "",
                "overflow": [],
            },
            valid_backlog_ids={valid_id},
            available_windows=[{"start": "06:00", "end": "08:00", "total_minutes": 120}],
        )
        assert result is not None
        assert str(valid_id) in result["overflow"]

    def test_duplicate_session_rejected(self):
        item_id = uuid.uuid4()
        validator = PlanValidator()
        result = validator.validate(
            {
                "sessions": [
                    {
                        "backlog_item_id": str(item_id),
                        "start_time": "06:00",
                        "end_time": "07:00",
                        "reason": "First",
                    },
                    {
                        "backlog_item_id": str(item_id),
                        "start_time": "07:00",
                        "end_time": "08:00",
                        "reason": "Duplicate",
                    },
                ],
                "daily_message": "",
                "overflow": [],
            },
            valid_backlog_ids={item_id},
            available_windows=[{"start": "06:00", "end": "08:00", "total_minutes": 120}],
        )
        assert result is not None
        assert len(result["sessions"]) == 1

    def test_exceeds_total_available_time_rejected(self):
        item_id_1 = uuid.uuid4()
        item_id_2 = uuid.uuid4()
        validator = PlanValidator()
        result = validator.validate(
            {
                "sessions": [
                    {
                        "backlog_item_id": str(item_id_1),
                        "start_time": "06:00",
                        "end_time": "07:00",
                        "reason": "First",
                    },
                    {
                        "backlog_item_id": str(item_id_2),
                        "start_time": "07:00",
                        "end_time": "09:00",
                        "reason": "Exceeds",
                    },
                ],
                "daily_message": "",
                "overflow": [],
            },
            valid_backlog_ids={item_id_1, item_id_2},
            available_windows=[{"start": "06:00", "end": "08:00", "total_minutes": 120}],
        )
        assert result is not None
        assert len(result["sessions"]) == 1
        assert str(item_id_2) in result["overflow"]

    def test_empty_plan_returns_none(self):
        validator = PlanValidator()
        result = validator.validate(
            {"sessions": [], "daily_message": "", "overflow": []},
            valid_backlog_ids=set(),
            available_windows=[],
        )
        assert result is None

    def test_invalid_time_format_rejected(self):
        item_id = uuid.uuid4()
        validator = PlanValidator()
        result = validator.validate(
            {
                "sessions": [
                    {
                        "backlog_item_id": str(item_id),
                        "start_time": "invalid",
                        "end_time": "07:00",
                        "reason": "",
                    }
                ],
                "daily_message": "",
                "overflow": [],
            },
            valid_backlog_ids={item_id},
            available_windows=[{"start": "06:00", "end": "08:00", "total_minutes": 120}],
        )
        assert result is not None
        assert len(result["sessions"]) == 0
