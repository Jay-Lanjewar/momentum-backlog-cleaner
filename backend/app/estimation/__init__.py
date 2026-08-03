from .contract import EstimationResult, EstimationTask
from .engine import EstimationEngine
from .rule_based import RuleBasedEstimator
from .strategy import EstimatorStrategy

_default_engine = EstimationEngine()


def estimate(task: EstimationTask | dict) -> EstimationResult:
    return _default_engine.estimate(task)


__all__ = [
    "estimate",
    "EstimationEngine",
    "EstimationResult",
    "EstimationTask",
    "EstimatorStrategy",
    "RuleBasedEstimator",
]
