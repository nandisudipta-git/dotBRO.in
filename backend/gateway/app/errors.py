"""Domain exceptions. The API layer maps these to HTTP responses."""


class GatewayError(Exception):
    status_code = 400
    detail = "gateway error"


class Unauthenticated(GatewayError):
    status_code = 401
    detail = "missing or invalid credentials"


class NodeUnavailable(GatewayError):
    status_code = 503
    detail = "no node available for this user"


class UpstreamUnavailable(GatewayError):
    status_code = 502
    detail = "an upstream service is unavailable"
