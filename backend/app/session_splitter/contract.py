from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class StudySession:
    session_number: int
    duration_minutes: int
    session_type: str = "study"
    reasoning: str = "Split to maintain focus."


@dataclass(frozen=True, slots=True)
class SessionSplitResult:
    task: str
    sessions: list[StudySession]
