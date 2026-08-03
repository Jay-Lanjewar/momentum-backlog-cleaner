import time

import pytest

from app.session_splitter import (
    SessionSplitResult,
    SessionSplitter,
    StudySession,
    split,
)


def _durations(result: SessionSplitResult) -> list[int]:
    return [s.duration_minutes for s in result.sessions]


class TestPublicApi:
    def test_split_is_callable(self):
        assert callable(split)

    def test_split_returns_session_split_result(self):
        result = split("Chemistry", 110)
        assert isinstance(result, SessionSplitResult)

    def test_result_has_task_and_sessions(self):
        result = split("Chemistry", 110)
        assert result.task == "Chemistry"
        assert all(isinstance(s, StudySession) for s in result.sessions)

    def test_splitter_instance_matches_module_function(self):
        assert SessionSplitter().split("A", 60) == split("A", 60)


class TestRequiredDurations:
    @pytest.mark.parametrize(
        ("minutes", "expected"),
        [
            (15, [15]),
            (30, [25, 5]),
            (45, [25, 20]),
            (60, [35, 25]),
            (90, [30, 30, 30]),
            (120, [30, 30, 30, 30]),
            (180, [30, 30, 30, 30, 30, 30]),
        ],
    )
    def test_exact_splits(self, minutes, expected):
        assert _durations(split("Task", minutes)) == expected

    @pytest.mark.parametrize("minutes", [15, 30, 45, 60, 90, 120, 180])
    def test_sum_equals_original(self, minutes):
        result = split("Task", minutes)
        assert sum(s.duration_minutes for s in result.sessions) == minutes


class TestRangeBoundaries:
    @pytest.mark.parametrize(
        ("minutes", "expected"),
        [
            (1, [1]),
            (25, [25]),
            (26, [25, 1]),
            (45, [25, 20]),
            (46, [35, 11]),
            (70, [35, 35]),
            (71, [36, 35]),
            (74, [37, 37]),
            (75, [25, 25, 25]),
            (100, [34, 33, 33]),
            (105, [35, 35, 35]),
            (110, [28, 28, 27, 27]),
            (121, [31, 30, 30, 30]),
            (135, [27, 27, 27, 27, 27]),
            (150, [30, 30, 30, 30, 30]),
            (165, [28, 28, 28, 27, 27, 27]),
        ],
    )
    def test_boundaries(self, minutes, expected):
        assert _durations(split("Task", minutes)) == expected

    def test_example_task_sums_to_110(self):
        result = split("Chemistry", 110)
        assert len(result.sessions) == 4
        assert sum(s.duration_minutes for s in result.sessions) == 110
        assert all(s.session_type == "study" for s in result.sessions)


class TestInvariants:
    @pytest.mark.parametrize("minutes", list(range(1, 401)))
    def test_all_durations_honor_invariants(self, minutes):
        result = split("Task", minutes)
        durations = [s.duration_minutes for s in result.sessions]
        assert sum(durations) == minutes
        assert all(d > 0 for d in durations)
        if len(durations) > 1:
            assert all(d <= 45 for d in durations)

    def test_zero_minutes_yields_no_sessions(self):
        assert _durations(split("Task", 0)) == []

    def test_negative_minutes_yields_no_sessions(self):
        assert _durations(split("Task", -10)) == []


class TestDeterminism:
    def test_same_inputs_identical_output(self):
        assert split("Task", 110) == split("Task", 110)

    def test_deterministic_across_range(self):
        for minutes in range(1, 200):
            assert split("Task", minutes) == split("Task", minutes)


class TestSessionMetadata:
    def test_session_numbers_sequential_from_one(self):
        result = split("Task", 110)
        assert [s.session_number for s in result.sessions] == [1, 2, 3, 4]

    def test_session_type_defaults_to_study(self):
        assert all(s.session_type == "study" for s in split("Task", 60).sessions)

    def test_split_reasoning(self):
        assert all(
            s.reasoning == "Split to maintain focus."
            for s in split("Task", 60).sessions
        )

    def test_single_session_reasoning(self):
        session = split("Task", 20).sessions[0]
        assert session.reasoning == "Fits within a single session."

    def test_custom_session_type_forwarded(self):
        result = split("Task", 90, session_type="revision")
        assert all(s.session_type == "revision" for s in result.sessions)

    def test_custom_session_type_single(self):
        session = split("Task", 30, session_type="flashcards").sessions[0]
        assert session.session_type == "flashcards"


class TestPerformance:
    def test_large_task_linear_completion(self):
        start = time.perf_counter()
        result = split("Task", 10000)
        elapsed = time.perf_counter() - start
        assert len(result.sessions) == 333
        assert sum(s.duration_minutes for s in result.sessions) == 10000
        assert elapsed < 1.0

    def test_session_count_is_expected(self):
        assert len(split("Task", 600).sessions) == 20
        assert len(split("Task", 601).sessions) == 20
