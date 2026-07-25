"""Business logic. Orchestrates repositories + crypto; no HTTP, no SQL here."""
import uuid
from datetime import datetime, timezone

import jwt

from .errors import HandleTaken, InactiveUser, InvalidCredentials, InvalidToken
from .models import RefreshSession, User
from .repositories import RefreshSessionRepository, UserRepository
from .schemas import IntrospectionResult, TokenPair
from .security import PasswordHasher, TokenService


class AuthService:
    def __init__(
        self,
        users: UserRepository,
        sessions: RefreshSessionRepository,
        hasher: PasswordHasher,
        tokens: TokenService,
    ) -> None:
        self._users = users
        self._sessions = sessions
        self._hasher = hasher
        self._tokens = tokens

    # ---------------------------------------------------------------- users
    async def register(self, handle: str, password: str) -> User:
        if await self._users.get_by_handle(handle) is not None:
            raise HandleTaken()
        user = User(handle=handle, password_hash=self._hasher.hash(password))
        return await self._users.add(user)

    async def authenticate(self, handle: str, password: str) -> TokenPair:
        user = await self._users.get_by_handle(handle)
        if user is None or not self._hasher.verify(password, user.password_hash):
            raise InvalidCredentials()
        if not user.is_active:
            raise InactiveUser()
        return await self._issue_pair(user)

    # --------------------------------------------------------------- tokens
    async def refresh(self, refresh_token: str) -> TokenPair:
        claims = self._decode_or_raise(refresh_token)
        if claims.get("type") != "refresh":
            raise InvalidToken()

        session = await self._sessions.get(uuid.UUID(claims["sid"]))
        if session is None or session.revoked:
            raise InvalidToken()

        user = await self._users.get(uuid.UUID(claims["sub"]))
        if user is None or not user.is_active:
            raise InvalidToken()

        # Rotate: the old session dies, a fresh pair is minted.
        session.revoked = True
        return await self._issue_pair(user)

    async def revoke(self, refresh_token: str) -> None:
        try:
            claims = self._tokens.decode(refresh_token)
        except jwt.PyJWTError:
            return  # revoking an unreadable token is a no-op
        await self._sessions.revoke(uuid.UUID(claims["sid"]))

    async def introspect(self, token: str) -> IntrospectionResult:
        try:
            claims = self._tokens.decode(token)
        except jwt.PyJWTError:
            return IntrospectionResult(active=False)

        session = await self._sessions.get(uuid.UUID(claims["sid"]))
        if session is None or session.revoked:
            return IntrospectionResult(active=False)

        return IntrospectionResult(
            active=True,
            sub=claims["sub"],
            sid=claims["sid"],
            token_type=claims["type"],
            exp=claims["exp"],
            iss=claims.get("iss"),
        )

    # -------------------------------------------------------------- helpers
    async def _issue_pair(self, user: User) -> TokenPair:
        session_id = uuid.uuid4()
        refresh_token, expires_at = self._tokens.create_refresh(user.id, session_id)
        access_token = self._tokens.create_access(user.id, session_id)
        await self._sessions.add(
            RefreshSession(id=session_id, user_id=user.id, expires_at=expires_at)
        )
        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=self._tokens.access_ttl,
        )

    def _decode_or_raise(self, token: str) -> dict:
        try:
            return self._tokens.decode(token)
        except jwt.PyJWTError as exc:
            raise InvalidToken() from exc
