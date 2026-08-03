from .contract import SessionSplitResult, StudySession

_SINGLE_SESSION_MAX = 25
_FIXED_25_MAX = 45
_FIXED_35_MAX = 70
_FOCUS_RANGE_MAX = 120
_FOCUS_MIN = 25
_FOCUS_MAX = 35
_LONG_TARGET_MINUTES = 30
_HARD_MAX = 45

_SINGLE_REASONING = "Fits within a single session."
_SPLIT_REASONING = "Split to maintain focus."


def _distribute(total: int, count: int) -> list[int]:
    base, extra = divmod(total, count)
    return [base + 1 if i < extra else base for i in range(count)]


class SessionSplitter:
    def split(
        self,
        task: str,
        estimated_minutes: int,
        session_type: str = "study",
    ) -> SessionSplitResult:
        durations = self._durations(estimated_minutes)
        reasoning = _SINGLE_REASONING if len(durations) <= 1 else _SPLIT_REASONING
        sessions = [
            StudySession(
                session_number=index + 1,
                duration_minutes=minutes,
                session_type=session_type,
                reasoning=reasoning,
            )
            for index, minutes in enumerate(durations)
        ]
        return SessionSplitResult(task=task, sessions=sessions)

    def _durations(self, minutes: int) -> list[int]:
        if minutes <= 0:
            return []
        if minutes <= _SINGLE_SESSION_MAX:
            return [minutes]
        if minutes <= _FIXED_25_MAX:
            return [25, minutes - 25]
        if minutes <= _FIXED_35_MAX:
            return [35, minutes - 35]
        if minutes <= _FOCUS_RANGE_MAX:
            count = (minutes + _FOCUS_MAX - 1) // _FOCUS_MAX
            if count * _FOCUS_MIN > minutes:
                count = (minutes + _HARD_MAX - 1) // _HARD_MAX
            return _distribute(minutes, count)
        count = (minutes + _LONG_TARGET_MINUTES // 2) // _LONG_TARGET_MINUTES
        return _distribute(minutes, count)


_SPLITTER = SessionSplitter()


def split(
    task: str,
    estimated_minutes: int,
    session_type: str = "study",
) -> SessionSplitResult:
    return _SPLITTER.split(task, estimated_minutes, session_type)
