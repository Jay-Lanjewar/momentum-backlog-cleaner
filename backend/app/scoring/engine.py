from .contract import PlanningContext, PlanningScoreResult, ScoringTask
from .factor import ScoringFactor
from .factors import (
    DueProximityFactor,
    EstimatedDurationFactor,
    ManualPriorityFactor,
    OverdueFactor,
    UnfinishedSessionFactor,
)

_MAX_SCORE = 100

_DEFAULT_FACTORS = tuple(
    factor()
    for factor in (
        ManualPriorityFactor,
        OverdueFactor,
        DueProximityFactor,
        EstimatedDurationFactor,
        UnfinishedSessionFactor,
    )
)


class PlanningScoreEngine:
    def __init__(self, factors: list[ScoringFactor] | None = None) -> None:
        if factors is not None:
            self._factors = list(factors)
        else:
            self._factors = list(_DEFAULT_FACTORS)

    @property
    def factors(self) -> tuple[ScoringFactor, ...]:
        return tuple(self._factors)

    def score(
        self,
        task: ScoringTask,
        context: PlanningContext,
    ) -> PlanningScoreResult:
        reasoning: list[str] = []
        total = 0
        for factor in self._factors:
            contribution = factor.evaluate(task, context)
            total += contribution.points
            reasoning.append(contribution.reasoning)
        if total < 0:
            total = 0
        elif total > _MAX_SCORE:
            total = _MAX_SCORE
        return PlanningScoreResult(score=total, reasoning=reasoning)


def score(
    task: ScoringTask,
    context: PlanningContext | None = None,
) -> PlanningScoreResult:
    return PlanningScoreEngine().score(task, context or PlanningContext())
