"""Service configuration, loaded from AUTH_* environment variables."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AUTH_", env_file=".env", extra="ignore")

    service_name: str = "bro-auth"
    database_url: str = "postgresql+asyncpg://bro:bro@auth-db:5432/auth"

    # JWT signing. HS256 for now; migrate to asymmetric (RS256/EdDSA) later.
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "bro.auth"
    access_token_ttl_seconds: int = 15 * 60            # 15 minutes
    refresh_token_ttl_seconds: int = 30 * 24 * 60 * 60  # 30 days


@lru_cache
def get_settings() -> Settings:
    """Cached singleton so every dependency shares one Settings instance."""
    return Settings()
