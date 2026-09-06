import logging

from app.core.config import settings

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

    jwks_client = _get_jwks_client()
    signing_key = jwks_client.get_signing_key_from_jwt(token)

    payload = jwt.decode(
        token,
        signing_key.key,
        algorithms=["ES256"],
        audience="authenticated",
        issuer=f"{settings.SUPABASE_URL}/auth/v1",
    )
    return payload
