"""Gemini tutoring call, intentionally separate from the planning provider."""
from __future__ import annotations

import logging
from collections.abc import Sequence

import httpx

from app.ai_tutor.prompt_builder import SYSTEM_INSTRUCTION, build_contents
from app.core.config import settings
from app.domain.schemas import StudyBuddyMessage
from app.services.ai_service import GEMINI_API_URL

logger = logging.getLogger(__name__)


class TutorUnavailable(Exception):
    pass


class TutorProviderError(Exception):
    pass


class TutorRateLimited(TutorProviderError):
    """Gemini throttled the request; caller can retry after this delay."""

    retry_after_seconds = 60


class GeminiTutor:
    def __init__(self, *, api_key: str | None = None, model: str | None = None):
        self.api_key = api_key if api_key is not None else settings.GEMINI_API_KEY
        self.model = model or settings.GEMINI_MODEL

    async def answer(
        self,
        question: str,
        history: Sequence[StudyBuddyMessage],
        *,
        task_title: str | None = None,
        subject_name: str | None = None,
    ) -> str:
        if not self.api_key:
            raise TutorUnavailable
        url = f"{GEMINI_API_URL}/{self.model}:generateContent?key={self.api_key}"
        payload = {
            "system_instruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
            "contents": build_contents(
                history, question, task_title=task_title, subject_name=subject_name
            ),
            "generationConfig": {
                "temperature": 0.4,
                "maxOutputTokens": settings.STUDY_BUDDY_MAX_OUTPUT_TOKENS,
            },
        }
        # Gemini 3.7 Flash supports these documented thinking levels. Keeping
        # thinking low reserves more of the bounded output budget for the
        # student's answer. Other configured models retain provider defaults.
        if self.model in {"gemini-3.7-flash", "gemini-3.8-flash"}:
            payload["generationConfig"]["thinkingConfig"] = {"thinkingLevel": "low"}
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()
        except httpx.TimeoutException as exc:
            logger.warning("Study Buddy provider timed out")
            raise TutorProviderError from exc
        except httpx.HTTPStatusError as exc:
            logger.warning("Study Buddy provider returned HTTP %s", exc.response.status_code)
            if exc.response.status_code == 429:
                raise TutorRateLimited from exc
            raise TutorProviderError from exc
        except (httpx.RequestError, ValueError) as exc:
            logger.warning("Study Buddy provider request/response failed")
            raise TutorProviderError from exc

        try:
            candidate = data["candidates"][0]
        except (KeyError, IndexError, TypeError):
            logger.warning("Study Buddy provider returned malformed output")
            raise TutorProviderError

        finish_reason = candidate.get("finishReason") if isinstance(candidate, dict) else None
        if finish_reason != "STOP":
            # Only log a small, normalized category. Provider fields and student
            # content are never included in logs or client errors.
            category = (
                "max_tokens" if finish_reason == "MAX_TOKENS"
                else "blocked" if isinstance(finish_reason, str) and finish_reason in {
                    "SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT",
                    "SPII", "IMAGE_SAFETY",
                }
                else "non_success"
            )
            logger.warning("Study Buddy generation incomplete (category=%s)", category)
            raise TutorProviderError

        try:
            parts = candidate["content"]["parts"]
            if not isinstance(parts, list):
                raise TypeError
            # Gemini may return thought text alongside its user-facing answer.
            # Exclude thought parts and preserve every ordinary text fragment.
            text_parts = []
            for part in parts:
                if not isinstance(part, dict):
                    raise TypeError
                if part.get("thought") is True or "text" not in part:
                    continue
                if not isinstance(part["text"], str):
                    raise TypeError
                text_parts.append(part["text"])
            answer = "".join(text_parts).strip()
        except (KeyError, TypeError, AttributeError):
            logger.warning("Study Buddy provider returned malformed output")
            raise TutorProviderError
        if not answer:
            logger.warning("Study Buddy provider returned empty output")
            raise TutorProviderError
        if len(answer) > 4000:
            logger.warning("Study Buddy provider answer exceeded response limit")
            raise TutorProviderError
        return answer
