import copy
import dataclasses
import uuid
from datetime import date, timedelta

import pytest

from app.ai_coach import (
    CoachContext,
    CoachExplanation,
    CoachProvider,
    CoachSummary,
    StudyCoach,
    TemplateCoachProvider,
    build_coach_context,
    build_prompt,
    generate_coaching,
    generate_template_coaching,
    sanitize_item,
)
from app.ai_coach.fallback import (
    REASON_CARRIED,
    REASON_CLOSE_DEADLINE,
    REASON_LONG_FIRST,
    REASON_OVERDUE,
    REASON_SPLIT,
    generate_template_explanations,
    generate_template_summary,
)

TODAY = date.today()


def make_item(**overrides):
    item = {
        "id": uuid.uuid4(),
        "title": "Review lecture notes",
        "course_id": uuid.uuid4(),
        "course_name": "Math",
        "course_color": "#6366f1",
        "priority": 2,
        "score": 100,
        "estimated_minutes": 45,
        "due_date": TODAY + timedelta(days=6),
        "overdue": False,
        "status": "pending",
    }
    item.update(overrides)
    return item


def make_session(item, start="06:00", end="06:45", remaining=0):
    return {
        "backlog_item_id": str(item["id"]),
        "start_time": start,
        "end_time": end,
        "reason": f"Work on {item['title']}",
        "remaining_minutes": remaining,
    }


def make_plan(items, session_specs=None, overflow=None):
    if session_specs is None:
        session_specs = [make_session(item) for item in items]
    return {
        "sessions": list(session_specs),
        "daily_message": "All tasks scheduled!",
        "overflow": list(overflow or []),
    }


def make_data(items):
    return {"available_windows": [], "prioritized_backlog": list(items)}


class TestExplanationGeneration:
    def test_one_explanation_per_session_in_order(self):
        items = [make_item(), make_item(title="Solve exercise 4")]
        plan = make_plan(items)
        result = generate_coaching(plan, make_data(items))
        assert len(result.explanations) == 2
        assert [e.backlog_item_id for e in result.explanations] == [
            str(items[0]["id"]), str(items[1]["id"])
        ]
        assert all(e.short_reason for e in result.explanations)
        assert result.explanations[0].start_time == "06:00"
        assert result.explanations[0].end_time == "06:45"

    def test_carried_reason_from_previous_plan(self):
        item = make_item(due_date=TODAY + timedelta(days=10))
        plan = make_plan([item])
        previous = {"sessions": [make_session(item, "06:00", "06:30", remaining=15)]}
        result = generate_coaching(plan, make_data([item]), previous_plan=previous)
        assert result.explanations[0].short_reason == REASON_CARRIED

    def test_completed_previous_sessions_are_not_carried(self):
        item = make_item(due_date=TODAY + timedelta(days=10))
        plan = make_plan([item])
        previous = {"sessions": [make_session(item, "06:00", "06:30")]}
        completions = [{
            "backlog_item_id": str(item["id"]),
            "session_number": 1,
            "status": "completed",
            "completed_minutes": 30,
        }]
        result = generate_coaching(
            plan, make_data([item]), previous_plan=previous, completions=completions
        )
        assert result.explanations[0].short_reason != REASON_CARRIED

    def test_overdue_reason(self):
        item = make_item(due_date=TODAY - timedelta(days=2), overdue=True)
        plan = make_plan([item])
        result = generate_coaching(plan, make_data([item]))
        assert result.explanations[0].short_reason == REASON_OVERDUE

    def test_close_deadline_reason(self):
        item = make_item(due_date=TODAY + timedelta(days=1))
        plan = make_plan([item])
        result = generate_coaching(plan, make_data([item]))
        assert result.explanations[0].short_reason == REASON_CLOSE_DEADLINE

    def test_split_reason(self):
        item = make_item(estimated_minutes=45)
        plan = make_plan([item], [
            make_session(item, "06:00", "06:25"),
            make_session(item, "06:25", "06:45"),
        ])
        result = generate_coaching(plan, make_data([item]))
        assert result.explanations[0].short_reason == REASON_SPLIT
        assert result.explanations[1].short_reason == REASON_SPLIT

    def test_long_task_first_reason(self):
        item = make_item(estimated_minutes=120)
        plan = make_plan([item], [make_session(item, "06:00", "07:00")])
        result = generate_coaching(plan, make_data([item]))
        assert result.explanations[0].short_reason == REASON_LONG_FIRST

    def test_generic_reason(self):
        item = make_item(title="Summarize module 3")
        plan = make_plan([item])
        result = generate_coaching(plan, make_data([item]))
        assert result.explanations[0].short_reason == "Working on Summarize module 3."

    def test_invalid_due_date_is_ignored(self):
        item = make_item(due_date="not-a-date")
        plan = make_plan([item])
        result = generate_coaching(plan, make_data([item]))
        assert result.explanations[0].short_reason != REASON_OVERDUE

    def test_previous_plan_as_list(self):
        item = make_item(due_date=TODAY + timedelta(days=10))
        plan = make_plan([item])
        previous = [make_session(item, "06:00", "06:30", remaining=15)]
        result = generate_coaching(plan, make_data([item]), previous_plan=previous)
        assert result.explanations[0].short_reason == REASON_CARRIED

    def test_missing_backlog_item_still_explained(self):
        item = make_item()
        plan = make_plan([item])
        unknown = make_session(make_item(), "06:45", "07:00")
        plan["sessions"].append(unknown)
        result = generate_coaching(plan, make_data([item]))
        assert len(result.explanations) == 2


class TestFallbackGeneration:
    def test_fallback_equals_template_provider(self):
        items = [make_item(), make_item(overdue=True)]
        plan = make_plan(items)
        data = make_data(items)
        context = build_coach_context(plan, data)
        direct = generate_template_coaching(context)
        via_provider = TemplateCoachProvider().generate(context)
        assert direct == via_provider

    def test_fallback_direct_helpers(self):
        item = make_item()
        plan = make_plan([item])
        context = build_coach_context(plan, make_data([item]))
        explanations = generate_template_explanations(context)
        summary = generate_template_summary(context)
        assert len(explanations) == 1
        assert summary.session_count == 1
        assert summary.total_minutes == 45


class TestDeterministicOutput:
    def test_same_input_same_output(self):
        items = [make_item(), make_item(due_date=TODAY + timedelta(days=2))]
        plan = make_plan(items)
        data = make_data(items)
        first = generate_coaching(plan, data)
        second = generate_coaching(plan, data)
        assert first == second

    def test_deterministic_with_rescheduling_input(self):
        item = make_item()
        plan = make_plan([item])
        previous = {"sessions": [make_session(item, "06:00", "06:30", remaining=20)]}
        completions = [{
            "backlog_item_id": str(item["id"]),
            "session_number": 1,
            "status": "partial",
            "completed_minutes": 10,
        }]
        a = generate_coaching(plan, make_data([item]), previous, completions)
        b = generate_coaching(plan, make_data([item]), previous, completions)
        assert a == b


class TestSummaryGeneration:
    def test_headline_and_duration(self):
        item = make_item()
        plan = make_plan([item], [make_session(item, "06:00", "08:00")])
        result = generate_coaching(plan, make_data([item]))
        assert result.summary.sentences[0] == (
            "Today's plan focuses on your highest-impact work."
        )
        assert "2 hours of focused work today" in result.summary.sentences[-1]
        assert result.summary.total_minutes == 120
        assert result.summary.session_count == 1

    def test_overdue_first_sentence(self):
        item = make_item(title="Practice problems", course_name="Physics", overdue=True)
        plan = make_plan([item])
        result = generate_coaching(plan, make_data([item]))
        assert "Physics appears first because it is overdue." in result.summary.sentences

    def test_split_and_carried_sentences(self):
        item = make_item(estimated_minutes=45)
        plan = make_plan([item], [
            make_session(item, "06:00", "06:25"),
            make_session(item, "06:25", "06:45"),
        ])
        previous = {"sessions": [make_session(item, "06:00", "06:30", remaining=15)]}
        result = generate_coaching(plan, make_data([item]), previous_plan=previous)
        assert "Large tasks have been split into manageable sessions." in result.summary.sentences
        assert "Unfinished work from yesterday is carried into today." in result.summary.sentences

    def test_overflow_sentence(self):
        item = make_item()
        plan = make_plan([item], overflow=[str(uuid.uuid4())])
        result = generate_coaching(plan, make_data([item]))
        assert "Some tasks were left unscheduled for today." in result.summary.sentences

    def test_fractional_hours(self):
        item = make_item(estimated_minutes=45)
        plan = make_plan([item], [make_session(item, "06:00", "06:30")])
        result = generate_coaching(plan, make_data([item]))
        assert "0.5 hours of focused work today" in result.summary.sentences[-1]

    def test_empty_plan(self):
        plan = make_plan([])
        result = generate_coaching(plan, make_data([]))
        assert result.explanations == ()
        assert result.summary.session_count == 0
        assert result.summary.total_minutes == 0


class TestNoPlannerMutation:
    def test_plan_and_backlog_unchanged(self):
        item = make_item(estimated_minutes=45)
        plan = make_plan([item], [
            make_session(item, "06:00", "06:25"),
            make_session(item, "06:25", "06:45"),
        ])
        data = make_data([item])
        plan_copy = copy.deepcopy(plan)
        data_copy = copy.deepcopy(data)
        generate_coaching(plan, data)
        assert plan == plan_copy
        assert data == data_copy

    def test_no_internal_keys_reach_context(self):
        item = make_item()
        annotated = dict(item)
        for key in ("_id_str", "_resolved_minutes", "_planning_score",
                    "_priority_boost", "_session_durations"):
            annotated[key] = "leak"
        context = build_coach_context(
            make_plan([item]), make_data([annotated])
        )
        assert len(context.backlog) == 1
        assert all(not key.startswith("_") for key in context.backlog[0])

    def test_sanitize_item_filters_internals(self):
        item = dict(make_item(), _planning_score=999, _id_str="x")
        clean = sanitize_item(item)
        assert "_planning_score" not in clean
        assert "_id_str" not in clean
        assert clean["id"] == item["id"]

    def test_coach_never_writes_to_inputs(self):
        item = make_item()
        plan = make_plan([item])
        result = generate_coaching(plan, make_data([item]))
        assert result.explanations[0].short_reason
        assert item["title"] == "Review lecture notes"


class TestProviderAbstraction:
    def test_default_provider_is_template(self):
        coach = StudyCoach()
        assert isinstance(coach.provider, TemplateCoachProvider)

    def test_custom_provider_used(self):
        marker = "custom"

        class CustomProvider(CoachProvider):
            def generate(self, context):
                from app.ai_coach import CoachingResult, CoachSummary
                return CoachingResult(
                    explanations=tuple(
                        type("E", (), {"short_reason": marker})()
                        for _ in context.sessions
                    ),
                    summary=CoachSummary(sentences=(marker,), total_minutes=0,
                                         session_count=0),
                )

        item = make_item()
        context = build_coach_context(make_plan([item]), make_data([item]))
        result = StudyCoach(provider=CustomProvider()).coach(context)
        assert result.explanations[0].short_reason == marker
        assert result.summary.sentences == (marker,)

    def test_provider_is_abstract(self):
        with pytest.raises(TypeError):
            CoachProvider()


class TestImmutability:
    def test_contracts_are_frozen(self):
        for cls in (CoachContext, CoachExplanation, CoachSummary):
            assert dataclasses.is_dataclass(cls)
            assert cls.__dataclass_params__.frozen

    def test_context_rejects_mutation(self):
        item = make_item()
        context = build_coach_context(make_plan([item]), make_data([item]))
        with pytest.raises(dataclasses.FrozenInstanceError):
            context.sessions = ()


class TestPromptBuilder:
    def test_prompt_contains_public_facts(self):
        item = make_item(title="Solve exercise 4", due_date=TODAY + timedelta(days=1))
        context = build_coach_context(make_plan([item]), make_data([item]))
        prompt = build_prompt(context)
        assert "Solve exercise 4" in prompt
        assert str(item["id"]) in prompt
        assert "NEVER change" in prompt
        assert "_planning_score" not in prompt
        assert "_session_durations" not in prompt

    def test_prompt_mentions_overflow_and_completions(self):
        item = make_item()
        plan = make_plan([item], overflow=["abc"])
        completions = [{
            "backlog_item_id": str(item["id"]),
            "session_number": 1,
            "status": "skipped",
            "completed_minutes": 0,
        }]
        context = build_coach_context(plan, make_data([item]), completions=completions)
        prompt = build_prompt(context)
        assert "Unscheduled (overflow)" in prompt
        assert "Completion history" in prompt

    def test_prompt_notes_overdue_status(self):
        item = make_item(overdue=True, due_date=TODAY - timedelta(days=1))
        context = build_coach_context(make_plan([item]), make_data([item]))
        assert "status: overdue" in build_prompt(context)
