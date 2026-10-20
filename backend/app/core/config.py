from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    PROJECT_NAME: str = "Momentum"
    VERSION: str = "0.1.0"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    DATABASE_URL: str = "postgresql+asyncpg://momentum:momentum@localhost:5432/momentum"

    SUPABASE_URL: str | None = None
    SUPABASE_ANON_KEY: str | None = None
    SUPABASE_SERVICE_KEY: str | None = None

    SUPABASE_TIMEOUT_SECONDS: int = 15

    MFA_STATE_CACHE_TTL_SECONDS: int = 30
    MFA_NEGATIVE_STATE_CACHE_TTL_SECONDS: int = 5

    GEMINI_API_KEY: str | None = None
    GEMINI_MODEL: str = "gemini-3.7-flash"
    AI_PROVIDER: str = "gemini"
    STUDY_BUDDY_PROVIDER: str | None = None
    CLOUDFLARE_ACCOUNT_ID: str | None = None
    CLOUDFLARE_API_TOKEN: str | None = None
    CLOUDFLARE_MODEL: str = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
    STUDY_BUDDY_RATE_LIMIT_REQUESTS: int = Field(default=30, ge=1, le=10_000)
    STUDY_BUDDY_RATE_LIMIT_WINDOW_SECONDS: int = Field(default=3600, ge=1, le=86_400)
    STUDY_BUDDY_MAX_OUTPUT_TOKENS: int = Field(default=1024, ge=1, le=1024)

    def model_post_init(self, __context):
        if self.DATABASE_URL.startswith("postgresql://"):
            self.DATABASE_URL = self.DATABASE_URL.replace(
                "postgresql://",
                "postgresql+asyncpg://",
                1,
            )


settings = Settings()
