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
