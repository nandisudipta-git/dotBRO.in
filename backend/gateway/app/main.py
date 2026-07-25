"""Application entrypoint — assembles the FastAPI app.

Unlike auth/registry the gateway has no database. Its one piece of shared
state is an httpx connection pool, opened for the app's lifetime.
"""
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .api import router
from .config import get_settings
from .errors import GatewayError


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.http = httpx.AsyncClient(timeout=settings.upstream_timeout_seconds)
    yield
    await app.state.http.aclose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.service_name, version="0.1.0", lifespan=lifespan)

    @app.exception_handler(GatewayError)
    async def handle_gateway_error(_: Request, exc: GatewayError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    app.include_router(router)
    return app


app = create_app()
