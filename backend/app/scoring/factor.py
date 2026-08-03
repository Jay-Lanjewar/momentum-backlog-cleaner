from abc import ABC, abstractmethod

from .contract import FactorContribution, PlanningContext, ScoringTask


class ScoringFactor(ABC):
    @abstractmethod
    def evaluate(
        self,
        task: ScoringTask,
        context: PlanningContext,
    ) -> FactorContribution:
        raise NotImplementedError
