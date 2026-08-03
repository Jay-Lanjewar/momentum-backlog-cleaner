from collections.abc import Mapping

from .contract import EstimationResult, EstimationTask
from .rule_based import RuleBasedEstimator
from .strategy import EstimatorStrategy


class EstimationEngine:
    def __init__(self, strategy: EstimatorStrategy | None = None):
        self._strategy = strategy or RuleBasedEstimator()

    def estimate(self, task: EstimationTask | Mapping) -> EstimationResult:
        return self._strategy.estimate(_coerce_task(task))


def _coerce_task(task: EstimationTask | Mapping) -> EstimationTask:
    if isinstance(task, EstimationTask):
        return task
    if isinstance(task, dict):
        return _from_dict(task)
    if isinstance(task, Mapping):
        return _from_dict(dict(task))
    raise TypeError(
        f"Expected EstimationTask or mapping, got {type(task).__name__}"
    )


def _from_dict(task: dict) -> EstimationTask:
    title = task.get("title") or ""
    if not isinstance(title, str):
        title = str(title)
    raw_description = task.get("description")
    description = str(raw_description) if raw_description else None
    return EstimationTask(
        title=title,
        description=description,
        priority=task.get("priority"),
    )
