"""Cryptographic primitives: password hashing and JWT encode/decode."""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from .config import Settings

_BCRYPT_MAX_BYTES = 72  # bcrypt silently ignores bytes past this; enforce it


class PasswordHasher:
    """Thin OOP wrapper around bcrypt."""

    def _prepare(self, raw: str) -> bytes:
        return raw.encode("utf-8")[:_BCRYPT_MAX_BYTES]

    def hash(self, raw: str) -> str:
        return bcrypt.hashpw(self._prepare(raw), bcrypt.gensalt()).decode("utf-8")

    def verify(self, raw: str, hashed: str) -> bool:
        return bcrypt.checkpw(self._prepare(raw), hashed.encode("utf-8"))


class TokenService:
    """Encodes and decodes JWTs. Knows nothing about the database."""

    def __init__(self, settings: Settings) -> None:
        self._secret = settings.jwt_secret
        self._alg = settings.jwt_algorithm
        self._iss = settings.jwt_issuer
        self._access_ttl = settings.access_token_ttl_seconds
        self._refresh_ttl = settings.refresh_token_ttl_seconds

    @property
    def access_ttl(self) -> int:
        return self._access_ttl

    def _encode(
        self,
        *,
        subject: uuid.UUID,
        session_id: uuid.UUID,
        token_type: str,
        ttl: int,
    ) -> tuple[str, datetime]:
        now = datetime.now(tz=timezone.utc)
        expires = now + timedelta(seconds=ttl)
        payload = {
            "sub": str(subject),
            "sid": str(session_id),
            "type": token_type,
            "iss": self._iss,
            "iat": int(now.timestamp()),
            "exp": int(expires.timestamp()),
            "jti": str(uuid.uuid4()),
        }
        return jwt.encode(payload, self._secret, algorithm=self._alg), expires

    def create_access(self, subject: uuid.UUID, session_id: uuid.UUID) -> str:
        token, _ = self._encode(
            subject=subject, session_id=session_id, token_type="access", ttl=self._access_ttl
        )
        return token

    def create_refresh(
        self, subject: uuid.UUID, session_id: uuid.UUID
    ) -> tuple[str, datetime]:
        return self._encode(
            subject=subject, session_id=session_id, token_type="refresh", ttl=self._refresh_ttl
        )

    def decode(self, token: str) -> dict[str, Any]:
        """Verify signature, expiry and issuer. Raises jwt.PyJWTError on failure."""
        return jwt.decode(
            token,
            self._secret,
            algorithms=[self._alg],
            issuer=self._iss,
            options={"require": ["exp", "sub", "sid", "type"]},
        )
