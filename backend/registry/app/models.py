"""ORM models — nodes (physical machines) and routes (user -> node)."""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Node(Base):
    """A physical machine that holds user data.

    A node is just a row, so a cloud VM and a local box are identical to the
    router — it only ever reads `host`/`port` and connects.
    """

    __tablename__ = "nodes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    kind: Mapped[str] = mapped_column(String(16))          # "cloud" | "local"
    host: Mapped[str] = mapped_column(String(255))         # ip or hostname
    port: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default="active")  # active|draining|offline
    capacity: Mapped[int] = mapped_column(Integer, default=1000)
    assigned_count: Mapped[int] = mapped_column(Integer, default=0)
    shard_range: Mapped[str | None] = mapped_column(String(64), nullable=True)
    mtls_fingerprint: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Route(Base):
    """Maps one user to the node that holds their private data."""

    __tablename__ = "routes"

    user_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    node_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("nodes.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
