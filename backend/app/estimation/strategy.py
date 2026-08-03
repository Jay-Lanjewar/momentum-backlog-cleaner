from abc import ABC, abstractmethod

from .contract import EstimationResult, EstimationTask


class EstimatorStrategy(ABC):
    @abstractmethod
    def estimate(self, task: EstimationTask) -> EstimationResult:
        raise NotImplementedError
