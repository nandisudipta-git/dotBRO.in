"""Application entrypoint for the registry service."""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .api import router
from .config import get_settings
from .database import database
from .errors import RegistryError


@asynccontextmanager
async def lifespan(app: FastAPI):
    await database.create_all()  # bootstrap schema; replace with Alembic in prod
    yield
    await database.dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.service_name, version="0.1.0", lifespan=lifespan)

    @app.exception_handler(RegistryError)
    async def handle_registry_error(_: Request, exc: RegistryError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    app.include_router(router)
    return app


app = create_app()
