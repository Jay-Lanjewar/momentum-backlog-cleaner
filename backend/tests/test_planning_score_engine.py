import pytest
from datetime import date, datetime, timedelta

from app.scoring import (
    PlanningContext,
    PlanningScoreEngine,
    PlanningScoreResult,
    ScoringTask,
    score,
)
from app.scoring.contract import FactorContribution
from app.scoring.factor import ScoringFactor


TODAY = date(2026, 8, 2)


def task(**kwargs) -> ScoringTask:
    defaults = {"title": "Task", "priority": 3}
    defaults.update(kwargs)
    return ScoringTask(**defaults)


def ctx(**kwargs) -> PlanningContext:
    defaults = {"today": TODAY}
    defaults.update(kwargs)
    return PlanningContext(**defaults)


class TestPublicApi:
    def test_score_is_callable(self):
        assert callable(score)

    def test_score_returns_planning_score_result(self):
        result = score(task())
        assert isinstance(result, PlanningScoreResult)

    def test_result_has_typed_fields(self):
        result = score(task())
        assert isinstance(result.score, int)
        assert isinstance(result.reasoning, list)
        assert all(isinstance(line, str) for line in result.reasoning)

    def test_score_uses_default_context_when_omitted(self):
        result = score(task())
        assert isinstance(result, PlanningScoreResult)

    def test_deterministic(self):
        t = task(priority=2, due_date=TODAY)
        c = ctx(unfinished_minutes=30)
        assert score(t, c) == score(t, c)


class TestManualPriorityFactor:
    @pytest.mark.parametrize(
        ("priority", "expected"),
        [(1, 40), (2, 30), (3, 20), (4, 10)],
    )
    def test_known_priorities(self, priority, expected):
        result = score(task(priority=priority), ctx())
        assert result.score == expected

    def test_default_priority_when_missing(self):
        assert score(task(priority=None), ctx()).score == 20

    def test_unknown_priority_falls_back(self):
        assert score(task(priority=9), ctx()).score == 20

    def test_reasoning_mentions_priority(self):
        assert any("Priority" in line for line in score(task(priority=1), ctx()).reasoning)


class TestOverdueFactor:
    def test_explicit_overdue_flag(self):
        result = score(task(overdue=True), ctx())
        assert result.score == 40
        assert any("overdue" in line.lower() for line in result.reasoning)

    def test_explicit_not_overdue_flag(self):
        assert score(task(overdue=False), ctx()).score == 20

    def test_due_date_before_today_is_overdue(self):
        result = score(task(due_date=TODAY - timedelta(days=1)), ctx())
        assert result.score == 60

    def test_due_today_is_not_overdue(self):
        assert score(task(due_date=TODAY), ctx()).score == 40

    def test_no_due_date_not_overdue(self):
        assert score(task(due_date=None), ctx()).score == 20

    def test_overdue_reasoning(self):
        result = score(task(due_date=TODAY - timedelta(days=1)), ctx())
        assert any("overdue" in line.lower() for line in result.reasoning)


class TestDueProximityFactor:
    def test_due_past_gets_max_points(self):
        result = score(task(due_date=TODAY - timedelta(days=5)), ctx())
        assert result.score == 60
        assert any("past due" in line.lower() for line in result.reasoning)

    def test_due_today(self):
        assert score(task(due_date=TODAY), ctx()).score == 40

    @pytest.mark.parametrize(
        ("days", "expected"),
        [(1, 35), (2, 35), (3, 30), (7, 30), (8, 25), (14, 25), (15, 20)],
    )
    def test_due_in_future(self, days, expected):
        result = score(task(due_date=TODAY + timedelta(days=days)), ctx())
        assert result.score == expected
        assert any(f"Due in {days} days" in line for line in result.reasoning)

    def test_exam_proximity_used_when_no_due_date(self):
        result = score(task(due_date=None), ctx(exam_date=TODAY + timedelta(days=1)))
        assert result.score == 35
        assert any("Due in 1 days" in line for line in result.reasoning)

    def test_earlier_of_due_and_exam_wins(self):
        result = score(
            task(due_date=TODAY + timedelta(days=10)),
            ctx(exam_date=TODAY + timedelta(days=1)),
        )
        assert result.score == 35
        assert any("Due in 1 days" in line for line in result.reasoning)

    def test_exam_same_day_as_due(self):
        result = score(
            task(due_date=TODAY + timedelta(days=2)),
            ctx(exam_date=TODAY + timedelta(days=2)),
        )
        assert result.score == 35

    def test_exam_in_past_counts_as_past_due(self):
        result = score(task(due_date=None), ctx(exam_date=TODAY - timedelta(days=1)))
        assert result.score == 40

    def test_no_dates_gets_minimum_proximity_points(self):
        assert score(task(), ctx()).score == 20

    def test_datetime_accepted(self):
        result = score(
            task(due_date=datetime(2026, 8, 3, 10, 30)),
            ctx(),
        )
        assert result.score == 35


class TestEstimatedDurationFactor:
    @pytest.mark.parametrize(
        ("minutes", "expected"),
        [(None, 20), (0, 20), (120, 30), (90, 27), (60, 27), (30, 25), (15, 23), (5, 21)],
    )
    def test_duration_buckets(self, minutes, expected):
        assert score(task(estimated_minutes=minutes), ctx()).score == expected

    def test_reasoning_mentions_minutes(self):
        result = score(task(estimated_minutes=90), ctx())
        assert any("90 minutes" in line for line in result.reasoning)


class TestUnfinishedSessionFactor:
    def test_unfinished_minutes_gives_points(self):
        result = score(task(), ctx(unfinished_minutes=45))
        assert result.score == 30
        assert any("unfinished" in line.lower() for line in result.reasoning)

    def test_no_unfinished_minutes(self):
        assert score(task(), ctx(unfinished_minutes=0)).score == 20

    def test_negative_unfinished_treated_as_zero(self):
        assert score(task(), ctx(unfinished_minutes=-5)).score == 20


class TestCombinedScoring:
    def test_score_within_0_to_100(self):
        for task_kwargs in (
            {"priority": 1, "due_date": TODAY - timedelta(days=1)},
            {"priority": 4, "due_date": TODAY + timedelta(days=60)},
        ):
            result = score(task(**task_kwargs), ctx(unfinished_minutes=999))
            assert 0 <= result.score <= 100

    def test_score_capped_at_100(self):
        result = score(
            task(priority=1, overdue=True, due_date=TODAY - timedelta(days=1), estimated_minutes=300),
            ctx(unfinished_minutes=999),
        )
        assert result.score == 100

    def test_reasoning_len_matches_default_factors(self):
        engine = PlanningScoreEngine()
        assert len(engine.factors) == 5
        result = engine.score(task(), ctx())
        assert len(result.reasoning) == len(engine.factors)


class TestPluggableFactors:
    def test_custom_factors_replaced_defaults(self):
        class AlwaysFive(ScoringFactor):
            def evaluate(self, task, context):
                return FactorContribution(5, "constant five")

        engine = PlanningScoreEngine(factors=[AlwaysFive()])
        result = engine.score(task(priority=1), ctx())
        assert result.score == 5
        assert result.reasoning == ["constant five"]

    def test_factors_property_returns_tuple(self):
        engine = PlanningScoreEngine()
        assert isinstance(engine.factors, tuple)
        assert all(isinstance(f, ScoringFactor) for f in engine.factors)

    def test_empty_factors(self):
        engine = PlanningScoreEngine(factors=[])
        result = engine.score(task(), ctx())
        assert result.score == 0
        assert result.reasoning == []

    def test_custom_factor_reasoning_included(self):
        class Append(ScoringFactor):
            def evaluate(self, task, context):
                return FactorContribution(1, "custom reason")

        result = PlanningScoreEngine(factors=[Append()]).score(task(), ctx())
        assert "custom reason" in result.reasoning
