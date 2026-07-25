# auth

Identity service. Issues and validates tokens; the gateway calls it once per
request. Owns a Postgres holding the **minimum**: a user id, handle, and a
password hash — no other PII.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/register` | create a user (handle + password) |
| POST | `/token` | OAuth2 password grant → access + refresh pair |
| POST | `/refresh` | exchange a refresh token for a new pair |
| POST | `/revoke` | invalidate a refresh session |
| POST | `/introspect` | validate a token (RFC 7662-style) — the gateway's call |

## Data flow

```
register  → hash password (bcrypt)        → store user
token     → verify password               → sign access + refresh (JWT)
introspect→ verify signature + not revoked → { active, sub, sid, exp }
```

- **Access token**: short-lived JWT (15 min), stateless — introspect verifies
  the signature.
- **Refresh token**: long-lived (30 d), backed by a DB session row so it can be
  revoked.

## Layout

`api → services → repositories → Postgres`, with `security.py`
(`PasswordHasher` + `TokenService`) holding the crypto. HS256 today; move to
asymmetric keys later.
