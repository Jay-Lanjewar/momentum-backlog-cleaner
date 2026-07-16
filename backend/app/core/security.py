import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


def verify_token(token: str) -> dict:
    if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
        raise ValueError("Supabase not configured")

    import jwt
    from jwt import PyJWKClient

    jwks_url = f"{settings.SUPABASE_URL}/.well-known/jwks.json"
    jwks_client = PyJWKClient(jwks_url)
    signing_key = jwks_client.get_signing_key_from_jwt(token)

    payload = jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=settings.SUPABASE_ANON_KEY,
        issuer=f"{settings.SUPABASE_URL}/auth/v1",
    )
    return payload
