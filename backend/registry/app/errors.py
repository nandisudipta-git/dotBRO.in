"""Domain exceptions for the registry."""


class RegistryError(Exception):
    status_code = 400
    detail = "registry error"


class NodeNameTaken(RegistryError):
    status_code = 409
    detail = "node name already registered"


class NodeNotFound(RegistryError):
    status_code = 404
    detail = "node not found"


class RouteNotFound(RegistryError):
    status_code = 404
    detail = "no route for user"


class NoCapacity(RegistryError):
    status_code = 503
    detail = "no active node has spare capacity"
