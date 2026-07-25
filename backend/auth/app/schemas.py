"""Pydantic request/response models — the wire contract."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RegisterRequest(BaseModel):
    handle: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=128)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    handle: str
    created_at: datetime


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # access-token lifetime in seconds


class RefreshRequest(BaseModel):
    refresh_token: str


class IntrospectRequest(BaseModel):
    token: str


class IntrospectionResult(BaseModel):
    """RFC 7662-style response. `active` is the only guaranteed field."""

    active: bool
    sub: str | None = None
    sid: str | None = None
    token_type: str | None = None
    exp: int | None = None
    iss: str | None = None
