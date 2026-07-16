import uuid

from app.services.deterministic_planner import generate_deterministic_plan


class TestDeterministicPlanner:
    def test_single_item_fits_in_window(self):
        item_id = uuid.uuid4()
        result = generate_deterministic_plan({
            "available_windows": [
                {"start": "06:00", "end": "08:00", "total_minutes": 120}
            ],
            "prioritized_backlog": [
                {
                    "id": item_id,
                    "title": "Math Homework",
                    "score": 100,
                    "priority": 1,
                    "estimated_minutes": 60,
                    "course_name": "Math",
                }
            ],
        })
        assert len(result["sessions"]) == 1
        assert result["sessions"][0]["backlog_item_id"] == str(item_id)
        assert len(result["overflow"]) == 0

    def test_multiple_items_scheduled(self):
        id_1 = uuid.uuid4()
        id_2 = uuid.uuid4()
        result = generate_deterministic_plan({
            "available_windows": [
                {"start": "06:00", "end": "08:00", "total_minutes": 120}
            ],
            "prioritized_backlog": [
                {
                    "id": id_1, "title": "Task 1", "score": 100, "priority": 1,
                    "estimated_minutes": 30, "course_name": "A",
                },
                {
                    "id": id_2, "title": "Task 2", "score": 90, "priority": 2,
                    "estimated_minutes": 30, "course_name": "B",
                },
            ],
        })
        assert len(result["sessions"]) == 2
        assert len(result["overflow"]) == 0

    def test_overflow_when_not_enough_time(self):
        id_1 = uuid.uuid4()
        id_2 = uuid.uuid4()
        result = generate_deterministic_plan({
            "available_windows": [
                {"start": "06:00", "end": "07:00", "total_minutes": 60}
            ],
            "prioritized_backlog": [
                {
                    "id": id_1, "title": "Task 1", "score": 100, "priority": 1,
                    "estimated_minutes": 45, "course_name": "A",
                },
                {
                    "id": id_2, "title": "Task 2", "score": 90, "priority": 2,
                    "estimated_minutes": 45, "course_name": "B",
                },
            ],
        })
        assert len(result["sessions"]) == 2
        scheduled_ids = {s["backlog_item_id"] for s in result["sessions"]}
        assert str(id_1) in scheduled_ids
        assert str(id_2) in scheduled_ids
        assert str(id_2) in result["overflow"]

    def test_item_split_across_windows(self):
        item_id = uuid.uuid4()
        result = generate_deterministic_plan({
            "available_windows": [
                {"start": "06:00", "end": "07:00", "total_minutes": 60},
                {"start": "08:00", "end": "09:00", "total_minutes": 60},
            ],
            "prioritized_backlog": [
                {
                    "id": item_id, "title": "Long Task", "score": 100, "priority": 1,
                    "estimated_minutes": 90, "course_name": "A",
                },
            ],
        })
        assert len(result["sessions"]) == 2
        assert len(result["overflow"]) >= 1

    def test_higher_priority_scheduled_first(self):
        id_low = uuid.uuid4()
        id_high = uuid.uuid4()
        result = generate_deterministic_plan({
            "available_windows": [
                {"start": "06:00", "end": "06:30", "total_minutes": 30}
            ],
            "prioritized_backlog": [
                {
                    "id": id_low, "title": "Low", "score": 10, "priority": 4,
                    "estimated_minutes": 30, "course_name": "A",
                },
                {
                    "id": id_high, "title": "High", "score": 100, "priority": 1,
                    "estimated_minutes": 30, "course_name": "B",
                },
            ],
        })
        scheduled_ids = {s["backlog_item_id"] for s in result["sessions"]}
        assert str(id_high) in scheduled_ids
        assert str(id_low) in result["overflow"]

    def test_no_windows_returns_empty_sessions(self):
        item_id = uuid.uuid4()
        result = generate_deterministic_plan({
            "available_windows": [],
            "prioritized_backlog": [
                {
                    "id": item_id, "title": "Task", "score": 100, "priority": 1,
                    "estimated_minutes": 30, "course_name": "A",
                },
            ],
        })
        assert len(result["sessions"]) == 0
        assert str(item_id) in result["overflow"]

    def test_no_backlog_returns_empty(self):
        result = generate_deterministic_plan({
            "available_windows": [
                {"start": "06:00", "end": "08:00", "total_minutes": 120}
            ],
            "prioritized_backlog": [],
        })
        assert len(result["sessions"]) == 0
        assert len(result["overflow"]) == 0

    def test_daily_message_included(self):
        result = generate_deterministic_plan({
            "available_windows": [],
            "prioritized_backlog": [],
        })
        assert "daily_message" in result
        assert result["daily_message"]

    def test_default_estimated_minutes(self):
        item_id = uuid.uuid4()
        result = generate_deterministic_plan({
            "available_windows": [
                {"start": "06:00", "end": "07:00", "total_minutes": 60}
            ],
            "prioritized_backlog": [
                {
                    "id": item_id, "title": "Task", "score": 100, "priority": 1,
                    "estimated_minutes": None, "course_name": "A",
                },
            ],
        })
        assert len(result["sessions"]) == 1
