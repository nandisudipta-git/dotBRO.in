"""HTTP layer for the registry."""
import uuid

from fastapi import APIRouter, Depends, status

from .dependencies import get_registry_service
from .schemas import (
    NodeCreate,
    NodeResponse,
    NodeUpdate,
    ResolveRequest,
    RouteResponse,
)
from .services import RegistryService

router = APIRouter()


@router.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "bro-registry"}


# ----------------------------------------------------------------- nodes
@router.post(
    "/nodes",
    response_model=NodeResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["nodes"],
)
async def register_node(
    body: NodeCreate,
    service: RegistryService = Depends(get_registry_service),
) -> NodeResponse:
    node = await service.register_node(body)
    return NodeResponse.model_validate(node)


@router.get("/nodes", response_model=list[NodeResponse], tags=["nodes"])
async def list_nodes(
    service: RegistryService = Depends(get_registry_service),
) -> list[NodeResponse]:
    nodes = await service.list_nodes()
    return [NodeResponse.model_validate(n) for n in nodes]


@router.get("/nodes/{node_id}", response_model=NodeResponse, tags=["nodes"])
async def get_node(
    node_id: uuid.UUID,
    service: RegistryService = Depends(get_registry_service),
) -> NodeResponse:
    return NodeResponse.model_validate(await service.get_node(node_id))


@router.patch("/nodes/{node_id}", response_model=NodeResponse, tags=["nodes"])
async def update_node(
    node_id: uuid.UUID,
    body: NodeUpdate,
    service: RegistryService = Depends(get_registry_service),
) -> NodeResponse:
    return NodeResponse.model_validate(await service.update_node(node_id, body))


@router.delete(
    "/nodes/{node_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["nodes"],
)
async def deregister_node(
    node_id: uuid.UUID,
    service: RegistryService = Depends(get_registry_service),
) -> None:
    await service.deregister_node(node_id)


# --------------------------------------------------------------- routing
@router.post("/resolve", response_model=RouteResponse, tags=["routing"])
async def resolve_route(
    body: ResolveRequest,
    service: RegistryService = Depends(get_registry_service),
) -> RouteResponse:
    """Router calls this: returns the user's node, allocating on first contact."""
    node = await service.resolve(body.user_id)
    return RouteResponse(user_id=body.user_id, node=NodeResponse.model_validate(node))


@router.get("/routes/{user_id}", response_model=RouteResponse, tags=["routing"])
async def lookup_route(
    user_id: uuid.UUID,
    service: RegistryService = Depends(get_registry_service),
) -> RouteResponse:
    """Read-only lookup — 404 if the user has no node yet."""
    node = await service.lookup(user_id)
    return RouteResponse(user_id=user_id, node=NodeResponse.model_validate(node))
