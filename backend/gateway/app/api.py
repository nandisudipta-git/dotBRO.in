"""HTTP layer — a health probe plus the catch-all authenticating proxy."""
from fastapi import APIRouter, Depends, Request, Response

from .dependencies import get_gateway_service
from .services import GatewayService

router = APIRouter()

# Methods the edge forwards. HEAD/OPTIONS included so browsers and probes work.
_PROXY_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]


@router.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "bro-gateway"}


@router.api_route("/{path:path}", methods=_PROXY_METHODS, tags=["proxy"])
async def proxy(
    path: str,
    request: Request,
    service: GatewayService = Depends(get_gateway_service),
) -> Response:
    """Authenticate the caller, resolve their node, forward the request.

    Everything except `/health` lands here. The bearer token is validated by
    auth and never reaches the node; the node is addressed by user, not URL.
    """
    return await service.forward(request, path)
