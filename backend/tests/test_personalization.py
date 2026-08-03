import dataclasses
import uuid
from datetime import date, timedelta

import pytest

from app.estimation import estimate as rule_estimate
from app.personalization import (
    DEFAULT_FACTOR,
    LearningAdjustment,
    LearningProfile,
    MAX_FACTOR,
    MIN_FACTOR,
    MIN_OBSERVATIONS,
    PersonalizationStrategy,
    PersonalizedEstimator,
    StudyObservation,
    all_factors,
    apply_adjustment,
    build_adjustment,
    record,
    rolling_mean,
    safe_ratio,
)
from app.personalization.engine import PersonalizedEstimator as PE
from app.services.deterministic_planner import generate_deterministic_plan


def obs(est, act, **kw):
    defaults = {"session_type": "reading", "time_of_day": "morning", "task_category": "English"}
    defaults.update(kw)
    return StudyObservation(estimated_minutes=est, actual_minutes=act, **defaults)


def warm_profile(n=3, ratio=0.8, **kw):
    profile = LearningProfile()
    for _ in range(n):
        profile = record(profile, obs(100, round(100 * ratio), **kw))
    return profile


class TestColdStart:
    def test_empty_profile_factor_is_one(self):
        adjustment = build_adjustment(LearningProfile(), session_type="reading")
        assert adjustment.factor == 1.0
        assert adjustment.applied == ()
        assert adjustment.session_type_count == 0

    def test_empty_profile_estimator_is_byte_identical(self):
        task = {"title": "Solve exercise 4", "description": "practice"}
        rule = rule_estimate(task)
        personal = PersonalizedEstimator(LearningProfile()).estimate(task)
        assert personal == rule

    def test_insufficient_history_is_ignored(self):
        profile = warm_profile(n=MIN_OBSERVATIONS - 1, ratio=0.8)
        adjustment = build_adjustment(profile, session_type="reading")
        assert adjustment.factor == 1.0
        assert adjustment.applied == ()
        assert adjustment.session_type_count == MIN_OBSERVATIONS - 1


class TestWarmProfile:
    def test_factors_computed_from_ratios(self):
        profile = warm_profile(n=5, ratio=0.82)
        adjustment = build_adjustment(profile, session_type="reading")
        assert adjustment.applied == ("session_type",)
        assert adjustment.session_type_count == 5
        assert adjustment.session_type_factor == pytest.approx(0.82, abs=1e-9)

    def test_min_observations_enables_adaptation(self):
        profile = warm_profile(n=MIN_OBSERVATIONS, ratio=1.31)
        adjustment = build_adjustment(profile, session_type="reading")
        assert adjustment.session_type_factor == pytest.approx(1.31, abs=1e-9)

    def test_all_three_dimensions(self):
        profile = LearningProfile()
        for est, act, st, cat, tod in [
            (30, 25, "reading", "English", "morning"),
            (60, 50, "reading", "English", "morning"),
            (45, 38, "reading", "English", "morning"),
            (30, 40, "exercises", "Physics", "night"),
            (60, 80, "exercises", "Physics", "night"),
            (45, 60, "exercises", "Physics", "night"),
        ]:
            profile = record(profile, StudyObservation(
                estimated_minutes=est, actual_minutes=act,
                session_type=st, task_category=cat, time_of_day=tod,
            ))
        adjustment = build_adjustment(
            profile, session_type="reading", task_category="Physics", time_of_day="morning"
        )
        assert adjustment.session_type_factor < 1.0
        assert adjustment.category_factor > 1.0
        assert adjustment.time_of_day_factor < 1.0
        assert set(adjustment.applied) == {"session_type", "category", "time_of_day"}

    def test_case_insensitive_matching(self):
        profile = warm_profile(n=3, ratio=0.8, session_type="Reading")
        assert build_adjustment(profile, session_type="reading").session_type_factor == pytest.approx(0.8, abs=1e-9)


class TestOutliers:
    def test_single_extreme_observation_is_dampened(self):
        profile = LearningProfile()
        for i in range(3):
            actual = 30 if i < 2 else 3000
            profile = record(profile, StudyObservation(
                estimated_minutes=30, actual_minutes=actual,
                session_type="reading", time_of_day="morning", task_category="English",
            ))
        adjustment = build_adjustment(profile, session_type="reading")
        # Winsorized ratio (3000/30 -> 2.0): mean = (1.0 + 1.0 + 2.0)/3 = 1.333
        assert adjustment.session_type_factor == pytest.approx(4 / 3, abs=1e-9)

    def test_winsorization_before_averaging(self):
        profile = LearningProfile()
        for est, act in [(30, 3), (30, 3), (30, 3)]:
            profile = record(profile, StudyObservation(
                estimated_minutes=est, actual_minutes=act,
                session_type="reading", time_of_day="morning", task_category="English",
            ))
        adjustment = build_adjustment(profile, session_type="reading")
        assert adjustment.session_type_factor == MIN_FACTOR


class TestRollingAverage:
    def test_only_most_recent_window_counts(self):
        profile = LearningProfile()
        # 40 observations: first 20 at ratio 2.0, last 20 at ratio 1.0
        for i in range(40):
            est, act = (30, 60) if i < 20 else (30, 30)
            profile = record(profile, StudyObservation(
                estimated_minutes=est, actual_minutes=act,
                session_type="reading", time_of_day="morning", task_category="English",
            ))
        adjustment = build_adjustment(profile, session_type="reading")
        assert adjustment.session_type_count == 40
        # rolling window of 20 ignores the first 20 (2.0) observations
        assert adjustment.session_type_factor == pytest.approx(1.0, abs=1e-9)

    def test_new_observations_shift_the_mean(self):
        profile = warm_profile(n=5, ratio=1.5)
        before = build_adjustment(profile, session_type="reading")
        profile = record(profile, obs(30, 15))  # ratio 0.5
        profile = record(profile, obs(30, 15))
        profile = record(profile, obs(30, 15))
        after = build_adjustment(profile, session_type="reading")
        assert after.session_type_factor < before.session_type_factor


class TestClamping:
    def test_dimension_factor_clamped_high(self):
        profile = LearningProfile()
        for _ in range(3):
            profile = record(profile, obs(10, 100))  # ratio 10 -> 2.0
        adjustment = build_adjustment(profile, session_type="reading")
        assert adjustment.session_type_factor == MAX_FACTOR

    def test_dimension_factor_clamped_low(self):
        profile = LearningProfile()
        for _ in range(3):
            profile = record(profile, obs(100, 1))  # ratio 0.01 -> 0.5
        adjustment = build_adjustment(profile, session_type="reading")
        assert adjustment.session_type_factor == MIN_FACTOR

    def test_combined_factor_clamped(self):
        profile = LearningProfile()
        for _ in range(3):
            profile = record(profile, obs(100, 1))  # each dimension 0.5
            profile = record(profile, obs(10, 100))  # and 2.0
        adjustment = build_adjustment(
            profile, session_type="reading", task_category="English", time_of_day="morning"
        )
        assert MIN_FACTOR <= adjustment.factor <= MAX_FACTOR

    def test_apply_adjustment_rounds_and_floors(self):
        assert apply_adjustment(100, LearningAdjustment(factor=0.82)) == 82
        assert apply_adjustment(45, LearningAdjustment(factor=1.31)) == 59
        assert apply_adjustment(1, LearningAdjustment(factor=0.5)) == 1


class TestDeterminism:
    def test_repeated_queries_identical(self):
        profile = warm_profile(n=6, ratio=0.8)
        a = build_adjustment(profile, session_type="reading", task_category="English", time_of_day="morning")
        b = build_adjustment(profile, session_type="reading", task_category="English", time_of_day="morning")
        assert a == b

    def test_all_factors_deterministic_and_sorted(self):
        profile = warm_profile(n=4, ratio=0.9)
        profile = record(profile, obs(30, 40, session_type="exercises"))
        first = all_factors(profile)
        second = all_factors(profile)
        assert first == second
        assert list(first["session_type"].keys()) == sorted(first["session_type"].keys())

    def test_statistics_helpers_edge_cases(self):
        assert safe_ratio(30, 0) is None
        assert safe_ratio(15, 30) == 0.5
        assert rolling_mean([], 5) == 0.0
        assert rolling_mean([1.0, 2.0], 1) == 2.0

    def test_direct_observation_with_zero_estimate_skipped(self):
        profile = LearningProfile(
            observations=(
                StudyObservation(estimated_minutes=0, actual_minutes=30,
                                 session_type="reading", time_of_day="morning",
                                 task_category="English"),
                StudyObservation(estimated_minutes=100, actual_minutes=82,
                                 session_type="reading", time_of_day="morning",
                                 task_category="English"),
                StudyObservation(estimated_minutes=100, actual_minutes=82,
                                 session_type="reading", time_of_day="morning",
                                 task_category="English"),
                StudyObservation(estimated_minutes=100, actual_minutes=82,
                                 session_type="reading", time_of_day="morning",
                                 task_category="English"),
            )
        )
        adjustment = build_adjustment(profile, session_type="reading")
        assert adjustment.session_type_count == 3
        assert adjustment.session_type_factor == pytest.approx(0.82, abs=1e-9)

    def test_all_factors_skips_incomplete_and_empty_labels(self):
        profile = LearningProfile()
        for _ in range(3):
            profile = record(profile, obs(100, 50, completion_pct=0.2))  # incomplete
        profile = record(profile, StudyObservation(
            estimated_minutes=100, actual_minutes=90,
            session_type="revision", time_of_day="day", task_category="",
        ))
        profile = record(profile, StudyObservation(
            estimated_minutes=100, actual_minutes=70,
            session_type="revision", time_of_day="day", task_category="",
        ))
        profile = record(profile, StudyObservation(
            estimated_minutes=100, actual_minutes=90,
            session_type="revision", time_of_day="day", task_category="",
        ))
        factors = all_factors(profile)
        assert "reading" not in factors["session_type"]  # incomplete obs ignored
        assert "revision" in factors["session_type"]  # empty category label skipped safely

    def test_profile_property(self):
        profile = warm_profile(n=3)
        estimator = PersonalizedEstimator(profile)
        assert estimator.profile is profile


class TestNoDb:
    def test_record_is_pure(self):
        profile = LearningProfile()
        profile = record(profile, obs(30, 25))
        assert len(profile.observations) == 1
        assert LearningProfile().observations == ()

    def test_record_validates(self):
        profile = LearningProfile()
        with pytest.raises(ValueError):
            record(profile, obs(0, 25))
        with pytest.raises(ValueError):
            record(profile, obs(30, -1))
        with pytest.raises(TypeError):
            record(profile, {"estimated_minutes": 30, "actual_minutes": 25})

    def test_completion_filter(self):
        profile = LearningProfile()
        for _ in range(3):
            profile = record(profile, obs(30, 10, completion_pct=0.3))
        adjustment = build_adjustment(profile, session_type="reading")
        assert adjustment.applied == ()
        assert adjustment.session_type_factor == 1.0

    def test_contracts_are_frozen(self):
        for cls in (LearningProfile, StudyObservation, LearningAdjustment):
            assert dataclasses.is_dataclass(cls)
            assert cls.__dataclass_params__.frozen


class TestNoPlannerMutation:
    def test_pipeline_with_empty_profile_is_byte_identical(self):
        items = [
            {"id": uuid.uuid4(), "title": "Solve exercise 4", "course_name": "Math",
             "priority": 1, "score": 150, "estimated_minutes": 45,
             "due_date": date.today() + timedelta(days=2), "overdue": False, "status": "pending"},
            {"id": uuid.uuid4(), "title": "Read chapter 5", "course_name": "Physics",
             "priority": 2, "score": 80, "estimated_minutes": None,
             "due_date": date.today() + timedelta(days=9), "overdue": False, "status": "pending"},
        ]
        windows = [{"start": "06:00", "end": "08:00", "total_minutes": 120}]
        data = {"available_windows": windows, "prioritized_backlog": items}
        plain = generate_deterministic_plan(data)
        estimator = PersonalizedEstimator(LearningProfile())
        from app.planning_pipeline import PlanningPipeline, build_planning_context
        personalized = PlanningPipeline(estimate_fn=estimator).execute(
            build_planning_context(data)
        )
        assert plain == personalized

    def test_warm_estimator_changes_estimate_only_when_enabled(self):
        profile = warm_profile(n=5, ratio=1.5)
        estimator = PersonalizedEstimator(profile)
        task = {"title": "Solve exercise 4", "description": "practice"}
        rule = rule_estimate(task)
        personalized = estimator.estimate(task, session_type="reading")
        assert personalized.estimated_minutes > rule.estimated_minutes
        assert personalized.confidence == rule.confidence
        assert "Personal learning" in personalized.reasoning[-1]

    def test_estimator_reads_dimensions_from_task_dict(self):
        profile = LearningProfile()
        for _ in range(3):
            profile = record(profile, obs(30, 15, task_category="Chemistry"))
        estimator = PersonalizedEstimator(profile)
        task = {"title": "lab report", "course_name": "Chemistry"}
        result = estimator.estimate(task)
        assert result.estimated_minutes < rule_estimate(task).estimated_minutes

    def test_record_does_not_mutate_observation(self):
        original = StudyObservation(estimated_minutes=30, actual_minutes=25)
        record(LearningProfile(), original)
        assert original.estimated_minutes == 30
        assert original.actual_minutes == 25


class TestExampleFactors:
    def test_revision_lower_than_reading(self):
        profile = LearningProfile()
        for ratio, label in [(0.82, "reading"), (0.91, "revision"), (1.31, "exercises")]:
            for _ in range(4):
                profile = record(profile, StudyObservation(
                    estimated_minutes=100, actual_minutes=round(100 * ratio),
                    session_type=label, time_of_day="day", task_category="",
                ))
        reading = build_adjustment(profile, session_type="reading").session_type_factor
        revision = build_adjustment(profile, session_type="revision").session_type_factor
        exercises = build_adjustment(profile, session_type="exercises").session_type_factor
        assert reading == pytest.approx(0.82, abs=1e-9)
        assert revision == pytest.approx(0.91, abs=1e-9)
        assert exercises == pytest.approx(1.31, abs=1e-9)

    def test_physics_and_night_slower(self):
        profile = LearningProfile()
        for ratio, cat, tod in [(1.45, "Physics", "night"), (0.94, "English", "morning")]:
            for _ in range(4):
                profile = record(profile, StudyObservation(
                    estimated_minutes=100, actual_minutes=round(100 * ratio),
                    session_type="study", time_of_day=tod, task_category=cat,
                ))
        physics = build_adjustment(profile, task_category="Physics").category_factor
        night = build_adjustment(profile, time_of_day="night").time_of_day_factor
        assert physics == pytest.approx(1.45, abs=1e-9)
        assert night == pytest.approx(1.45, abs=1e-9)


class TestPersonalizedEstimatorAsEstimateFn:
    def test_usable_as_pipeline_estimate_fn(self):
        """The explicit opt-in seam: a warm estimator changes plans, empty does not."""
        items = [
            {"id": uuid.uuid4(), "title": "Solve a long physics problem set", "course_name": "Math",
             "priority": 1, "score": 100, "estimated_minutes": None,
             "due_date": date.today() + timedelta(days=3), "overdue": False, "status": "pending"},
        ]
        data = {"available_windows": [{"start": "06:00", "end": "08:00", "total_minutes": 120}],
                "prioritized_backlog": items}
        plain = generate_deterministic_plan(data)
        profile = LearningProfile()
        for _ in range(5):
            profile = record(profile, StudyObservation(
                estimated_minutes=100, actual_minutes=150,  # tasks run 1.5x
                session_type="study", task_category="Math", time_of_day="day",
            ))
        estimator = PersonalizedEstimator(profile)

        from app.planning_pipeline import PlanningPipeline, build_planning_context
        pipeline = PlanningPipeline(estimate_fn=estimator)
        personalized = pipeline.execute(build_planning_context(data))
        assert personalized != plain
        assert personalized["sessions"] != plain["sessions"]


class TestCacheAndSeam:
    def test_empty_label_observations_skipped(self):
        profile = LearningProfile(observations=(
            StudyObservation(estimated_minutes=100, actual_minutes=80,
                             session_type="", task_category="", time_of_day=""),
            StudyObservation(estimated_minutes=100, actual_minutes=80,
                             session_type="", task_category="", time_of_day=""),
            StudyObservation(estimated_minutes=100, actual_minutes=80,
                             session_type="", task_category="", time_of_day=""),
        ))
        adjustment = build_adjustment(profile, session_type="reading")
        assert adjustment.applied == ()
        assert adjustment.factor == 1.0
        assert all_factors(profile) == {
            "session_type": {}, "task_category": {}, "time_of_day": {}
        }

    def test_index_cache_stays_bounded(self):
        from app.personalization.strategy import _CACHE_MAX

        strategy = PersonalizationStrategy()
        profiles = [warm_profile(n=3, ratio=0.8) for _ in range(_CACHE_MAX + 5)]
        for profile in profiles:
            build_adjustment(profile, session_type="reading", strategy=strategy)
        assert len(strategy._index_cache) <= _CACHE_MAX

    def test_callable_matches_estimate_minutes(self):
        profile = LearningProfile()
        for _ in range(5):
            profile = record(profile, StudyObservation(
                estimated_minutes=100, actual_minutes=150,
                session_type="study", task_category="Math", time_of_day="day",
            ))
        estimator = PersonalizedEstimator(profile)
        task = {"title": "problem set", "course_name": "Math"}
        rich = estimator.estimate(task)
        lean = estimator(task)
        assert lean.estimated_minutes == rich.estimated_minutes
        assert lean.confidence == rich.confidence
        assert "Personal learning" in rich.reasoning[-1]
        assert "Personal learning" not in lean.reasoning[-1]
