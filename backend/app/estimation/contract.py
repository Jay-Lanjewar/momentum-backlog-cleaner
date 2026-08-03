from dataclasses import dataclass


@dataclass(frozen=True)
class EstimationTask:
    title: str = ""
    description: str | None = None
    priority: int | None = None


@dataclass(frozen=True)
class EstimationResult:
    estimated_minutes: int
    confidence: float
    reasoning: list[str]
