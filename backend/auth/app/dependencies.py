"""FastAPI dependency wiring — assembles services from repositories per request."""
from collections.abc import AsyncIterator

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from .config import Settings, get_settings
from .database import database
from .repositories import RefreshSessionRepository, UserRepository
from .security import PasswordHasher, TokenService
from .services import AuthService


async def get_session() -> AsyncIterator[AsyncSession]:
    async with database.session() as session:
        yield session


def get_hasher() -> PasswordHasher:
    return PasswordHasher()


def get_token_service(settings: Settings = Depends(get_settings)) -> TokenService:
    return TokenService(settings)


def get_auth_service(
    session: AsyncSession = Depends(get_session),
    hasher: PasswordHasher = Depends(get_hasher),
    tokens: TokenService = Depends(get_token_service),
) -> AuthService:
    return AuthService(
        users=UserRepository(session),
        sessions=RefreshSessionRepository(session),
        hasher=hasher,
        tokens=tokens,
    )
