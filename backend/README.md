# .Bro backend

Privacy-first FastAPI microservices. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full design.

## Built so far

| Service | Port (dev) | Purpose |
|---|---|---|
| **gateway** | `:8000` | Public edge — validates the bearer token via auth, resolves the caller's node via registry, reverse-proxies the request. Holds no data. |
| **auth** | `:8001` | OAuth2 / JWT identity — register, token, refresh, revoke, introspect |
| **registry** | `:8002` | Node inventory + `user → node` routing (control plane) |

Each service is independent: its own `Dockerfile` and `requirements.txt`. auth
and registry each own a Postgres; the gateway is stateless (no DB).

## Run

```bash
cp .env.example .env        # edit secrets
docker compose up --build
```

Then:
- Gateway → http://localhost:8000  (public edge; `/health` + the proxy)
- Auth docs → http://localhost:8001/docs
- Registry docs → http://localhost:8002/docs

> Only the gateway's port is public. Auth + registry are exposed on `:8001` /
> `:8002` for **development only** — in production they stay on the private
> network and only the gateway is reachable.

## Quick smoke test

```bash
# 1. register a user
curl -X POST localhost:8001/register \
  -H 'content-type: application/json' \
  -d '{"handle":"ron","password":"supersecret"}'

# 2. get a token (OAuth2 password grant — form-encoded)
curl -X POST localhost:8001/token \
  -d 'username=ron&password=supersecret'

# 3. introspect the access token (what the gateway will do)
curl -X POST localhost:8001/introspect \
  -H 'content-type: application/json' \
  -d '{"token":"<access_token>"}'

# 4. register a node
curl -X POST localhost:8002/nodes \
  -H 'content-type: application/json' \
  -d '{"name":"node-a","kind":"local","host":"10.0.0.5","port":9000,"capacity":500}'

# 5. resolve a user to a node (what the gateway does internally)
curl -X POST localhost:8002/resolve \
  -H 'content-type: application/json' \
  -d '{"user_id":"<user id from step 1>"}'

# 6. hit the gateway with the access token — it introspects, resolves the
#    node, and proxies. (Needs a node registered in step 4; returns 502/503
#    until a node service actually answers.)
curl localhost:8000/ping -H 'authorization: Bearer <access_token>'
```

## Layout (per service)

```
app/
  main.py          # FastAPI app factory + lifespan + error handlers
  config.py        # env-driven Settings
  database.py      # async engine + session
  models.py        # SQLAlchemy ORM
  schemas.py       # Pydantic wire contract
  security.py      # (auth) password hashing + JWT      \  OOP layers:
  allocator.py     # (registry) node placement strategy  }  repository -> service
  repositories.py  # data access                         /  -> api
  services.py      # business logic
  dependencies.py  # FastAPI DI wiring
  api.py           # routes
  errors.py        # domain exceptions -> HTTP
```

## Not yet built

node · feed · reco. The **router** is folded into the gateway for now (it does
the resolve-and-forward itself); extract it into its own mTLS switchboard when
node fan-out or per-node mTLS makes that worth the hop. Schema is bootstrapped
via `create_all` on startup — swap to Alembic migrations before production.
