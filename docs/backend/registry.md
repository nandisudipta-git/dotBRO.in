# registry

The control plane's routing table. Answers one question for the gateway:
*which node holds this user?* Owns a Postgres of nodes + `user → node` routes.
Stores no user payloads.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/nodes` | register a node (host, port, capacity, …) |
| GET | `/nodes` · `/nodes/{id}` | list / read nodes |
| PATCH | `/nodes/{id}` | update status / capacity |
| DELETE | `/nodes/{id}` | deregister |
| POST | `/resolve` | user → node, **allocating on first contact** |
| GET | `/routes/{user_id}` | read-only lookup (never allocates) |

## Data flow

```
resolve(user):
  route exists?  ──yes──▶ return its node
        │no
        ▼
  allocator picks a node (least-loaded) → save route → return node
```

- `resolve` is the write path (used by the gateway) — it places a new user on a
  node the first time they appear, then that binding is stable.
- `lookup` is the read-only path — raises if no route exists.

## Layout

`api → services → repositories → Postgres`, with `allocator.py` holding the
placement strategy (`least_loaded` for now). Node granularity — per-user vs
per-shard — stays a config decision.
