import re

from .contract import EstimationResult, EstimationTask
from .strategy import EstimatorStrategy

_CATEGORY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "reading": (
        "read",
        "reading",
        "chapter",
        "chapters",
        "textbook",
        "textbooks",
        "skim",
    ),
    "exercise": (
        "exercise",
        "exercises",
        "practice",
        "practices",
        "problem",
        "problems",
        "solve",
        "solving",
        "worksheet",
        "worksheets",
        "homework",
        "numerical",
        "numericals",
    ),
    "revision": (
        "revision",
        "revise",
        "review",
        "reviews",
        "flashcard",
        "flashcards",
        "memorize",
        "recall",
        "summarize",
        "summary",
        "summaries",
    ),
}

_TYPE_MINUTES: dict[str, int] = {
    "reading": 30,
    "exercise": 45,
    "revision": 30,
    "mixed": 45,
    "unknown": 40,
    "empty": 15,
}

_DIFFICULTY_BY_PRIORITY: dict[int, tuple[str, int]] = {
    1: ("high", 60),
    2: ("medium", 45),
    3: ("medium", 45),
    4: ("low", 30),
}

_DEFAULT_PRIORITY = 3

_QUANTITY_RATES: dict[str, int] = {
    "question": 3,
    "problem": 3,
    "exercise": 6,
    "chapter": 20,
    "page": 3,
    "article": 10,
    "topic": 10,
    "section": 10,
    "worksheet": 25,
    "sheet": 25,
    "video": 8,
    "card": 1,
    "line": 1,
    "note": 3,
    "paragraph": 3,
    "item": 2,
}

_PAGE_RATE_READING = 2

_UNIT_ALIASES: dict[str, str] = {
    alias: canonical
    for canonical in _QUANTITY_RATES
    for alias in (canonical, canonical + "s")
}

_QUANTITY_PATTERN = re.compile(
    r"\b(\d{1,4})\s*("
    + "|".join(sorted(_UNIT_ALIASES, key=len, reverse=True))
    + r")\b",
    re.IGNORECASE,
)

_EXPLICIT_HOURS_PATTERN = re.compile(
    r"\b(\d{1,2})\s*(?:h|hr|hrs|hour|hours)\b",
    re.IGNORECASE,
)

_EXPLICIT_MINUTES_PATTERN = re.compile(
    r"\b(\d{1,3})\s*(?:m|min|mins|minute|minutes)\b",
    re.IGNORECASE,
)

_EXPLICIT_MIN = 5
_EXPLICIT_MAX = 1440
_WORKLOAD_MIN = 15
_WORKLOAD_MAX = 240

_EXPLICIT_CONFIDENCE = 0.90
_WORKLOAD_CONFIDENCE = 0.80
_WORKLOAD_CONFIDENCE_TYPED = 0.85

_PRIORITY_WORKLOAD_FACTOR: dict[int, float] = {
    1: 1.1,
    4: 0.9,
}

_TOKEN_PUNCTUATION = ".,!?;:()[]{}\"'`-–—…"

_WORD_TO_CATEGORY: dict[str, str] = {
    keyword: category
    for category, keywords in _CATEGORY_KEYWORDS.items()
    for keyword in keywords
}


def _detect_categories(text: str) -> list[str]:
    lowered = text.lower()
    found: set[str] = set()
    for token in lowered.split():
        category = _WORD_TO_CATEGORY.get(token.strip(_TOKEN_PUNCTUATION))
        if category is not None:
            found.add(category)
    return [
        category
        for category in _CATEGORY_KEYWORDS
        if category in found
    ]


def _round_to_5(minutes: float) -> int:
    return int(minutes / 5 + 0.5) * 5


def _extract_explicit_minutes(text: str) -> int | None:
    candidates: list[tuple[int, int]] = []
    for match in _EXPLICIT_HOURS_PATTERN.finditer(text):
        candidates.append((match.start(), int(match.group(1)) * 60))
    for match in _EXPLICIT_MINUTES_PATTERN.finditer(text):
        candidates.append((match.start(), int(match.group(1))))
    valid = [
        (position, value)
        for position, value in candidates
        if _EXPLICIT_MIN <= value <= _EXPLICIT_MAX
    ]
    if not valid:
        return None
    return min(valid, key=lambda candidate: candidate[0])[1]


def _extract_workload(text: str) -> list[tuple[int, str]]:
    workload: list[tuple[int, str]] = []
    for match in _QUANTITY_PATTERN.finditer(text):
        count = int(match.group(1))
        if count <= 0:
            continue
        unit = _UNIT_ALIASES[match.group(2).lower()]
        workload.append((count, unit))
    return workload


class RuleBasedEstimator(EstimatorStrategy):
    def estimate(self, task: EstimationTask) -> EstimationResult:
        title = (task.title or "").strip()
        description = (task.description or "").strip()

        if not title and not description:
            return EstimationResult(
                estimated_minutes=_TYPE_MINUTES["empty"],
                confidence=0.30,
                reasoning=[
                    "Task is empty",
                    "Difficulty is medium (default)",
                    "Rule-based estimate",
                ],
            )

        title_categories = _detect_categories(title)
        description_categories = (
            _detect_categories(description) if description else []
        )
        if description_categories:
            detected = [
                category
                for category in _CATEGORY_KEYWORDS
                if category in title_categories or category in description_categories
            ]
        else:
            detected = title_categories
        priority = (
            task.priority if task.priority is not None else _DEFAULT_PRIORITY
        )
        difficulty, difficulty_minutes = _DIFFICULTY_BY_PRIORITY.get(
            priority, _DIFFICULTY_BY_PRIORITY[_DEFAULT_PRIORITY]
        )

        text = " ".join(part for part in (title, description) if part).strip()

        explicit_minutes = _extract_explicit_minutes(text)
        if explicit_minutes is not None:
            return EstimationResult(
                estimated_minutes=explicit_minutes,
                confidence=_EXPLICIT_CONFIDENCE,
                reasoning=[
                    f"Explicit duration in task text: {explicit_minutes} min",
                    "Rule-based estimate",
                ],
            )

        workload = _extract_workload(text)
        if workload:
            reading_task = "reading" in detected
            workload_lines = []
            base_minutes = 0
            for count, unit in workload:
                rate = (
                    _PAGE_RATE_READING
                    if unit == "page" and reading_task
                    else _QUANTITY_RATES[unit]
                )
                base_minutes += count * rate
                workload_lines.append(
                    f"Detected workload: {count} {unit}"
                    f"{'' if count == 1 else 's'} at {rate} min each"
                )
            factor = _PRIORITY_WORKLOAD_FACTOR.get(priority, 1.0)
            workload_minutes = max(
                _WORKLOAD_MIN,
                min(_WORKLOAD_MAX, _round_to_5(base_minutes * factor)),
            )
            confidence = (
                _WORKLOAD_CONFIDENCE_TYPED if detected else _WORKLOAD_CONFIDENCE
            )
            reasoning = list(workload_lines)
            if factor != 1.0:
                reasoning.append(
                    f"Priority {priority} scales workload estimate by {factor}"
                )
            reasoning.append("Rule-based estimate")
            return EstimationResult(
                estimated_minutes=workload_minutes,
                confidence=confidence,
                reasoning=reasoning,
            )

        if not detected:
            task_type = "unknown"
            type_minutes = _TYPE_MINUTES["unknown"]
        elif len(detected) == 1:
            task_type = detected[0]
            type_minutes = _TYPE_MINUTES[task_type]
        else:
            task_type = "mixed"
            type_minutes = _TYPE_MINUTES["mixed"]

        estimated_minutes = max(
            5, _round_to_5((type_minutes + difficulty_minutes) / 2)
        )

        if task_type == "unknown":
            confidence = 0.50
        elif task_type == "mixed":
            confidence = 0.85
        else:
            confidence = 0.75

        if title_categories and description_categories:
            confidence = min(0.95, confidence + 0.05)
        confidence = round(confidence, 2)

        reasoning = [
            f"Task contains {category} keywords" for category in detected
        ]
        if task_type == "mixed":
            reasoning.append("Task contains multiple activity types")
        if task_type == "unknown":
            reasoning.append("No known activity keywords matched")
        difficulty_line = f"Difficulty is {difficulty}"
        if task.priority is None:
            difficulty_line += " (default)"
        reasoning.append(difficulty_line)
        reasoning.append("Rule-based estimate")

        return EstimationResult(
            estimated_minutes=estimated_minutes,
            confidence=confidence,
            reasoning=reasoning,
        )
