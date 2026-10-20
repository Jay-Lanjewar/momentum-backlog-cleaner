"""AI tutoring providers for Study Buddy, separate from the planning provider."""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from collections.abc import Sequence

import httpx

from app.ai_tutor.prompt_builder import (
    SYSTEM_INSTRUCTION,
    build_cloudflare_messages,
    build_contents,
)
from app.core.config import settings
from app.domain.schemas import StudyBuddyMessage
from app.services.ai_service import GEMINI_API_URL

logger = logging.getLogger(__name__)

CLOUDFLARE_API_URL = "https://api.cloudflare.com/client/v4/accounts"


class TutorUnavailable(Exception):
    pass


class TutorProviderError(Exception):
    pass


class TutorRateLimited(TutorProviderError):
    """Provider throttled the request; caller can retry after this delay."""

    retry_after_seconds = 60


class TutorProvider(ABC):
    @abstractmethod
    async def answer(
        self,
        question: str,
        history: Sequence[StudyBuddyMessage],
        *,
        task_title: str | None = None,
        subject_name: str | None = None,
    ) -> str:
        ...


class GeminiTutor(TutorProvider):
    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        timeout: float = 20.0,
    ):
        self.api_key = api_key if api_key is not None else settings.GEMINI_API_KEY
        self.model = model or settings.GEMINI_MODEL
        self.timeout = timeout

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
            async with httpx.AsyncClient(timeout=self.timeout) as client:
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


class CloudflareTutor(TutorProvider):
    def __init__(
        self,
        *,
        account_id: str | None = None,
        api_token: str | None = None,
        model: str | None = None,
        timeout: float = 20.0,
    ):
        self.account_id = account_id if account_id is not None else settings.CLOUDFLARE_ACCOUNT_ID
        self.api_token = api_token if api_token is not None else settings.CLOUDFLARE_API_TOKEN
        self.model = model or settings.CLOUDFLARE_MODEL
        self.timeout = timeout

    async def answer(
        self,
        question: str,
        history: Sequence[StudyBuddyMessage],
        *,
        task_title: str | None = None,
        subject_name: str | None = None,
    ) -> str:
        if not self.account_id or not self.api_token:
            logger.warning("Cloudflare credentials not configured")
            raise TutorUnavailable

        clean_account_id = self.account_id.strip()
        clean_model = self.model.strip().lstrip("/")
        url = f"{CLOUDFLARE_API_URL}/{clean_account_id}/ai/run/{clean_model}"
        headers = {
            "Authorization": f"Bearer {self.api_token.strip()}",
        }
        payload = {
            "messages": build_cloudflare_messages(
                history, question, task_title=task_title, subject_name=subject_name
            ),
            "max_tokens": settings.STUDY_BUDDY_MAX_OUTPUT_TOKENS,
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
        except httpx.TimeoutException as exc:
            logger.warning("Study Buddy provider timed out")
            raise TutorProviderError from exc
        except httpx.HTTPStatusError as exc:
            logger.warning("Study Buddy provider returned HTTP %s", exc.response.status_code)
            if exc.response.status_code == 429:
                rate_limited_exc = TutorRateLimited()
                retry_after = exc.response.headers.get("retry-after")
                if retry_after and retry_after.isdigit():
                    rate_limited_exc.retry_after_seconds = int(retry_after)
                raise rate_limited_exc from exc
            raise TutorProviderError from exc
        except (httpx.RequestError, ValueError) as exc:
            logger.warning("Study Buddy provider request/response failed")
            raise TutorProviderError from exc

        if not isinstance(data, dict):
            logger.warning("Study Buddy provider returned malformed output")
            raise TutorProviderError

        if data.get("success") is False:
            logger.warning("Study Buddy provider indicated unsuccessful response")
            raise TutorProviderError

        if data.get("errors"):
            logger.warning("Study Buddy provider returned errors in response body")
            raise TutorProviderError

        result = data.get("result")
        if not isinstance(result, dict):
            logger.warning("Study Buddy provider returned malformed output")
            raise TutorProviderError

        if result.get("truncated") is True:
            logger.warning("Study Buddy generation incomplete (category=truncated)")
            raise TutorProviderError

        finish_reason = result.get("finish_reason") or result.get("finishReason")
        if finish_reason is not None:
            normalized_reason = finish_reason.lower().strip() if isinstance(finish_reason, str) else None
            if normalized_reason in {"length", "max_tokens", "truncated", "incomplete"}:
                logger.warning("Study Buddy generation incomplete (category=max_tokens)")
                raise TutorProviderError
            elif normalized_reason not in {"stop", "eos", "eos_token"}:
                logger.warning("Study Buddy generation incomplete (category=non_success)")
                raise TutorProviderError

        raw_answer = result.get("response")
        if not isinstance(raw_answer, str):
            logger.warning("Study Buddy provider returned malformed output")
            raise TutorProviderError

        answer = raw_answer.strip()
        if not answer:
            logger.warning("Study Buddy provider returned empty output")
            raise TutorProviderError
        if len(answer) > 4000:
            logger.warning("Study Buddy provider answer exceeded response limit")
            raise TutorProviderError

        return answer


def get_tutor(provider: str | None = None) -> TutorProvider:
    resolved = provider or settings.STUDY_BUDDY_PROVIDER or settings.AI_PROVIDER
    normalized = resolved.strip().lower() if resolved else "gemini"
    if normalized in {"cloudflare", "cloudflare_workers_ai", "workers_ai"}:
        return CloudflareTutor()
    elif normalized == "gemini":
        return GeminiTutor()
    else:
        logger.warning("Unknown Study Buddy provider '%s', falling back to Gemini", resolved)
        return GeminiTutor()
