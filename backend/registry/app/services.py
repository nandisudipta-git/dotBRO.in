"""Registry business logic — node lifecycle + user routing/allocation."""
import uuid

from .allocator import NodeAllocator
from .errors import NodeNameTaken, NodeNotFound, RouteNotFound
from .models import Node
from .repositories import NodeRepository, RouteRepository
from .schemas import NodeCreate, NodeUpdate


class RegistryService:
    def __init__(
        self,
        nodes: NodeRepository,
        routes: RouteRepository,
        allocator: NodeAllocator,
    ) -> None:
        self._nodes = nodes
        self._routes = routes
        self._allocator = allocator

    # ---------------------------------------------------------- node CRUD
    async def register_node(self, data: NodeCreate) -> Node:
        if await self._nodes.get_by_name(data.name) is not None:
            raise NodeNameTaken()
        node = Node(**data.model_dump())
        return await self._nodes.add(node)

    async def list_nodes(self) -> list[Node]:
        return await self._nodes.list()

    async def get_node(self, node_id: uuid.UUID) -> Node:
        node = await self._nodes.get(node_id)
        if node is None:
            raise NodeNotFound()
        return node

    async def update_node(self, node_id: uuid.UUID, data: NodeUpdate) -> Node:
        node = await self.get_node(node_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(node, field, value)
        return node

    async def deregister_node(self, node_id: uuid.UUID) -> None:
        node = await self.get_node(node_id)
        await self._nodes.delete(node)

    # ------------------------------------------------------------ routing
    async def resolve(self, user_id: uuid.UUID) -> Node:
        """Return the user's node, allocating one on first contact."""
        route = await self._routes.get(user_id)
        if route is not None:
            node = await self._nodes.get(route.node_id)
            if node is not None:
                return node
            # Route pointed at a vanished node — fall through and re-place.
        return await self._allocate(user_id)

    async def lookup(self, user_id: uuid.UUID) -> Node:
        """Read-only: return the node or raise (never allocates)."""
        route = await self._routes.get(user_id)
        if route is None:
            raise RouteNotFound()
        node = await self._nodes.get(route.node_id)
        if node is None:
            raise RouteNotFound()
        return node

    async def _allocate(self, user_id: uuid.UUID) -> Node:
        nodes = await self._nodes.list()
        node = self._allocator.choose(nodes)  # raises NoCapacity if none fit
        node.assigned_count += 1
        await self._routes.upsert(user_id, node.id)
        return node
