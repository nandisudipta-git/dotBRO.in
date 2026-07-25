"""HTTP layer — routes translate requests into service calls and back."""
from fastapi import APIRouter, Depends, status
from fastapi.security import OAuth2PasswordRequestForm

from .dependencies import get_auth_service
from .schemas import (
    IntrospectionResult,
    IntrospectRequest,
    RefreshRequest,
    RegisterRequest,
    TokenPair,
    UserResponse,
)
from .services import AuthService

router = APIRouter()


@router.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "bro-auth"}


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["identity"],
)
async def register(
    body: RegisterRequest,
    service: AuthService = Depends(get_auth_service),
) -> UserResponse:
    user = await service.register(body.handle, body.password)
    return UserResponse.model_validate(user)


@router.post("/token", response_model=TokenPair, tags=["identity"])
async def issue_token(
    form: OAuth2PasswordRequestForm = Depends(),
    service: AuthService = Depends(get_auth_service),
) -> TokenPair:
    """OAuth2 password grant. Returns an access + refresh pair."""
    return await service.authenticate(form.username, form.password)


@router.post("/refresh", response_model=TokenPair, tags=["identity"])
async def refresh_token(
    body: RefreshRequest,
    service: AuthService = Depends(get_auth_service),
) -> TokenPair:
    return await service.refresh(body.refresh_token)


@router.post("/revoke", status_code=status.HTTP_204_NO_CONTENT, tags=["identity"])
async def revoke_token(
    body: RefreshRequest,
    service: AuthService = Depends(get_auth_service),
) -> None:
    await service.revoke(body.refresh_token)


@router.post("/introspect", response_model=IntrospectionResult, tags=["identity"])
async def introspect(
    body: IntrospectRequest,
    service: AuthService = Depends(get_auth_service),
) -> IntrospectionResult:
    """Called by the gateway once per request to validate a bearer token."""
    return await service.introspect(body.token)
