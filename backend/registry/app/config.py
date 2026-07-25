"""Service configuration, loaded from REGISTRY_* environment variables."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="REGISTRY_", env_file=".env", extra="ignore"
    )

    service_name: str = "bro-registry"
    database_url: str = "postgresql+asyncpg://bro:bro@registry-db:5432/registry"

    # Placement strategy for new users. "least_loaded" is the only one for now;
    # node granularity (per-user vs per-shard) stays a config decision.
    allocation_strategy: str = "least_loaded"


@lru_cache
def get_settings() -> Settings:
    return Settings()
