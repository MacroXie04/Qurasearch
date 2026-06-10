# @qurasearch/server

Self-hostable sync backend for Qurasearch: a thin, **content-blind** Node + Hono
server. Under E2E encryption it only ever stores ciphertext records and auth
material — it can never read clip text, URLs, titles, or group names.

**Status: skeleton.** Endpoints exist and answer, but auth, keys, and sync land
in phases 1–3 of [docs/sync-and-accounts.md §15](../../docs/sync-and-accounts.md#15-phased-plan).

## Endpoints

Per [docs/sync-and-accounts.md §11](../../docs/sync-and-accounts.md#11-backend-shape-appsserver--node--hono):

| method | path | status | phase |
|--------|------|--------|-------|
| GET | `/health` | live — `{"status":"ok"}` | — |
| GET | `/version` | live — `{"version","protocolVersion"}` | — |
| POST | `/auth/register` | 501 stub | 1 |
| POST | `/auth/login` | 501 stub | 1 |
| GET | `/auth/params` | 501 stub | 1 |
| POST | `/auth/refresh` | 501 stub | 1 |
| POST | `/auth/logout` | 501 stub | 1 |
| POST | `/auth/verify-email` | 501 stub | 1 |
| POST | `/auth/reset/request` | 501 stub | 1 |
| POST | `/auth/reset/confirm` | 501 stub | 1 |
| GET | `/sync` | 501 stub (401 without Bearer token) | 3 |
| POST | `/sync` | 501 stub (401 without Bearer token) | 3 |

## Development

```sh
npm install               # at the repo root (workspace-aware lockfile)
npm run dev -w apps/server
curl http://localhost:8787/health
```

Other scripts: `build`, `start`, `lint`, `typecheck`, `test`, `migrate:check`.

## Self-hosting

```sh
cd apps/server
JWT_SECRET=$(openssl rand -base64 48) \
POSTGRES_PASSWORD=$(openssl rand -base64 24) \
docker compose up -d
```

Once the extension's Settings page ships (phase 4), point Settings → Server at
your host; **Test connection** checks `/health` + `/version` protocol
compatibility.

## Environment variables

See [.env.example](.env.example) and [docs/engineering.md §8](../../docs/engineering.md#8-secrets--environments).

| variable | required | default | purpose |
|----------|----------|---------|---------|
| `PORT` | no | `8787` | listen port |
| `DATABASE_URL` | phase 1 | — | Postgres connection string |
| `JWT_SECRET` | phase 1 | — | session JWT signing key (>=32 chars) |
| `SMTP_*` | phase 1 | — | verify/reset email delivery |
