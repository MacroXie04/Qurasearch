# Qurasearch

[![CI](https://github.com/MacroXie04/Qurasearch/actions/workflows/ci.yml/badge.svg)](https://github.com/MacroXie04/Qurasearch/actions/workflows/ci.yml)
[![Security](https://github.com/MacroXie04/Qurasearch/actions/workflows/security.yml/badge.svg)](https://github.com/MacroXie04/Qurasearch/actions/workflows/security.yml)

A **local-first** Chrome extension (Manifest V3) for clipping text from any web
page into the side panel: select text, right‑click **"Add to Qurasearch"**, and
organize clips into colored groups — with jump‑back‑and‑highlight to the exact
spot on the source page and a standalone export page. Everything works offline
with no account; **optional self‑hosted, end‑to‑end‑encrypted sync** is planned
— the server stores only ciphertext and can never read your clips
([design](docs/sync-and-accounts.md)).

---

## Repository structure

An npm‑workspaces monorepo ([sync-and-accounts.md §2](docs/sync-and-accounts.md#2-repository-structure-monorepo)).
`apps/extension` is the shipping product today; `apps/server` and
`packages/shared` are skeletons until the [§15 phases](docs/sync-and-accounts.md#15-phased-plan) land.

```
qurasearch/
├─ apps/
│  ├─ extension/        ← the MV3 extension (everything that ships today)
│  └─ server/           ← Node + Hono sync backend, self-hosted (skeleton)
├─ packages/
│  └─ shared/           ← shared TS types + zod schemas: envelope, DTOs, PROTOCOL_VERSION
├─ docs/                ← the design plans: sync-and-accounts.md + engineering.md
├─ .github/workflows/   ← monorepo CI (workspace-aware)
├─ package.json         ← workspace root: { "workspaces": ["apps/*", "packages/*"] }
└─ README.md            ← this file
```

---

## Getting started

```bash
npm install                       # once, at the root (installs all workspaces)

npm run dev -w apps/extension     # extension dev loop — see apps/extension/README.md
npm run dev -w apps/server        # server skeleton on http://localhost:8787
npm run check                     # everything: format/lint/typecheck/test across workspaces
```

The extension needs no build to try: load `apps/extension/dist/` unpacked —
install and usage docs live in [apps/extension/README.md](apps/extension/README.md).

---

## Engineering process

- [docs/engineering.md](docs/engineering.md) — CI (lint · typecheck · test ·
  build per workspace), the required checks on `main`, security/supply-chain
  gates, and release tags: `ext-v*` for the extension, `srv-v*` for the server
  (Docker image to GHCR).
- [docs/sync-and-accounts.md](docs/sync-and-accounts.md) — the accounts + E2E
  sync design: key model, sync protocol, threat model, phased plan.
- Independent per-package versioning via **Changesets** is planned
  ([engineering.md §7](docs/engineering.md#7-versioning-releases--deploy)).

---

## Security

Qurasearch is designed so the sync server is **content-blind**: it sees only
ciphertext and sync metadata — never plaintext clips, URLs, passwords, or the
data encryption key. Scrutiny of the crypto design is explicitly welcome. To
report a vulnerability (privately, please — never via a public issue), see
[SECURITY.md](SECURITY.md).
