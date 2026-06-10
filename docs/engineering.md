# Engineering: CI, Testing & GitHub Management — Plan

Status: **phases R/E implemented** (2026-06-09) · Companion to [sync-and-accounts.md](sync-and-accounts.md)

Production-grade engineering process for the `apps/extension` + `apps/server` +
`packages/shared` monorepo. Implemented so far: repo migration (§2), CI (§3),
security/supply-chain gates (§5), and repo management (§6); the release
workflows of §7 exist as tag-triggered pipelines (Changesets and Chrome Web
Store publishing still pending). The §4 crypto/sync test suites land with
phases 2–3 of the sync plan. Because this is a crypto / E2E product,
correctness and supply-chain integrity are first-class, not afterthoughts.

---

## 1. Principles

- **Every merge to `main` is releasable.** All checks green, or it doesn't land.
- **Workspace-aware**: each package has its own lint/typecheck/test/build; CI runs
  only what changed (path filters) but `main` always runs the full matrix.
- **Crypto is held to a higher bar**: known-answer tests, round-trip properties,
  and an explicit guard that **plaintext never leaves the client**.
- **Self-hosters are first-class**: the server ships as a Docker image + compose
  file with a documented, tested migration path.

---

## 2. Repo migration

The one-time move from the current single-package layout to the monorepo
([sync-and-accounts.md §2](sync-and-accounts.md#2-repository-structure-monorepo)).
Runs only when the user approves leaving planning.

1. `git mv` the extension's tracked files into `apps/extension/` (preserves
   history): `src/ scripts/ dist/ index.html export.html manifest.config.ts
   vite.config.ts vitest.config.ts tsconfig.json eslint.config.js
   .prettierrc.json .prettierignore package.json README.md qurasearch.zip`.
2. Keep at root: `node_modules/` (hoisted), the lockfile (workspace root),
   `.editorconfig`, `.gitignore`, `.github/`, `docs/`.
3. Scaffold `apps/server/` + `packages/shared/` (standard skeletons, no business
   logic) and a workspace-root `package.json` (`"workspaces": ["apps/*",
   "packages/*"]`) + repo-overview `README.md`.
4. `npm install` at root to produce the workspace-aware lockfile.
5. Repoint CI (below) and verify `apps/extension` still typechecks / tests /
   builds green.

> Server standard skeleton: `src/{index,app}.ts`, `src/routes/{auth,sync}.ts`,
> `src/middleware/{auth,rateLimit}.ts`, `src/db/{schema,client,migrations}`,
> `src/lib/{config,hash,jwt}.ts`, `test/`, `.env.example`, `package.json`,
> `tsconfig.json`, `README.md`.

---

## 3. Continuous integration (GitHub Actions)

### Workflows

| workflow | trigger | purpose |
|----------|---------|---------|
| `ci.yml` | push/PR to `main` | lint · typecheck · test · build per workspace |
| `security.yml` | PR + weekly schedule | CodeQL, dependency audit, secret scan |
| `release-extension.yml` | tag `ext-v*` | build, zip, GitHub Release, (later) Chrome Web Store |
| `release-server.yml` | tag `srv-v*` | build + push Docker image to GHCR; deploy gate |

### `ci.yml` shape (workspace-aware)

```yaml
jobs:
  changes:                        # path filter → which workspaces to run
    outputs: { extension, server, shared }
  shared:                         # gate: dependents need it green
    needs: changes
    steps: [setup-node(cache npm, root lock), npm ci, -w packages/shared: typecheck, test, build]
  extension:
    needs: [changes, shared]
    strategy: { matrix: { node: ['20','22'] } }
    steps:
      - npm ci                                         # root (installs workspaces)
      - npm run format:check -w apps/extension
      - npm run lint        -w apps/extension
      - npm run typecheck   -w apps/extension
      - npm test            -w apps/extension          # vitest + coverage
      - npm run build       -w apps/extension
      - run: |                                          # MV3 CSP guard (existing)
          grep -rEn "\beval\(|new Function\(" apps/extension/dist --include='*.js' && exit 1 || true
      - upload-artifact: apps/extension/dist
  server:
    needs: [changes, shared]
    services: { postgres: { image: postgres:16, ... } }  # integration DB
    steps: [npm ci, -w apps/server: lint, typecheck, test (unit+integration), build, migrate:check]
```

- **Caching**: `actions/setup-node` `cache: npm` keyed on the **root lockfile**.
- **Required checks** on `main`: `shared`, `extension (20)`, `extension (22)`,
  `server`, `security`.

---

## 4. Testing strategy

| package | layers |
|---------|--------|
| **shared** | type-level tests (`expect-type`/`tsd`); **zod** schema validation of every envelope/DTO |
| **extension** | unit (vitest, existing) · jsdom component · **crypto KATs + round-trip** (KDF, AES-GCM, wrap/unwrap) · **sync-engine** (LWW, tombstone propagation, offline replay, conflict) on the existing `chrome` mock |
| **server** | unit (LWW upsert, auth handlers, rate-limit) · **integration** vs real Postgres (GH service container / testcontainers): register→login→sync round-trip, token rotation, reset |
| **e2e** (later) | boot server (compose) + drive the extension's sync module: multi-device merge, conflict, tombstone convergence |

**E2E-specific guards (must-have for a crypto product):**

- A test that **captures outgoing request bodies and asserts they contain only
  ciphertext + sync metadata** — never `text`/`url`/`title`/`password`. This is
  the regression net for "the server stays content-blind."
- A test asserting the **server never receives the password or DEK** (only
  `authHash` / `wrapped_dek`).
- Recovery-flow test: wrong recovery code fails closed; correct one re-wraps.

**Coverage**: vitest coverage with thresholds (e.g. lines ≥ 80%, **crypto/sync
modules ≥ 95%**); report to Codecov or as a CI artifact + PR comment.

---

## 5. Security & supply chain

- **CodeQL** static analysis (JS/TS) on PR + schedule.
- **Dependency audit**: `npm audit --audit-level=high` gate + **Dependabot**
  (npm + GitHub Actions ecosystems) with grouped PRs.
- **Secret scanning**: GitHub native + `gitleaks` in CI; `.env` gitignored,
  `.env.example` committed.
- **MV3 CSP eval guard** (existing) kept as a required check.
- **Pinned action SHAs** for third-party actions; least-privilege `GITHUB_TOKEN`
  permissions per workflow.
- **SECURITY.md**: responsible-disclosure policy + contact — important for an
  E2E app inviting scrutiny of the crypto.

---

## 6. GitHub repository management

- **Branch protection on `main`**: PR required; required status checks (§3) must
  pass and branch up-to-date; ≥1 review; dismiss stale approvals; no force-push;
  linear history.
- **CODEOWNERS**: route `apps/server`, `packages/shared` (the crypto/protocol
  surface) to required reviewers.
- **Templates**: PR template (testing checklist, "touches crypto/protocol?"
  prompt), issue templates (bug / feature / security-redirect-to-SECURITY.md).
- **Labels & automation**: `area:extension|server|shared`, `type:*`,
  auto-labeler by path; stale-bot optional.
- **Status badges** in the root README (CI, coverage, latest release).

---

## 7. Versioning, releases & deploy

- **Independent versioning** via **Changesets**: extension, server, and shared
  version separately; release notes generated from changesets. (`release-please`
  is the alternative.)
- **Extension release** (`ext-v*` tag): build → `dist/` + `qurasearch.zip` →
  GitHub Release. Later: auto-publish to the **Chrome Web Store** via its API
  using a CI secret; the protocol version in `@qurasearch/shared` gates
  compatibility.
- **Server release** (`srv-v*` tag): build multi-arch **Docker image → GHCR**;
  ship a `docker-compose.yml` (server + Postgres) for self-hosters; run
  migrations on deploy; `/health` + `/version` (also used by the extension's
  **Settings → Test connection**).
- **Environments**: GitHub `staging` / `production` environments with required
  reviewers and per-environment secrets gating server deploys.
- **Compatibility**: extension and server advertise a **protocol version**; a
  mismatch is surfaced in Settings rather than failing opaquely.

---

## 8. Secrets & environments

| secret | used by | where |
|--------|---------|-------|
| `DATABASE_URL` | server runtime/tests | env / GH Environment |
| `JWT_SECRET` (access+refresh) | server | GH Environment |
| `SMTP_*` | server (verify/reset email) | GH Environment |
| `CHROME_WEBSTORE_*` | extension release | repo/Environment secret |
| `GHCR` (via `GITHUB_TOKEN`) | server image push | workflow permission |

Never committed; `.env.example` documents the shape. Local dev uses a
`.env`-loaded config (`apps/server/src/lib/config.ts`).

---

## 9. Suggested sequencing

Aligns with [sync-and-accounts.md §15](sync-and-accounts.md#15-phased-plan):

1. **Phase R/E first**: do the repo migration, stand up `ci.yml` (extension +
   shared), branch protection, Dependabot, SECURITY.md — *before* feature code,
   so every subsequent PR is gated.
2. Add **server CI** (with Postgres service) when `apps/server` gets its skeleton.
3. Add **crypto/sync test suites** alongside phases 2–3 (they're the highest-risk
   code — write tests with, not after).
4. Add **release/deploy pipelines** as phase 4 nears (something to ship).
