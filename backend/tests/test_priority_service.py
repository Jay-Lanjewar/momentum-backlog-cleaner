import uuid
from datetime import date, timedelta

import pytest

from app.domain.models import BacklogItem, Goal
from app.services.priority_service import score_item, prioritize_backlog, get_overdue_items


def make_backlog_item(
    title: str = "Test task",
    priority: int = 3,
    estimated_minutes: int | None = 60,
    due_date: date | None = None,
    status: str = "pending",
    course_id: uuid.UUID | None = None,
) -> BacklogItem:
    return BacklogItem(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        course_id=course_id or uuid.uuid4(),
        title=title,
        priority=priority,
        estimated_minutes=estimated_minutes,
        due_date=due_date,
        status=status,
    )


def make_goal(title: str = "Some goal") -> Goal:
    return Goal(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        title=title,
        status="active",
    )


class TestScoreItem:
    def test_priority_1_scores_high(self):
        item = make_backlog_item(priority=1)
        score = score_item(item)
        assert score > 90

    def test_priority_4_scores_low(self):
        item = make_backlog_item(priority=4)
        score = score_item(item)
        assert score < 90

    def test_overdue_gets_boost(self):
        yesterday = date.today() - timedelta(days=1)
        item = make_backlog_item(due_date=yesterday)
        overdue_score = score_item(item)
        item2 = make_backlog_item()
        normal_score = score_item(item2)
        assert overdue_score > normal_score

    def test_due_today_gets_high_score(self):
        today = date.today()
        item = make_backlog_item(due_date=today)
        score = score_item(item)
        assert score >= 150

    def test_quick_win_bonus(self):
        quick = make_backlog_item(estimated_minutes=10)
        long = make_backlog_item(estimated_minutes=180)
        assert score_item(quick) > score_item(long)

    def test_goal_association_bonus(self):
        item = make_backlog_item(title="Complete math homework")
        goals = [make_goal(title="math")]
        with_goal = score_item(item, goals)
        without_goal = score_item(item, [])
        assert with_goal > without_goal

    def test_no_due_date_gets_base_score(self):
        item = make_backlog_item(due_date=None)
        score = score_item(item)
        assert score > 0


class TestPrioritizeBacklog:
    def test_returns_sorted_by_score(self):
        items = [
            make_backlog_item(title="Low", priority=4),
            make_backlog_item(title="High", priority=1),
        ]
        scored = prioritize_backlog(items)
        assert scored[0][0].title == "High"
        assert scored[0][1] > scored[1][1]

    def test_filters_completed_items(self):
        items = [
            make_backlog_item(title="Pending", status="pending"),
            make_backlog_item(title="Completed", status="completed"),
        ]
        scored = prioritize_backlog(items, status_filter=None)
        assert len(scored) == 1
        assert scored[0][0].title == "Pending"

    def test_returns_score_tuple(self):
        items = [make_backlog_item()]
        scored = prioritize_backlog(items)
        assert len(scored) == 1
        assert isinstance(scored[0], tuple)
        assert isinstance(scored[0][1], int)


class TestGetOverdueItems:
    def test_returns_overdue_items(self):
        yesterday = date.today() - timedelta(days=1)
        items = [
            make_backlog_item(title="Overdue", due_date=yesterday),
            make_backlog_item(title="Not overdue", due_date=date.today() + timedelta(days=5)),
            make_backlog_item(title="No due date", due_date=None),
        ]
        overdue = get_overdue_items(items)
        assert len(overdue) == 1
        assert overdue[0].title == "Overdue"

    def test_skips_completed_overdue(self):
        yesterday = date.today() - timedelta(days=1)
        items = [
            make_backlog_item(title="Completed overdue", due_date=yesterday, status="completed"),
        ]
        overdue = get_overdue_items(items)
        assert len(overdue) == 0
