"""Application settings, loaded from environment variables / .env."""

from datetime import date
from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

APP_VERSION = "0.1.0"
ENGINE_VERSION = "prism-engine/1.0.0"
API_VERSION = "v1"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "dev"
    mock_mode: bool = True
    database_url: str = "sqlite:///./prism.db"
    jwt_secret: str = "dev-only-secret-change-me-0123456789abcdef"
    access_token_ttl_min: int = 30
    refresh_token_ttl_days: int = 14
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://localhost:5173"]
    )
    rate_limit_per_minute: int = 120
    ml_model_path: str | None = None
    ml_alpha: float = Field(default=0.5, ge=0.0, le=1.0)
    log_level: str = "INFO"
    # Demo support: /api/v1/demo/* endpoints and a frozen "today" so deadlines never slip into the past on stage.
    demo_mode: bool = True
    demo_today: date | None = date(2026, 10, 7)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v: object) -> object:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @field_validator("ml_model_path", mode="before")
    @classmethod
    def _empty_to_none(cls, v: object) -> object:
        return v or None


@lru_cache
def get_settings() -> Settings:
    return Settings()
