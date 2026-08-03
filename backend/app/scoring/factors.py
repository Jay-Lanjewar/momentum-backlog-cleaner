from datetime import date, datetime

from .contract import FactorContribution, PlanningContext, ScoringTask
from .factor import ScoringFactor


def _as_date(value: date | datetime | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    return value


def _reference_today(context: PlanningContext) -> date:
    return _as_date(context.today) or date.today()


class ManualPriorityFactor(ScoringFactor):
    _TABLE = {1: (35, "high"), 2: (25, "medium-high"), 3: (15, "medium"), 4: (5, "low")}
    _DEFAULT_PRIORITY = 3
    _DEFAULT = (15, "medium")

    def evaluate(
        self,
        task: ScoringTask,
        context: PlanningContext,
    ) -> FactorContribution:
        priority = (
            task.priority if task.priority is not None else self._DEFAULT_PRIORITY
        )
        points, label = self._TABLE.get(priority, self._DEFAULT)
        return FactorContribution(points, f"Priority is {label}")


class OverdueFactor(ScoringFactor):
    def evaluate(
        self,
        task: ScoringTask,
        context: PlanningContext,
    ) -> FactorContribution:
        overdue = task.overdue
        if overdue is None:
            due = _as_date(task.due_date)
            overdue = due is not None and due < _reference_today(context)
        if overdue:
            return FactorContribution(20, "Task is overdue")
        return FactorContribution(0, "Task is not overdue")


class DueProximityFactor(ScoringFactor):
    def evaluate(
        self,
        task: ScoringTask,
        context: PlanningContext,
    ) -> FactorContribution:
        today = _reference_today(context)
        due = _as_date(task.due_date)
        exam = _as_date(context.exam_date)
        if due is None:
            nearest = exam
        elif exam is None:
            nearest = due
        else:
            nearest = due if due < exam else exam
        if nearest is None:
            return FactorContribution(5, "No due date or exam proximity")
        days = (nearest - today).days
        if days <= 0:
            return FactorContribution(25, "Due today or past due")
        if days <= 2:
            return FactorContribution(20, f"Due in {days} days")
        if days <= 7:
            return FactorContribution(15, f"Due in {days} days")
        if days <= 14:
            return FactorContribution(10, f"Due in {days} days")
        return FactorContribution(5, f"Due in {days} days")


class EstimatedDurationFactor(ScoringFactor):
    def evaluate(
        self,
        task: ScoringTask,
        context: PlanningContext,
    ) -> FactorContribution:
        minutes = task.estimated_minutes
        if minutes is None or minutes <= 0:
            return FactorContribution(0, "No duration estimate")
        if minutes >= 120:
            points, label = 10, "long"
        elif minutes >= 60:
            points, label = 7, "long"
        elif minutes >= 30:
            points, label = 5, "medium"
        elif minutes >= 15:
            points, label = 3, "short"
        else:
            points, label = 1, "quick"
        return FactorContribution(
            points, f"Estimated duration is {label} ({minutes} minutes)"
        )


class UnfinishedSessionFactor(ScoringFactor):
    def evaluate(
        self,
        task: ScoringTask,
        context: PlanningContext,
    ) -> FactorContribution:
        remaining = context.unfinished_minutes or 0
        if remaining > 0:
            return FactorContribution(
                10,
                f"Previous session unfinished ({remaining} minutes remaining)",
            )
        return FactorContribution(0, "No unfinished previous session")
