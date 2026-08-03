from dataclasses import dataclass
from datetime import date, datetime


@dataclass(frozen=True, slots=True)
class ScoringTask:
    title: str = ""
    priority: int | None = None
    due_date: date | datetime | None = None
    estimated_minutes: int | None = None
    overdue: bool | None = None


@dataclass(frozen=True)
class PlanningContext:
    today: date | None = None
    exam_date: date | datetime | None = None
    unfinished_minutes: int = 0


@dataclass(frozen=True, slots=True)
class FactorContribution:
    points: int
    reasoning: str


@dataclass(frozen=True)
class PlanningScoreResult:
    score: int
    reasoning: list[str]
