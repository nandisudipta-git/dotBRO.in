"""Node placement strategies. Swap the strategy to change granularity later."""
from abc import ABC, abstractmethod

from .errors import NoCapacity
from .models import Node


class NodeAllocator(ABC):
    """Chooses which node a brand-new user lands on."""

    @abstractmethod
    def choose(self, nodes: list[Node]) -> Node: ...


class LeastLoadedAllocator(NodeAllocator):
    """Pick the active node with the most free capacity (by fill ratio)."""

    def choose(self, nodes: list[Node]) -> Node:
        candidates = [
            n for n in nodes if n.status == "active" and n.assigned_count < n.capacity
        ]
        if not candidates:
            raise NoCapacity()
        return min(candidates, key=lambda n: n.assigned_count / n.capacity)


def build_allocator(strategy: str) -> NodeAllocator:
    allocators: dict[str, type[NodeAllocator]] = {
        "least_loaded": LeastLoadedAllocator,
    }
    return allocators.get(strategy, LeastLoadedAllocator)()
