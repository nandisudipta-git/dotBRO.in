"""Async clients for the internal control plane (auth + registry).

Thin wrappers: they translate transport failures into GatewayError and parse
the two replies the gateway depends on. They hold no state beyond the shared
httpx client injected by the app lifespan.
"""
from __future__ import annotations

import httpx

from .config import Settings
from .errors import NodeUnavailable, Unauthenticated, UpstreamUnavailable
from .schemas import NodeTarget, Principal


class ControlPlaneClient:
    def __init__(self, http: httpx.AsyncClient, settings: Settings) -> None:
        self._http = http
        self._settings = settings

    # ----------------------------------------------------------- auth
    async def introspect(self, token: str) -> Principal:
        """Validate a bearer token via auth. Raises Unauthenticated if inactive."""
        try:
            resp = await self._http.post(
                f"{self._settings.auth_url}/introspect", json={"token": token}
            )
        except httpx.RequestError as exc:
            raise UpstreamUnavailable() from exc
        if resp.status_code >= 500:
            raise UpstreamUnavailable()
        data = resp.json()
        if not data.get("active") or not data.get("sub"):
            raise Unauthenticated()
        return Principal(user_id=data["sub"], session_id=data.get("sid"))

    # ------------------------------------------------------- registry
    async def resolve(self, user_id: str) -> NodeTarget:
        """Map a user to their node via registry (allocates on first contact)."""
        try:
            resp = await self._http.post(
                f"{self._settings.registry_url}/resolve", json={"user_id": user_id}
            )
        except httpx.RequestError as exc:
            raise UpstreamUnavailable() from exc
        if resp.status_code == 503:  # NoCapacity — no active node has room
            raise NodeUnavailable()
        if resp.status_code >= 500:
            raise UpstreamUnavailable()
        if resp.status_code != 200:
            raise NodeUnavailable()
        node = resp.json()["node"]
        return NodeTarget(host=node["host"], port=node["port"], status=node["status"])
