"""Configuration loaded from environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = {"env_prefix": "PEQUOD_", "env_file": ".env"}

    # Required
    allium_api_key: str

    # Telegram (optional — not needed when running frontend-only)
    telegram_bot_token: str | None = None
    telegram_chat_id: str | None = None

    # Optional
    redis_url: str | None = None
    poll_interval_seconds: int = 60
    min_usd_threshold: float = 1_000_000
    lookback_days: int = 1

    # Identity enrichment
    enable_identity_enrichment: bool = True
    identity_fetch_timeout: int = 30

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
