import uuid
from datetime import date, timedelta

import pytest

from app.domain.models import BacklogItem, Course, Goal, StudentProfile, WeeklySchedule
from app.services.planning_engine import PlanningEngine


USER_ID = uuid.uuid4()


def make_course(name: str = "Mathematics") -> Course:
    return Course(id=uuid.uuid4(), user_id=USER_ID, name=name, color="#6366f1")


def make_backlog(
    course_id: uuid.UUID,
    title: str = "Task",
    priority: int = 3,
    estimated_minutes: int = 60,
    due_date: date | None = None,
    status: str = "pending",
) -> BacklogItem:
    return BacklogItem(
        id=uuid.uuid4(),
        user_id=USER_ID,
        course_id=course_id,
        title=title,
        priority=priority,
        estimated_minutes=estimated_minutes,
        due_date=due_date,
        status=status,
    )


def make_goal(title: str = "Finish syllabus") -> Goal:
    return Goal(id=uuid.uuid4(), user_id=USER_ID, title=title, status="active")


def make_profile(**kwargs) -> StudentProfile:
    defaults = {
        "id": uuid.uuid4(),
        "user_id": USER_ID,
        "sleep_schedule": {"start": "22:00", "end": "06:00"},
        "preferred_study_window": {"earliest_start": "06:00", "latest_end": "22:00"},
        "energy_peak": "morning",
        "daily_target_minutes": 120,
    }
    defaults.update(kwargs)
    return StudentProfile(**defaults)


def make_schedule(**days) -> WeeklySchedule:
    return WeeklySchedule(
        id=uuid.uuid4(),
        user_id=USER_ID,
        schedule=days or {"monday": []},
    )


class TestPlanningEngine:
    def test_available_windows_in_output(self):
        course = make_course()
        profile = make_profile()
        schedule = make_schedule(
            monday=[{"type": "school", "start": "08:00", "end": "14:00"}]
        )
        backlog = [make_backlog(course.id)]
        goals = []

        engine = PlanningEngine(
            profile=profile,
            schedule=schedule,
            courses=[course],
            backlog_items=backlog,
            goals=goals,
        )

        result = engine.compute(target_date=date(2026, 7, 20))

        assert "available_windows" in result
        assert len(result["available_windows"]) > 0
        for w in result["available_windows"]:
            assert "start" in w
            assert "end" in w
            assert "total_minutes" in w
            assert "energy_rating" in w

    def test_prioritized_backlog_in_output(self):
        course = make_course()
        profile = make_profile()
        schedule = make_schedule(monday=[])
        backlog = [
            make_backlog(course.id, title="Low priority", priority=4),
            make_backlog(course.id, title="High priority", priority=1),
        ]
        goals = []

        engine = PlanningEngine(
            profile=profile,
            schedule=schedule,
            courses=[course],
            backlog_items=backlog,
            goals=goals,
        )

        result = engine.compute(target_date=date(2026, 7, 20))

        assert len(result["prioritized_backlog"]) == 2
        assert result["prioritized_backlog"][0]["title"] == "High priority"
        assert result["prioritized_backlog"][0]["score"] > result["prioritized_backlog"][1]["score"]

    def test_course_info_in_backlog_item(self):
        course = make_course(name="Physics")
        profile = make_profile()
        schedule = make_schedule(monday=[])
        backlog = [make_backlog(course.id, title="Homework")]

        engine = PlanningEngine(
            profile=profile,
            schedule=schedule,
            courses=[course],
            backlog_items=backlog,
            goals=[],
        )

        result = engine.compute(target_date=date(2026, 7, 20))

        item = result["prioritized_backlog"][0]
        assert item["course_name"] == "Physics"
        assert item["course_color"] == "#6366f1"

    def test_backlog_health_in_output(self):
        course = make_course()
        profile = make_profile()
        schedule = make_schedule(monday=[])
        backlog = [
            make_backlog(course.id, status="completed"),
            make_backlog(course.id, status="pending"),
        ]

        engine = PlanningEngine(
            profile=profile,
            schedule=schedule,
            courses=[course],
            backlog_items=backlog,
            goals=[],
        )

        result = engine.compute(target_date=date(2026, 7, 20))

        health = result["backlog_health"]
        assert health["total_items"] == 2
        assert health["completed_items"] == 1
        assert health["pending_items"] == 1
        assert "health_score" in health

    def test_total_required_and_available(self):
        course = make_course()
        profile = make_profile(daily_target_minutes=120)
        schedule = make_schedule(monday=[])
        backlog = [
            make_backlog(course.id, estimated_minutes=60),
            make_backlog(course.id, estimated_minutes=90),
        ]

        engine = PlanningEngine(
            profile=profile,
            schedule=schedule,
            courses=[course],
            backlog_items=backlog,
            goals=[],
        )

        result = engine.compute(target_date=date(2026, 7, 20))

        assert result["total_required_minutes"] == 150
        assert result["total_available_minutes"] >= 0

    def test_estimated_days_to_clear(self):
        course = make_course()
        profile = make_profile(daily_target_minutes=120)
        schedule = make_schedule(monday=[])
        backlog = [make_backlog(course.id, estimated_minutes=120)]

        engine = PlanningEngine(
            profile=profile,
            schedule=schedule,
            courses=[course],
            backlog_items=backlog,
            goals=[],
        )

        result = engine.compute(target_date=date(2026, 7, 20))

        assert result["estimated_days_to_clear"] is not None
        assert result["estimated_days_to_clear"] > 0

    def test_no_profile_uses_defaults(self):
        course = make_course()
        backlog = [make_backlog(course.id)]

        engine = PlanningEngine(
            profile=None,
            schedule=None,
            courses=[course],
            backlog_items=backlog,
            goals=[],
        )

        result = engine.compute(target_date=date(2026, 7, 20))

        assert result["available_windows"] == []
        assert len(result["prioritized_backlog"]) == 1
        assert result["backlog_health"]["total_items"] == 1

    def test_overdue_flag_on_backlog_items(self):
        course = make_course()
        profile = make_profile()
        schedule = make_schedule(monday=[])
        yesterday = date.today() - timedelta(days=1)
        backlog = [
            make_backlog(course.id, title="Overdue", due_date=yesterday),
            make_backlog(course.id, title="Future", due_date=date.today() + timedelta(days=10)),
        ]

        engine = PlanningEngine(
            profile=profile,
            schedule=schedule,
            courses=[course],
            backlog_items=backlog,
            goals=[],
        )

        result = engine.compute(target_date=date.today())

        overdue_items = [b for b in result["prioritized_backlog"] if b["overdue"]]
        assert len(overdue_items) == 1
        assert overdue_items[0]["title"] == "Overdue"
