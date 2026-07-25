"""FastAPI dependency wiring — assembles the gateway service per request.

The httpx client is a single shared connection pool created in the app
lifespan (see main.py); dependencies only borrow it, never build one.
"""
import httpx
from fastapi import Depends, Request

from .clients import ControlPlaneClient
from .config import Settings, get_settings
from .services import GatewayService


def get_http(request: Request) -> httpx.AsyncClient:
    return request.app.state.http


def get_control_plane(
    http: httpx.AsyncClient = Depends(get_http),
    settings: Settings = Depends(get_settings),
) -> ControlPlaneClient:
    return ControlPlaneClient(http, settings)


def get_gateway_service(
    control_plane: ControlPlaneClient = Depends(get_control_plane),
    http: httpx.AsyncClient = Depends(get_http),
    settings: Settings = Depends(get_settings),
) -> GatewayService:
    return GatewayService(control_plane, http, settings)
