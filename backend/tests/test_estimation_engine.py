import pytest
from collections import UserDict

from app.estimation import (
    EstimationEngine,
    EstimationResult,
    EstimationTask,
    EstimatorStrategy,
    RuleBasedEstimator,
    estimate,
)


class TestPublicApi:
    def test_estimate_is_callable(self):
        assert callable(estimate)

    def test_estimate_returns_estimation_result(self):
        result = estimate(EstimationTask(title="Read chapter 5"))
        assert isinstance(result, EstimationResult)

    def test_result_has_typed_fields(self):
        result = estimate(EstimationTask(title="Solve exercise 4"))
        assert isinstance(result.estimated_minutes, int)
        assert isinstance(result.confidence, float)
        assert isinstance(result.reasoning, list)
        assert all(isinstance(line, str) for line in result.reasoning)

    def test_estimate_accepts_mapping(self):
        result = estimate({"title": "Solve exercise 4", "priority": 3})
        assert result.estimated_minutes == 45
        assert result.confidence == 0.75

    def test_estimate_accepts_mapping_with_missing_fields(self):
        result = estimate({"title": None, "description": None, "priority": None})
        assert result.estimated_minutes == 15
        assert result.confidence == 0.30

    def test_estimate_accepts_non_dict_mapping(self):
        result = estimate(UserDict({"title": "Solve exercise 4", "priority": 3}))
        assert result.estimated_minutes == 45
        assert result.confidence == 0.75

    def test_estimate_coerces_non_string_title(self):
        result = estimate({"title": 123, "priority": 3})
        assert isinstance(result.estimated_minutes, int)

    def test_estimate_rejects_invalid_input(self):
        with pytest.raises(TypeError):
            estimate(42)

    def test_deterministic(self):
        task = EstimationTask(title="Solve exercise 4", priority=3)
        assert estimate(task) == estimate(task)


class TestReadingTasks:
    @pytest.mark.parametrize(
        ("priority", "minutes"),
        [(1, 45), (3, 40), (4, 30)],
    )
    def test_reading_estimate(self, priority, minutes):
        result = estimate(EstimationTask(title="Read chapter 5", priority=priority))
        assert result.estimated_minutes == minutes
        assert result.confidence == 0.75
        assert "Task contains reading keywords" in result.reasoning

    def test_reading_with_default_priority(self):
        result = estimate(EstimationTask(title="Read chapter 5"))
        assert result.estimated_minutes == 40
        assert "Difficulty is medium (default)" in result.reasoning


class TestExerciseTasks:
    @pytest.mark.parametrize(
        ("priority", "minutes"),
        [(1, 55), (3, 45), (4, 40)],
    )
    def test_exercise_estimate(self, priority, minutes):
        result = estimate(EstimationTask(title="Solve exercise 4", priority=priority))
        assert result.estimated_minutes == minutes
        assert result.confidence == 0.75
        assert "Task contains exercise keywords" in result.reasoning

    def test_exercise_example_reasoning(self):
        result = estimate(EstimationTask(title="Solve exercise 4", priority=3))
        assert result.reasoning == [
            "Task contains exercise keywords",
            "Difficulty is medium",
            "Rule-based estimate",
        ]


class TestRevisionTasks:
    @pytest.mark.parametrize(
        ("priority", "minutes"),
        [(1, 45), (3, 40), (4, 30)],
    )
    def test_revision_estimate(self, priority, minutes):
        result = estimate(
            EstimationTask(title="Make revision flashcards", priority=priority)
        )
        assert result.estimated_minutes == minutes
        assert result.confidence == 0.75
        assert "Task contains revision keywords" in result.reasoning


class TestMixedTasks:
    def test_mixed_reading_and_exercise(self):
        result = estimate(EstimationTask(title="Read chapter 5 then solve exercises"))
        assert result.estimated_minutes == 45
        assert result.confidence == 0.85

    def test_mixed_revision_and_reading(self):
        result = estimate(EstimationTask(title="Revise chapter 3", priority=2))
        assert result.estimated_minutes == 45
        assert result.confidence == 0.85

    def test_mixed_reasoning_lists_all_categories(self):
        result = estimate(EstimationTask(title="Read chapter 5 then solve exercises"))
        assert "Task contains reading keywords" in result.reasoning
        assert "Task contains exercise keywords" in result.reasoning
        assert "Task contains multiple activity types" in result.reasoning
        assert result.reasoning[-1] == "Rule-based estimate"


class TestUnknownTasks:
    @pytest.mark.parametrize(
        ("priority", "minutes"),
        [(1, 50), (3, 45), (4, 35)],
    )
    def test_unknown_estimate(self, priority, minutes):
        result = estimate(EstimationTask(title="Submit project report", priority=priority))
        assert result.estimated_minutes == minutes
        assert result.confidence == 0.50
        assert "No known activity keywords matched" in result.reasoning

    def test_unknown_with_default_priority(self):
        result = estimate(EstimationTask(title="Submit project report"))
        assert result.estimated_minutes == 45
        assert result.confidence == 0.50
        assert "Difficulty is medium (default)" in result.reasoning

    def test_out_of_range_priority_falls_back_to_default(self):
        result = estimate(EstimationTask(title="Solve exercise 4", priority=9))
        assert result.estimated_minutes == 45
        assert "Difficulty is medium" in result.reasoning


class TestEmptyTasks:
    def test_empty_task(self):
        result = estimate(EstimationTask())
        assert result.estimated_minutes == 15
        assert result.confidence == 0.30
        assert result.reasoning == [
            "Task is empty",
            "Difficulty is medium (default)",
            "Rule-based estimate",
        ]

    def test_whitespace_only_title_is_empty(self):
        result = estimate(EstimationTask(title="   "))
        assert result.estimated_minutes == 15
        assert result.confidence == 0.30

    def test_empty_title_with_whitespace_description_is_empty(self):
        result = estimate(EstimationTask(title="  ", description=" \n\t "))
        assert result.estimated_minutes == 15
        assert result.confidence == 0.30


class TestConfidence:
    def test_single_category_confidence(self):
        assert estimate(EstimationTask(title="Read chapter 5")).confidence == 0.75

    def test_mixed_confidence(self):
        assert estimate(EstimationTask(title="Read and practice")).confidence == 0.85

    def test_unknown_confidence(self):
        assert estimate(EstimationTask(title="Prepare report")).confidence == 0.50

    def test_empty_confidence(self):
        assert estimate(EstimationTask()).confidence == 0.30

    def test_boost_when_keywords_in_title_and_description(self):
        task = EstimationTask(title="Read chapter 5", description="read pages 10 to 20")
        result = estimate(task)
        assert result.confidence == 0.80

    def test_boost_mixed_when_keywords_in_title_and_description(self):
        task = EstimationTask(title="Read chapter 5", description="solve the exercises")
        result = estimate(task)
        assert result.confidence == 0.90

    @pytest.mark.parametrize(
        "task",
        [
            EstimationTask(),
            EstimationTask(title="Read chapter 5"),
            EstimationTask(title="Solve exercise 4", priority=1),
            EstimationTask(title="Read and practice"),
            EstimationTask(title="Submit report"),
            EstimationTask(title="Read chapter 5", description="solve the exercises"),
        ],
    )
    def test_confidence_within_bounds(self, task):
        result = estimate(task)
        assert 0 <= result.confidence <= 1


class TestReasoning:
    def test_reasoning_ends_with_rule_based(self):
        result = estimate(EstimationTask(title="Solve exercise 4"))
        assert result.reasoning[-1] == "Rule-based estimate"

    def test_reasoning_mentions_difficulty(self):
        result = estimate(EstimationTask(title="Solve exercise 4", priority=1))
        assert "Difficulty is high" in result.reasoning

    def test_reasoning_is_deterministic(self):
        task = EstimationTask(title="Read chapter 5 then solve exercises")
        assert estimate(task).reasoning == estimate(task).reasoning


class TestStrategyPluggability:
    class FixedStrategy(EstimatorStrategy):
        def estimate(self, task):
            return EstimationResult(estimated_minutes=10, confidence=0.5, reasoning=["custom"])

    def test_custom_strategy_is_used(self):
        engine = EstimationEngine(strategy=self.FixedStrategy())
        result = engine.estimate(EstimationTask(title="Anything"))
        assert result.estimated_minutes == 10
        assert result.reasoning == ["custom"]

    def test_default_strategy_is_rule_based(self):
        result = EstimationEngine().estimate(EstimationTask(title="Read chapter 5"))
        assert result.estimated_minutes == 40

    def test_rule_based_implements_strategy(self):
        assert isinstance(RuleBasedEstimator(), EstimatorStrategy)

    def test_strategy_is_abstract(self):
        with pytest.raises(TypeError):
            EstimatorStrategy()

    def test_incomplete_strategy_cannot_be_instantiated(self):
        class Incomplete(EstimatorStrategy):
            pass

        with pytest.raises(TypeError):
            Incomplete()
