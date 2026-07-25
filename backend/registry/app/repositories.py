"""Repository layer for the registry."""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Node, Route


class NodeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, node: Node) -> Node:
        self._session.add(node)
        await self._session.flush()
        return node

    async def get(self, node_id: uuid.UUID) -> Node | None:
        return await self._session.get(Node, node_id)

    async def get_by_name(self, name: str) -> Node | None:
        result = await self._session.execute(select(Node).where(Node.name == name))
        return result.scalar_one_or_none()

    async def list(self) -> list[Node]:
        result = await self._session.execute(select(Node).order_by(Node.created_at))
        return list(result.scalars().all())

    async def delete(self, node: Node) -> None:
        await self._session.delete(node)


class RouteRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, user_id: uuid.UUID) -> Route | None:
        return await self._session.get(Route, user_id)

    async def upsert(self, user_id: uuid.UUID, node_id: uuid.UUID) -> Route:
        route = await self._session.get(Route, user_id)
        if route is None:
            route = Route(user_id=user_id, node_id=node_id)
            self._session.add(route)
        else:
            route.node_id = node_id
        await self._session.flush()
        return route
