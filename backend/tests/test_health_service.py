import uuid
from datetime import date, timedelta

import pytest

from app.domain.models import BacklogItem
from app.services.health_service import compute_backlog_health


def make_backlog_item(
    status: str = "pending",
    due_date: date | None = None,
    estimated_minutes: int = 60,
) -> BacklogItem:
    return BacklogItem(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        course_id=uuid.uuid4(),
        title="Task",
        priority=3,
        estimated_minutes=estimated_minutes,
        due_date=due_date,
        status=status,
    )


class TestComputeBacklogHealth:
    def test_empty_backlog(self):
        health = compute_backlog_health([], total_available_minutes=120)
        assert health["total_items"] == 0
        assert health["health_score"] == "good"
        assert health["pending_items"] == 0

    def test_all_completed(self):
        items = [
            make_backlog_item(status="completed"),
            make_backlog_item(status="completed"),
        ]
        health = compute_backlog_health(items, total_available_minutes=120)
        assert health["completed_items"] == 2
        assert health["pending_items"] == 0

    def test_pending_and_completed(self):
        items = [
            make_backlog_item(status="pending"),
            make_backlog_item(status="completed"),
        ]
        health = compute_backlog_health(items, total_available_minutes=120)
        assert health["pending_items"] == 1
        assert health["completed_items"] == 1

    def test_overdue_detection(self):
        yesterday = date.today() - timedelta(days=1)
        items = [
            make_backlog_item(status="pending", due_date=yesterday),
            make_backlog_item(status="pending", due_date=date.today() + timedelta(days=5)),
        ]
        health = compute_backlog_health(items, total_available_minutes=120)
        assert health["overdue_items"] == 1

    def test_critical_health_with_many_overdue(self):
        items = [
            make_backlog_item(status="pending", due_date=date.today() - timedelta(days=i))
            for i in range(6)
        ]
        health = compute_backlog_health(items, total_available_minutes=60)
        assert health["health_score"] == "critical"

    def test_fair_health_with_some_overdue(self):
        yesterday = date.today() - timedelta(days=1)
        items = [
            make_backlog_item(status="pending", due_date=yesterday),
            make_backlog_item(status="completed"),
        ]
        health = compute_backlog_health(items, total_available_minutes=120)
        assert health["health_score"] in ("fair", "good")

    def test_good_health_no_issues(self):
        items = [
            make_backlog_item(status="pending", due_date=date.today() + timedelta(days=30)),
            make_backlog_item(status="completed"),
        ]
        health = compute_backlog_health(items, total_available_minutes=120)
        assert health["health_score"] == "good"

    def test_estimated_completion_date(self):
        items = [
            make_backlog_item(status="pending", estimated_minutes=120),
            make_backlog_item(status="pending", estimated_minutes=120),
        ]
        health = compute_backlog_health(items, total_available_minutes=120, avg_daily_minutes=120)
        assert health["estimated_completion_date"] is not None
        assert health["estimated_completion_date"] > date.today()

    def test_zero_available_time(self):
        items = [make_backlog_item(status="pending")]
        health = compute_backlog_health(items, total_available_minutes=0, avg_daily_minutes=0)
        assert health["estimated_completion_date"] is None
