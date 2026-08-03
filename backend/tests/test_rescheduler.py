from datetime import date, timedelta

from app.rescheduler import (
    OVERDUE_BOOST,
    SKIPPED_BOOST,
    CompletionStatus,
    PlannedSession,
    ReschedulableTask,
    reschedule,
)
from app.rescheduler.strategy import carry_minutes, overdue_boost, priority_boost, skipped_boost

TODAY = date(2026, 8, 2)


def _session(number, duration, status, completed=0):
    return PlannedSession(
        session_number=number,
        duration_minutes=duration,
        status=status,
        completed_minutes=completed,
    )


def _task(sessions, overflow=0, due=None, backlog_id="task"):
    return ReschedulableTask(
        backlog_item_id=backlog_id,
        sessions=tuple(sessions),
        overflow_minutes=overflow,
        due_date=due,
    )


class TestCarryMinutes:
    def test_completed_contributes_nothing(self):
        session = _session(1, 25, CompletionStatus.COMPLETED)
        assert carry_minutes(session) == 0

    def test_skipped_contributes_full_duration(self):
        session = _session(1, 25, CompletionStatus.SKIPPED)
        assert carry_minutes(session) == 25

    def test_partial_keeps_only_remaining(self):
        session = _session(1, 30, CompletionStatus.PARTIAL, completed=18)
        assert carry_minutes(session) == 12

    def test_partial_fully_done_contributes_nothing(self):
        session = _session(1, 30, CompletionStatus.PARTIAL, completed=30)
        assert carry_minutes(session) == 0

    def test_partial_exceeding_duration_clamped(self):
        session = _session(1, 25, CompletionStatus.PARTIAL, completed=99)
        assert carry_minutes(session) == 0


class TestCompletedSessionsRemoved:
    def test_all_completed_task_has_zero_remaining(self):
        result = reschedule([
            _task([
                _session(1, 25, CompletionStatus.COMPLETED),
                _session(2, 20, CompletionStatus.COMPLETED),
            ])
        ], TODAY)
        adjustment = result.adjustments[0]
        assert adjustment.remaining_minutes == 0
        assert adjustment.session_durations == ()

    def test_completed_sessions_do_not_appear_in_carried(self):
        result = reschedule([
            _task([
                _session(1, 25, CompletionStatus.COMPLETED),
                _session(2, 20, CompletionStatus.SKIPPED),
            ])
        ], TODAY)
        adjustment = result.adjustments[0]
        assert adjustment.session_durations == (20,)
        assert adjustment.remaining_minutes == 20


class TestPartialSessionsReduced:
    def test_partial_keeps_only_remaining_minutes(self):
        result = reschedule([
            _task([_session(1, 25, CompletionStatus.PARTIAL, completed=10)])
        ], TODAY)
        adjustment = result.adjustments[0]
        assert adjustment.session_durations == (15,)
        assert adjustment.remaining_minutes == 15

    def test_partial_fully_done_counts_as_removed(self):
        result = reschedule([
            _task([_session(1, 25, CompletionStatus.PARTIAL, completed=25)])
        ], TODAY)
        assert result.adjustments[0].remaining_minutes == 0


class TestSkippedSessionsMoved:
    def test_skipped_session_carries_full_duration(self):
        result = reschedule([
            _task([_session(1, 35, CompletionStatus.SKIPPED)])
        ], TODAY)
        assert result.adjustments[0].session_durations == (35,)
        assert result.adjustments[0].remaining_minutes == 35


class TestOrderingPreserved:
    def test_carried_sessions_preserve_previous_order(self):
        result = reschedule([
            _task([
                _session(1, 25, CompletionStatus.COMPLETED),
                _session(2, 20, CompletionStatus.SKIPPED),
                _session(3, 15, CompletionStatus.PARTIAL, completed=10),
            ])
        ], TODAY)
        assert result.adjustments[0].session_durations == (20, 5)

    def test_partial_remainder_before_skipped_session(self):
        result = reschedule([
            _task([
                _session(1, 25, CompletionStatus.PARTIAL, completed=15),
                _session(2, 20, CompletionStatus.SKIPPED),
            ])
        ], TODAY)
        assert result.adjustments[0].session_durations == (10, 20)


class TestNeverDuplicateNeverLose:
    def test_minutes_conserved(self):
        sessions = [
            _session(1, 25, CompletionStatus.COMPLETED),
            _session(2, 20, CompletionStatus.SKIPPED),
            _session(3, 15, CompletionStatus.PARTIAL, completed=10),
        ]
        completed = 25 + 10
        result = reschedule([_task(sessions)], TODAY)
        remaining = result.adjustments[0].remaining_minutes
        assert remaining + completed == sum(s.duration_minutes for s in sessions)

    def test_overflow_tail_appended(self):
        result = reschedule([
            _task([
                _session(1, 30, CompletionStatus.COMPLETED),
                _session(2, 30, CompletionStatus.SKIPPED),
            ], overflow=30)
        ], TODAY)
        assert result.adjustments[0].session_durations == (30, 30)
        assert result.adjustments[0].remaining_minutes == 60

    def test_zero_overflow_not_appended(self):
        result = reschedule([
            _task([_session(1, 30, CompletionStatus.SKIPPED)], overflow=0)
        ], TODAY)
        assert result.adjustments[0].session_durations == (30,)


class TestOverdueBoost:
    def test_overdue_boost_applied(self):
        due = TODAY - timedelta(days=1)
        assert overdue_boost(due, TODAY) == OVERDUE_BOOST

    def test_due_today_not_overdue(self):
        assert overdue_boost(TODAY, TODAY) == 0

    def test_future_due_not_overdue(self):
        assert overdue_boost(TODAY + timedelta(days=1), TODAY) == 0

    def test_missing_due_not_overdue(self):
        assert overdue_boost(None, TODAY) == 0

    def test_missing_target_date_not_overdue(self):
        assert overdue_boost(TODAY - timedelta(days=1), None) == 0


class TestSkippedBoost:
    def test_skipped_boost_smaller_than_overdue(self):
        assert SKIPPED_BOOST < OVERDUE_BOOST

    def test_skipped_boost_applied(self):
        sessions = [_session(1, 25, CompletionStatus.SKIPPED)]
        assert skipped_boost(tuple(sessions)) == SKIPPED_BOOST

    def test_no_skipped_no_boost(self):
        sessions = [
            _session(1, 25, CompletionStatus.COMPLETED),
            _session(2, 20, CompletionStatus.PARTIAL, completed=5),
        ]
        assert skipped_boost(tuple(sessions)) == 0

    def test_partial_does_not_trigger_skipped_boost(self):
        sessions = [_session(1, 25, CompletionStatus.PARTIAL, completed=5)]
        assert skipped_boost(tuple(sessions)) == 0


class TestPriorityBoost:
    def test_overdue_and_skipped_stack(self):
        due = TODAY - timedelta(days=1)
        sessions = [_session(1, 25, CompletionStatus.SKIPPED)]
        assert priority_boost(due, tuple(sessions), TODAY) == OVERDUE_BOOST + SKIPPED_BOOST

    def test_no_boost_without_overdue_or_skip(self):
        sessions = [_session(1, 25, CompletionStatus.COMPLETED)]
        assert priority_boost(TODAY, tuple(sessions), TODAY) == 0

    def test_boost_reflected_in_adjustment(self):
        result = reschedule([
            _task(
                [_session(1, 25, CompletionStatus.SKIPPED)],
                due=TODAY - timedelta(days=2),
            )
        ], TODAY)
        assert result.adjustments[0].priority_boost == OVERDUE_BOOST + SKIPPED_BOOST


class TestDeterminism:
    def test_same_input_identical_result(self):
        tasks = [
            _task(
                [
                    _session(1, 25, CompletionStatus.COMPLETED),
                    _session(2, 20, CompletionStatus.SKIPPED),
                ],
                backlog_id="b",
            ),
            _task(
                [_session(1, 35, CompletionStatus.PARTIAL, completed=5)],
                backlog_id="a",
            ),
        ]
        first = reschedule(tasks, TODAY)
        second = reschedule(tasks, TODAY)
        assert first == second

    def test_adjustments_sorted_by_backlog_item_id(self):
        result = reschedule([
            _task([_session(1, 10, CompletionStatus.SKIPPED)], backlog_id="z"),
            _task([_session(1, 10, CompletionStatus.SKIPPED)], backlog_id="a"),
        ], TODAY)
        assert [a.backlog_item_id for a in result.adjustments] == ["a", "z"]

    def test_total_remaining_minutes_summed(self):
        result = reschedule([
            _task([_session(1, 25, CompletionStatus.SKIPPED)], backlog_id="a"),
            _task([_session(1, 20, CompletionStatus.SKIPPED)], backlog_id="b"),
        ], TODAY)
        assert result.total_remaining_minutes == 45


class TestEmptyInput:
    def test_no_tasks_empty_result(self):
        result = reschedule([], TODAY)
        assert result.adjustments == ()
        assert result.total_remaining_minutes == 0


class TestModulePurity:
    def test_rescheduler_module_has_no_db_imports(self):
        import app.rescheduler as module
        import app.rescheduler.contract as contract
        import app.rescheduler.strategy as strategy
        import app.rescheduler.engine as engine

        for mod in (module, contract, strategy, engine):
            source = open(mod.__file__, encoding="utf-8").read()
            forbidden = ["sqlalchemy", "AsyncSession", "get_db", "dependencies"]
            assert all(token not in source for token in forbidden)
