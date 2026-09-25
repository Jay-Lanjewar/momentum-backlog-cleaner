import pytest

from app.estimation import estimate


def _estimate(title: str, description: str | None = None, priority: int = 3):
    return estimate(
        {"title": title, "description": description, "priority": priority}
    )


class TestWorkloadQuantities:
    @pytest.mark.parametrize(
        ("title", "expected"),
        [
            ("Practice 20 questions", 60),
            ("Practice 10 questions", 30),
            ("Practice 5 questions", 15),
            ("Read 12 pages", 25),
            ("Revise 3 chapters", 60),
            ("Practice 5 exercises", 30),
            ("Solve 15 problems", 45),
            ("Watch 4 videos", 30),
            ("Make 30 cards", 30),
        ],
    )
    def test_quantity_estimates(self, title, expected):
        assert _estimate(title).estimated_minutes == expected

    def test_description_only_quantity(self):
        result = _estimate(
            "Quadratic Equations - Practice", description="20 questions"
        )
        assert result.estimated_minutes == 60

    def test_quantity_combines_title_and_description(self):
        result = _estimate("Practice 10 questions", description="5 pages")
        assert result.estimated_minutes == 45

    def test_chapter_identifier_is_not_a_quantity(self):
        result = _estimate("Read chapter 5")
        assert result.estimated_minutes == 40

    def test_zero_count_is_ignored(self):
        assert _estimate("Practice 0 questions").estimated_minutes == 45

    def test_reading_uses_page_reading_rate(self):
        assert _estimate("Read 12 pages").estimated_minutes == 25

    def test_non_reading_uses_default_page_rate(self):
        assert _estimate("Summarize 10 pages").estimated_minutes == 30


class TestExplicitDurations:
    def test_explicit_45_min(self):
        result = _estimate("Revise notes 45 min")
        assert result.estimated_minutes == 45
        assert result.confidence == 0.90

    def test_explicit_2_hours(self):
        result = _estimate("Write report 2 hours")
        assert result.estimated_minutes == 120
        assert result.confidence == 0.90

    def test_explicit_1_hr(self):
        assert _estimate("Write report 1 hr").estimated_minutes == 60

    def test_explicit_duration_beats_quantity(self):
        assert _estimate("Practice 20 questions for 45 min").estimated_minutes == 45

    def test_too_short_explicit_duration_falls_through(self):
        assert _estimate("Practice 2 min").estimated_minutes == 45

    def test_explicit_duration_in_description(self):
        result = _estimate("Chemistry revision", description="45 min")
        assert result.estimated_minutes == 45
        assert result.confidence == 0.90


class TestFallbackPreserved:
    @pytest.mark.parametrize(
        ("title", "priority", "expected"),
        [
            ("Submit project report", 3, 45),
            ("Maths worksheet tomorrow", 3, 45),
            ("Revise notes", 3, 40),
            ("Read chapter 5", 3, 40),
            ("Read chapter 5", 4, 30),
            ("Revise notes", 4, 30),
            ("Finish essay", 1, 50),
        ],
    )
    def test_no_quantity_keeps_type_and_difficulty_fallback(
        self, title, priority, expected
    ):
        assert _estimate(title, priority=priority).estimated_minutes == expected

    def test_empty_task_still_fifteen(self):
        assert _estimate("").estimated_minutes == 15


class TestPriorityAdjustment:
    def test_priority_one_scales_workload_up(self):
        assert _estimate("Practice 20 problems", priority=1).estimated_minutes == 65

    @pytest.mark.parametrize("priority", [2, 3])
    def test_priority_two_and_three_unscaled(self, priority):
        assert _estimate("Practice 20 problems", priority=priority).estimated_minutes == 60

    def test_priority_four_scales_workload_down(self):
        assert _estimate("Practice 20 problems", priority=4).estimated_minutes == 55


class TestBoundsAndDeterminism:
    def test_workload_floored_at_fifteen(self):
        assert _estimate("Practice 1 question").estimated_minutes == 15

    def test_workload_capped_at_240(self):
        assert _estimate("Practice 500 questions").estimated_minutes == 240

    def test_repeated_estimates_identical(self):
        first = _estimate("Practice 20 questions")
        second = _estimate("Practice 20 questions")
        assert first == second

    def test_reasoning_mentions_workload(self):
        result = _estimate("Practice 20 questions")
        joined = " ".join(result.reasoning).lower()
        assert "workload" in joined
        assert "20 questions" in joined

    def test_reasoning_mentions_explicit_duration(self):
        result = _estimate("Revise notes 45 min")
        joined = " ".join(result.reasoning).lower()
        assert "explicit duration" in joined

    def test_reasoning_mentions_priority_scale(self):
        result = _estimate("Practice 20 problems", priority=1)
        joined = " ".join(result.reasoning).lower()
        assert "scales workload" in joined


class TestConfidenceBands:
    def test_workload_with_type_keyword(self):
        assert _estimate("Practice 20 questions").confidence == 0.85

    def test_workload_without_type_keyword(self):
        assert _estimate("20 questions").confidence == 0.80

    def test_explicit_duration(self):
        assert _estimate("Revise notes 45 min").confidence == 0.90

    def test_fallback_unknown(self):
        assert _estimate("Submit project report").confidence == 0.50

    def test_fallback_single_category(self):
        assert _estimate("Revise notes").confidence == 0.75
