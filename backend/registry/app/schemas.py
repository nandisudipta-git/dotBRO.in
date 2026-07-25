"""Pydantic request/response models for the registry."""
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class NodeCreate(BaseModel):
    name: str = Field(min_length=2, max_length=64)
    kind: Literal["cloud", "local"]
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(ge=1, le=65535)
    capacity: int = Field(default=1000, ge=1)
    shard_range: str | None = None
    mtls_fingerprint: str | None = None


class NodeUpdate(BaseModel):
    """All optional — patch semantics."""

    host: str | None = Field(default=None, max_length=255)
    port: int | None = Field(default=None, ge=1, le=65535)
    status: Literal["active", "draining", "offline"] | None = None
    capacity: int | None = Field(default=None, ge=1)
    shard_range: str | None = None
    mtls_fingerprint: str | None = None


class NodeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    kind: str
    host: str
    port: int
    status: str
    capacity: int
    assigned_count: int
    shard_range: str | None
    mtls_fingerprint: str | None
    created_at: datetime


class ResolveRequest(BaseModel):
    user_id: uuid.UUID


class RouteResponse(BaseModel):
    """What the router needs to reach a user's node."""

    user_id: uuid.UUID
    node: NodeResponse
