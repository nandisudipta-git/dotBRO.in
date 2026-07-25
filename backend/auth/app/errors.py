"""Domain exceptions. The API layer maps these to HTTP responses."""


class AuthError(Exception):
    status_code = 400
    detail = "auth error"


class HandleTaken(AuthError):
    status_code = 409
    detail = "handle already taken"


class InvalidCredentials(AuthError):
    status_code = 401
    detail = "invalid credentials"


class InactiveUser(AuthError):
    status_code = 403
    detail = "user is inactive"


class InvalidToken(AuthError):
    status_code = 401
    detail = "invalid or expired token"
