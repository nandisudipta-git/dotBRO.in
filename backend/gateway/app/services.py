"""Gateway business logic — authenticate, resolve, and reverse-proxy.

Flow per request:  token → auth /introspect → user_id → registry /resolve →
node → forward. The gateway holds no user data; it is a stateless edge.
"""
from __future__ import annotations

import httpx
from starlette.requests import Request
from starlette.responses import Response

from .clients import ControlPlaneClient
from .config import Settings
from .errors import Unauthenticated, UpstreamUnavailable
from .schemas import NodeTarget

# Per RFC 7230 §6.1 these are connection-specific and must not be forwarded.
_HOP_BY_HOP = frozenset(
    {
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "transfer-encoding",
        "upgrade",
    }
)


class GatewayService:
    def __init__(
        self,
        control_plane: ControlPlaneClient,
        http: httpx.AsyncClient,
        settings: Settings,
    ) -> None:
        self._cp = control_plane
        self._http = http
        self._settings = settings

    async def forward(self, request: Request, path: str) -> Response:
        token = self._bearer_token(request)
        principal = await self._cp.introspect(token)
        node = await self._cp.resolve(principal.user_id)
        return await self._proxy(request, path, node, principal.user_id)

    # --------------------------------------------------------------- internals
    def _bearer_token(self, request: Request) -> str:
        header = request.headers.get("authorization", "")
        scheme, _, value = header.partition(" ")
        if scheme.lower() != "bearer" or not value:
            raise Unauthenticated()
        return value

    def _outbound_headers(self, request: Request, user_id: str) -> dict[str, str]:
        """Drop hop-by-hop + trust-sensitive headers, then stamp the verified
        user id. The node never sees the bearer token — it trusts the header
        because it is reachable only through this gateway."""
        forwarded = self._settings.forwarded_user_header.lower()
        headers = {
            k: v
            for k, v in request.headers.items()
            if k.lower() not in _HOP_BY_HOP
            and k.lower() not in ("host", "authorization", "content-length", forwarded)
        }
        headers[self._settings.forwarded_user_header] = user_id
        return headers

    async def _proxy(
        self, request: Request, path: str, node: NodeTarget, user_id: str
    ) -> Response:
        url = f"{node.base_url}/{path}"
        upstream = self._http.build_request(
            method=request.method,
            url=url,
            headers=self._outbound_headers(request, user_id),
            params=request.query_params,
            content=await request.body(),
        )
        try:
            resp = await self._http.send(upstream)
        except httpx.RequestError as exc:
            raise UpstreamUnavailable() from exc

        response_headers = {
            k: v for k, v in resp.headers.items() if k.lower() not in _HOP_BY_HOP
        }
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            headers=response_headers,
        )
