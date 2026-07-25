"""FastAPI dependency wiring for the registry."""
from collections.abc import AsyncIterator

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from .allocator import NodeAllocator, build_allocator
from .config import Settings, get_settings
from .database import database
from .repositories import NodeRepository, RouteRepository
from .services import RegistryService


async def get_session() -> AsyncIterator[AsyncSession]:
    async with database.session() as session:
        yield session


def get_allocator(settings: Settings = Depends(get_settings)) -> NodeAllocator:
    return build_allocator(settings.allocation_strategy)


def get_registry_service(
    session: AsyncSession = Depends(get_session),
    allocator: NodeAllocator = Depends(get_allocator),
) -> RegistryService:
    return RegistryService(
        nodes=NodeRepository(session),
        routes=RouteRepository(session),
        allocator=allocator,
    )
