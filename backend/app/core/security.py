import logging
import time

from app.core.config import settings
from app.core.diagnostics import current_request_id

logger = logging.getLogger(__name__)

_jwks_client = None


def _get_jwks_client():
    global _jwks_client
    if _jwks_client is None:
        if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
            raise ValueError("Supabase not configured")
        from jwt import PyJWKClient

        jwks_url = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
        _jwks_client = PyJWKClient(jwks_url)
    return _jwks_client


def verify_token(token: str) -> dict:
    if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
        raise ValueError("Supabase not configured")

    import jwt

    client_started = time.perf_counter()
    jwks_client = _get_jwks_client()
    logger.info(
        "[AUTH TIMING] request_id=%s phase=jwks_client_creation duration=%.2f ms",
        current_request_id(),
        (time.perf_counter() - client_started) * 1000,
    )

    key_started = time.perf_counter()
    signing_key = jwks_client.get_signing_key_from_jwt(token)
    logger.info(
        "[AUTH TIMING] request_id=%s phase=jwks_key_lookup duration=%.2f ms",
        current_request_id(),
        (time.perf_counter() - key_started) * 1000,
    )

    decode_started = time.perf_counter()
    payload = jwt.decode(
        token,
        signing_key.key,
        algorithms=["ES256"],
        audience="authenticated",
        issuer=f"{settings.SUPABASE_URL}/auth/v1",
    )
    logger.info(
        "[AUTH TIMING] request_id=%s phase=jwt_decode duration=%.2f ms",
        current_request_id(),
        (time.perf_counter() - decode_started) * 1000,
    )
    return payload
