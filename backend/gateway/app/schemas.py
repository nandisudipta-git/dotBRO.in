"""Internal value objects. The gateway has no public wire schema of its own —
it proxies bodies untouched — so these only model the control-plane replies."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Principal:
    """The authenticated caller, distilled from an auth /introspect response."""

    user_id: str
    session_id: str | None = None


@dataclass(frozen=True)
class NodeTarget:
    """Where a user's request gets forwarded, from a registry /resolve response."""

    host: str
    port: int
    status: str

    @property
    def base_url(self) -> str:
        return f"http://{self.host}:{self.port}"
