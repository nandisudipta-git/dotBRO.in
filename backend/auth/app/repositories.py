"""Repository layer — the only place that talks to the ORM session."""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import RefreshSession, User


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, user: User) -> User:
        self._session.add(user)
        await self._session.flush()
        return user

    async def get(self, user_id: uuid.UUID) -> User | None:
        return await self._session.get(User, user_id)

    async def get_by_handle(self, handle: str) -> User | None:
        result = await self._session.execute(select(User).where(User.handle == handle))
        return result.scalar_one_or_none()


class RefreshSessionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, session_row: RefreshSession) -> RefreshSession:
        self._session.add(session_row)
        await self._session.flush()
        return session_row

    async def get(self, session_id: uuid.UUID) -> RefreshSession | None:
        return await self._session.get(RefreshSession, session_id)

    async def revoke(self, session_id: uuid.UUID) -> None:
        session_row = await self._session.get(RefreshSession, session_id)
        if session_row is not None:
            session_row.revoked = True
