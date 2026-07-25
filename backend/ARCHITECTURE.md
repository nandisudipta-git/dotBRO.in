# .Bro Backend — Architecture (draft v0.1)

**Primary concern: privacy.** Privacy comes from **isolation + minimal central state**. Each user's data lives on one physical machine ("node"). Nothing central holds their data. A router decides *which* node; the API layer proves *who* is asking.

Stack: **FastAPI (Python)**.

---

## Layers

### 1. API Gateway (FastAPI, stateless)
- TLS in, request validation, rate limiting.
- Holds **no** user data — can scale or be replaced freely.
- Two jobs only: authenticate the caller, then hand off to the router.

### 2. Identity / Auth module
- Verifies the user before anything else runs.
- Privacy-first choice: **public-key / passwordless** — the device holds the private key, the server stores only the public key — plus short-lived tokens.
- Central store keeps the **minimum**: an ID and a public key. No plaintext PII.

### 3. Router / Dispatch module
- Maps `user_id → node` via a configurable routing table.
- Forwards the authenticated request to that user's physical machine.
- Talks to nodes over **mTLS** (both sides prove identity).
- Stores no payloads — it's a switchboard.

> **v0.1 note:** the router is currently *folded into the gateway* — the gateway
> resolves the node (via registry) and forwards itself. Extract it into a
> standalone mTLS switchboard once node fan-out or per-node mTLS makes the extra
> hop worthwhile. The routing table already lives independently in `registry`.

### 4. Node servers (configurable physical machines)
- Do the real work and hold that user's data.
- **Encrypted at rest**, ideally per-user keys so one node cannot read another's users.
- Adding capacity = registering a new node in the routing table.

---

## Data flow

```
Client → Gateway (auth) → Router (lookup node) → Node (mTLS) → response
```

---

## Frontend integration

**Plain HTML — no React needed.** The frontend is dumb, the backend is smart. All identity/data logic stays server-side; the browser only holds a short-lived token + the user's private key.

- **Start:** static HTML + a small `api.js` (fetch wrapper that attaches the auth token) calling the FastAPI JSON API.
- **If it gets interactive:** add **htmx** or **Alpine.js** — one `<script>` tag, no build step, no npm.
- **React only if** a page becomes a heavy dashboard (lots of client state, real-time UI). Can be added to *one* page later — the API stays the same.

Privacy bonus: no big JS bundle, fewer third-party scripts, smaller attack surface.

---

## Microservice layout (Docker Compose)

Each layer is one container. Only `gateway` is exposed; the rest sit on a private Docker network and talk over mTLS.

```
docker compose
├── gateway     FastAPI, public :443       ← only public service
├── auth        FastAPI, internal only
├── router      FastAPI, internal only
├── node        FastAPI, internal — scale to N
└── registry    routing table + public keys (db)
```

Scaling a node tier: `docker compose up --scale node=3`.
Starter compose file: [`docker-compose.yml`](./docker-compose.yml).

---

## Privacy rules (baked in)

- **Data minimization** — store only what's needed.
- **Encrypt in transit** (TLS / mTLS) and **at rest**.
- **Per-user isolation** by physical node.
- **Audit log of access, never of content.**

---

## Repo shape

```
backend/
  gateway/     # FastAPI app, entrypoint
  auth/        # identity verification
  router/      # user→node dispatch
  node/        # per-machine service
  shared/      # schemas, crypto, mTLS certs
```

---

## Open decisions

- [ ] **Node granularity**: one machine per user, or per shard (group of users)? Drives router + key design.
- [ ] Auth scheme details (token lifetime, key rotation).
- [ ] Node registration / discovery mechanism.
- [ ] At-rest encryption: per-user keys vs per-node.

---

*Draft — build on this. Next: pin node granularity.*