"""Service configuration, loaded from GATEWAY_* environment variables."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="GATEWAY_", env_file=".env", extra="ignore"
    )

    service_name: str = "bro-gateway"

    # Internal control-plane upstreams (private Docker-network service names).
    # Never public — the gateway is the only service that talks to them.
    auth_url: str = "http://auth:8000"
    registry_url: str = "http://registry:8000"

    # Timeout (seconds) for introspect / resolve / node-proxy calls.
    upstream_timeout_seconds: float = 10.0

    # Header carrying the verified user id to the node. A node trusts it ONLY
    # because it is unreachable except through the gateway (private network).
    # Inbound copies of this header are stripped before forwarding.
    forwarded_user_header: str = "X-Bro-User"


@lru_cache
def get_settings() -> Settings:
    """Cached singleton so every dependency shares one Settings instance."""
    return Settings()
