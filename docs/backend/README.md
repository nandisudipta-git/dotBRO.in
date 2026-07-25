# .Bro backend — docs

Privacy-first microservices. Each user's data lives on one physical **node**;
nothing central holds it. The control plane only decides *who* is asking and
*which* node — never *what*.

## Request path

```
client ──▶ gateway ──(introspect)──▶ auth
                └────(resolve)──────▶ registry
                └────(proxy)────────▶ node   (user's machine)
```

Only the **gateway** is public. `auth` and `registry` sit on a private network.

## Services

| Doc | Service | Role |
|---|---|---|
| [gateway.md](./gateway.md) | gateway | Public edge — authenticates, resolves, proxies. Stateless. |
| [auth.md](./auth.md) | auth | Identity — OAuth2 / JWT. Owns a Postgres. |
| [registry.md](./registry.md) | registry | `user → node` routing + node inventory. Owns a Postgres. |

Not yet built: `node · feed · reco`. The **router** is folded into the gateway
for v0.1 (see gateway.md).

> Design reference: [`../../backend/ARCHITECTURE.md`](../../backend/ARCHITECTURE.md).
