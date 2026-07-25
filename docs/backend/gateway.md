# gateway

The single public service. Authenticates every request, finds the caller's
node, and reverse-proxies to it. Holds **no** data — one shared httpx pool is
its only state.

## Data flow

```
1. bearer token   ──▶ auth /introspect      → verified user_id
2. user_id        ──▶ registry /resolve     → node host:port
3. original request ─▶ http://node/…        → response streamed back
```

Everything except `/health` hits the catch-all proxy route.

## Security

- Bearer token is validated by auth and **never forwarded** to the node.
- Inbound `X-Bro-User` is stripped and replaced with the *verified* id — a
  caller cannot impersonate another user.
- Hop-by-hop headers (RFC 7230) are dropped both directions.
- The node trusts `X-Bro-User` only because it is unreachable except through
  this gateway.

## Layout

`config · errors · schemas · clients · services · dependencies · api · main`.
No `database`/`models` — it is stateless. `clients.py` wraps the two
control-plane calls; `services.py` does auth → resolve → proxy.

## Notes

- **Router folded in:** the gateway resolves + forwards itself. Extract a
  standalone mTLS switchboard once node fan-out warrants it.
- Returns `401` (bad/no token), `502` (upstream down), `503` (no node).
