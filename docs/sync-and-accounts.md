# Accounts & End-to-End-Encrypted Sync — Design

Status: **planning / pre-implementation** · Last updated: 2026-06-09

This document is the agreed design for adding **optional accounts + cross-device
sync** to Qurasearch, which is today a 100% local extension. It is a plan, not
implementation — **no files have been moved and no code written yet.** Major
forks are decided; remaining defaults are in
[§14](#14-open-decisions--chosen-defaults). Engineering process (CI, testing,
GitHub) lives in its own plan: [engineering.md](engineering.md).

---

## 1. Goals & non-goals

**Goals**

- Two modes, the user's choice:
  - **Local-only** (default, unchanged): no account, no network, zero friction.
  - **Online**: log into a first-party account; **all content** (groups, clips,
    settings) syncs across the user's devices.
- **Self-hostable**: the backend is the user's own server. The extension does
  **not** hardcode one host — online mode lets the user **choose which backend
  server to connect to** ([§4](#4-settings-page--backend-server-selection)).
- **Offline-first**: the UI always reads/writes `chrome.storage.local` (zero
  latency, works offline); sync reconciles in the background.
- **End-to-end encrypted (E2E)**: the server stores only ciphertext. It can
  never read clip text, URLs, titles, or group names.
- **First-party accounts** (email + password). Google / passkey login is
  **deferred** but the key model leaves room for it with no rework.

**Non-goals (for now)**

- Real-time collaboration / shared groups between users.
- Server-side search or a web client (impossible under E2E; search stays
  client-side, which it already is).
- Forward secrecy via DEK rotation + full re-encryption (noted as v2).
- Google / passkey login (designed-for, not built — [§9](#9-multi-slot-key-model-future-login-methods)).

---

## 2. Repository structure (monorepo)

Decided: an **npm-workspaces monorepo** with the conventional `apps/` (things
that run) and `packages/` (things that are imported) split. This directly
supports the shared TypeScript types the sync protocol needs.

```
qurasearch/
├─ apps/
│  ├─ extension/        ← the MV3 extension (today's repo root moves here)
│  └─ server/           ← Node + Hono backend (self-hosted)
├─ packages/
│  └─ shared/           ← shared TS types: envelope, sync records, DTOs, protocol version
├─ docs/                ← this plan + engineering.md
├─ .github/workflows/   ← monorepo CI (see engineering.md)
├─ package.json         ← workspace root: { "workspaces": ["apps/*", "packages/*"] }
└─ README.md            ← repo overview
```

- The extension keeps its own `package.json` / build; the lockfile lives once at
  the workspace **root**.
- `@qurasearch/shared` is imported by **both** `apps/extension` and
  `apps/server`, so an envelope-field mismatch is a **compile error**, not silent
  data corruption.
- **Executed** (phase R, 2026-06-09): the restructure landed as described —
  `git mv` of the extension into `apps/extension` (history preserved),
  `apps/server` + `packages/shared` scaffolded as skeletons, workspace root
  added, CI repointed. Details in [engineering.md §Repo migration](engineering.md#repo-migration).

---

## 3. The two modes (account state machine)

```
            enable online                  set up keys + initial push
 LOCAL-ONLY ───────────────► REGISTER/LOGIN ─────────────────────────► ONLINE
   ▲  (default)              (on chosen server)                          │ │
   │                                                                     │ │ background
   │  switch to local / logout (keep │ wipe local)                       │ │ push/pull
   └──────────────────────────────────────────────────────────────────◄─┘ ◄┘
```

- **Default is local-only.** Installing and using the extension never requires
  an account or network — preserving the current product's core advantage.
- **Going online** = pick a server ([§4](#4-settings-page--backend-server-selection)),
  register or log in, then set up the encryption key ([§7](#7-cryptography)). On
  first enable with existing local data, that data is **encrypted and merged
  into the account** (reusing `store.ts`'s `importBackup` "merge" semantics),
  never overwritten.
- **Switching back to local / logout** prompts: *keep local copy* (default) or
  *wipe local*. Keeping is safe because data also lives in the account.
- **Locked vs unlocked**: the unwrapped DEK is cached in `chrome.storage.local`
  so the user is not re-prompted for the password on every browser restart.
  Tradeoff in [§12](#12-mv3--extension-specifics) / [§13](#13-threat-model--what-leaks).

---

## 4. Settings page & backend server selection

Online mode is self-hosted-first, so the server is **configurable**, not baked
in. A dedicated **Settings page** owns this.

### Settings page

A free-standing extension **options page** (same pattern as the existing export
page — its own HTML entry opened in a full tab), reachable from the side-panel
**⋮** menu. Sections:

| Section | Contents |
|---------|----------|
| **Mode** | Local-only ⇄ Online toggle |
| **Server** (online) | server URL, **Test connection**, shows server version + protocol compatibility |
| **Account** (online) | register / log in / log out, current email, **recovery code** management |
| **Sync** (online) | last-synced time, pending-change count, **Sync now** |
| **Devices** (later) | enrolled devices, revoke |
| **Data** | export / import backup (existing), **wipe local**, **delete account** |
| **Security** (later) | auto-lock after N hours |

### Backend server selection

- **Server URL** field (base API URL), **https-only** validated. Optionally a
  pre-filled default instance + a "custom self-hosted" choice; for the
  self-hosted ethos the user can always point at their own host.
- **Test connection** hits the server's unauthenticated **health/version**
  endpoint and surfaces the **protocol version** (from `@qurasearch/shared`); a
  mismatch between extension and server is shown before the user commits.
- **The server URL binds the account.** Your account, keys, and data live on one
  server; changing the URL is effectively switching accounts / logging out.
  This is made explicit in the UI (not a silent rebind).
- **Device-local, not synced.** Server URL, unlock state, and similar live in
  device-local storage — they are *how you reach* sync, not synced content. Keep
  them separate from the E2E-synced `settings` record (which holds e.g.
  `pinnedGroupId`).
- **Host permission.** Fetching the chosen server needs host access to its
  origin. Preferred: request it at selection time via **`optional_host_permissions`**
  (least privilege) rather than relying on the broad `<all_urls>` the extension
  already holds for jump-to-highlight. Decision recorded in
  [§14](#14-open-decisions--chosen-defaults).
- **Safety.** Because auth is E2E (the server only ever sees `authHash`, never
  the password — [§7](#7-cryptography)) a hostile URL can't harvest a usable
  password, but the UI still warns on non-https and shows the active server
  host prominently.

---

## 5. Architecture overview

```
 ┌─────────────────────────── apps/extension (client) ───────────────────────┐
 │  side panel / export / settings (React)                                   │
 │        │ reads/writes (offline-first)                                     │
 │        ▼                                                                   │
 │  chrome.storage.local  ◄── single source of truth for the UI             │
 │        │                                                                   │
 │  background service worker                                                 │
 │    ├─ crypto module  (WebCrypto: derive keys, wrap DEK, AES-GCM blobs)    │
 │    ├─ auth module    (register/login, JWT, token refresh)                │
 │    ├─ net module     (talks to the configured server; optional perms)    │
 │    └─ sync module    (envelope, push debounced, pull via chrome.alarms)   │
 └───────────────────────────────────┬─────────────────────────────────────────┘
                                      │ HTTPS (JSON; ciphertext blobs)  ── @qurasearch/shared types
                                      ▼
 ┌─────────────────── apps/server (Node + Hono, self-hosted) ────────────────┐
 │  thin, content-blind: verifies auth, stores ciphertext records by id,     │
 │  serves incremental sync. No business logic over clip content.            │
 │  Postgres (or SQLite for small scale).                                    │
 └─────────────────────────────────────────────────────────────────────────────┘
```

Backend choice: **Node + Hono**, sharing types with the extension via
`@qurasearch/shared`. Under E2E the server has no content-side logic, so
Django's batteries would mostly idle; same-language type sharing is worth more.

---

## 6. Data-model changes

Needed for sync; **harmless to local-only mode** — can land first (phase 0).

`Item` and `Group` each gain:

| field        | type      | purpose                                              |
|--------------|-----------|------------------------------------------------------|
| `updatedAt`  | `number`  | bumped on every mutation; basis for LWW conflict resolution |
| `deleted`    | `boolean?`| **soft-delete tombstone** — delete sets this instead of removing, so deletions propagate and don't resurrect on the next pull |
| `deletedAt`  | `number?` | when tombstoned; lets old tombstones be GC'd |

- The client `id` stays a `crypto.randomUUID()` — the global sync key, no
  server-side id allocation (already true today).
- **Hard delete becomes soft delete**: `store.ts#deleteItem` / `deleteGroup` set
  `deleted=true`; all selectors filter tombstones; UI unchanged.
- Every `store.ts` mutation sets `updatedAt = Date.now()`.
- `pinnedGroupId` (and future synced settings) sync as a single **`settings`
  record**, so the engine handles one uniform record set: `item | group | settings`.

---

## 7. Cryptography

All primitives are **WebCrypto (`SubtleCrypto`)** — eval-free, no MV3 CSP change.

### Keys

- **DEK** (Data Encryption Key): random AES-256-GCM key, generated once per
  account. **Encrypts all content.** Never leaves the device in the clear.
- **KEK** (Key Encryption Key): derived from the password; **wraps the DEK**.
- The DEK is wrapped independently by **multiple slots** ([§9](#9-multi-slot-key-model-future-login-methods)); the server stores the wrapped copies, never the DEK.

### Password derivation (auth / encryption split)

```
masterKey = PBKDF2-SHA256(password, kdf_salt, iterations)     // never leaves device
KEK       = HKDF-SHA256(masterKey, info="qura:kek")           // wraps DEK, never leaves device
authHash  = HKDF-SHA256(masterKey, info="qura:auth")          // sent to server as the credential
```

- `kdf_salt` + `iterations` are stored **per-slot**, so the KDF can be upgraded
  (PBKDF2 → Argon2id) per slot later without breaking existing accounts.
- Server stores `server_hash = argon2id(authHash)`. A DB leak yields neither the
  password nor the encryption key.

### Ciphers

- **Content**: `AES-GCM-256` under the **DEK**, fresh random 96-bit IV per record.
- **DEK wrapping**: `AES-GCM` (or AES-KW) of the raw DEK under each slot's key.
- **KDF**: **PBKDF2-SHA256** for MVP (native, no CSP change), iterations ≥ 600k,
  recorded in slot params. Argon2id is the intended upgrade (needs WASM +
  `wasm-unsafe-eval` CSP) — deferred.

### What is encrypted vs in the clear

| in the clear (server needs it for sync) | encrypted in the blob (under DEK) |
|------------------------------------------|-----------------------------------|
| `id`, `type`, `updatedAt`, `deleted`     | `text`, `url`, `host`, `title`, `groupId`, `locator`, group `name`/`color`, settings |

> `url` / `host` are browsing history — **always inside the encrypted blob**.

---

## 8. Account & auth flows

First-party email + password; the backend issues its own session JWTs.

- **Register**: client derives `masterKey → KEK, authHash`; generates the
  **DEK**; wraps it under the **password slot** and a **recovery slot** (KEK from
  a generated recovery code); `POST /auth/register { email, kdf_salt, kdf_params,
  authHash, slots:[…] }`; server stores `argon2id(authHash)` + slots, sends a
  verification email; client shows the **recovery code once**.
- **Login (any device)**: `GET /auth/params?email=` → `kdf_salt`+params; derive
  `authHash`; `POST /auth/login`; server returns **JWT** + the password slot's
  `wrapped_dek`; client unwraps the DEK locally. No old device, no pairing.
- **Change password**: unwrap DEK with old KEK → derive new KEK → **re-wrap the
  DEK** (cheap; data not re-encrypted) → update password slot + `server_hash`.
- **Forgot password (E2E caveat — surface in UX)**: the server can reset the
  account for login, **but the new password can't decrypt old data**; the user
  must enter the **recovery code** to unwrap and re-wrap the DEK. **No recovery
  code ⇒ login restored but old data permanently undecryptable.**

---

## 9. Multi-slot key model (future login methods)

The DEK is the single invariant; **slots** are independent ways to obtain it.

```
key_slots (per account):
  - type=password   wrapped_dek, wrap_params{ kdf, salt, iterations }
  - type=recovery   wrapped_dek, wrap_params{ kdf, salt }
  - (future) type=passkey-prf  wrapped_dek (key from WebAuthn PRF extension)
  - (future) type=pairing      wrapped_dek for a Google/passwordless device (ECDH device-to-device)
```

Adding Google / passkey later = **adding a slot that wraps the same DEK**; the
DEK and all existing ciphertext are untouched. Decision: build the slot
abstraction now (cheap), implement only `password` + `recovery` for MVP.

---

## 10. Sync protocol

**Offline-first, last-write-wins, tombstone-aware.**

### Record envelope (wire + server DB)

```
{ id, type: 'item'|'group'|'settings', updatedAt, deleted, deletedAt?, rev, iv, blob }
                                                                       ▲    ▲    ▲
                                                    server-assigned ──┘    │    └─ AES-GCM ciphertext (under DEK)
                                                         monotonic seq     └─ 96-bit IV
```

(`deletedAt` accompanies tombstones — `@qurasearch/shared` enforces it — so the
GC window below has something to key off.)

- `rev` = **server-assigned monotonic sequence per account** — the **pull
  cursor** (robust against client clock skew). `updatedAt` (client clock) only
  decides LWW conflicts.

### Endpoints

- `GET /sync?since=<rev>&limit=` → `{ records:[…], cursor:<rev> }`.
- `POST /sync { records:[…] }` → server upserts each with LWW
  (`if incoming.updatedAt >= stored.updatedAt`), assigns fresh `rev`s, returns
  `{ cursor }` + rejected/conflicted ids.

### Triggers (MV3)

- **Push**: debounced ~2–3 s after a local mutation.
- **Pull**: on panel open + periodically via `chrome.alarms` (~1 min min). No
  persistent WebSocket (the MV3 SW is killed at will); SSE is an optional later
  accelerator.

### Initial sync, tombstone GC, ordering

- First enable: encrypt all local records, push, then pull — net **merge** into
  the account.
- A tombstone is deletable once it has a `rev` and is older than a safety window
  (~30 days), after which all devices have converged.
- Drag-reorder rewrites `order` from `Date.now()`; under concurrent multi-device
  reorders this is LWW (last reorder wins) — acceptable for MVP; fractional
  indexing is the upgrade.

---

## 11. Backend shape (apps/server — Node + Hono)

Tables (Postgres):

```
users          id, email, email_verified, server_hash, kdf_salt, kdf_params, created_at
key_slots      id, user_id, type, wrapped_dek, wrap_params(json), label, created_at
records        id(uuid), user_id, type, updated_at, deleted, deleted_at, rev, iv, blob
email_tokens   verification + password-reset tokens (single-use, TTL)
sessions       refresh-token records (rotation / revoke)
```

Endpoints:

```
GET  /health  /version            ← unauthenticated; used by Settings "Test connection"
POST /auth/register  /auth/login  GET /auth/params
POST /auth/refresh   /auth/logout  /auth/verify-email
POST /auth/reset/request  /auth/reset/confirm
GET  /sync           POST /sync
```

Owned security surface (the cost of first-party accounts vs Google): email
verification, password-reset tokens, **login rate-limiting / lockout**, refresh
rotation. See [engineering.md](engineering.md) for how these are tested.

---

## 12. MV3 / extension specifics

- **SW lifecycle**: ephemeral. Periodic pull via `chrome.alarms`; sync cursor +
  cached DEK live in `chrome.storage.local`, never in-memory across restarts.
- **DEK caching (stay-unlocked)**: cached in `chrome.storage.local` so a
  constantly-used clipper doesn't re-prompt every restart; opt-in auto-lock later.
- **CSP**: WebCrypto is eval-free; PBKDF2/AES-GCM/ECDH need **no** CSP change.
- **Host permission for the chosen server**: prefer `optional_host_permissions`
  requested at server-selection time over the broad `<all_urls>`.
- **README**: the current "no network calls" claim becomes "local-first,
  optional E2E sync to a server you choose".
- **Extension ID**: pin a `key` in the manifest so the id (and any future OAuth
  redirect) is stable across machines.

---

## 13. Threat model & what leaks

| adversary | sees |
|-----------|------|
| Network (TLS MITM) | nothing useful (TLS + content E2E) |
| Server / DB compromise | ciphertext + metadata only; `server_hash` slow-hashed. **No content, no password, no key.** |
| Metadata (inherent E2E leak) | record counts, blob sizes, `updatedAt`, `deleted` flags, email |
| Local device / profile compromise | the **cached DEK** (if unlocked) → content |
| Forgot password, no recovery code | data permanently undecryptable (by design) |

Content protected: clip text, **url/host (browsing history)**, title, locator,
group names/colors, settings.

---

## 14. Open decisions / chosen defaults

Decided:

- Monorepo: **npm workspaces, `apps/extension` + `apps/server` + `packages/shared`**.
- Backend: **self-hosted Node + Hono**; server URL **configurable** in Settings.
- Auth: **first-party email + password**; Google deferred.
- Encryption: **E2E**, server content-blind.
- Key model: **password-derived key** (auth/enc split), **multi-slot DEK**,
  **recovery code** backstop. Device-pairing demoted to a future slot.
- Future logins: **yes** — slot abstraction built now, only password+recovery implemented.

Defaulted (override if desired):

- KDF = **PBKDF2-SHA256 ≥600k**, upgradeable to Argon2id per-slot.
- Pull cursor = **server `rev`**; LWW by client `updatedAt`.
- **DEK cached locally** (stay unlocked).
- Content cipher = **AES-GCM-256**, per-record IV.
- Server host access = **`optional_host_permissions`** for the chosen origin.
- Settings UI = **free-standing options page** (export-page pattern).

---

## 15. Phased plan

| phase | scope | notes |
|-------|-------|-------|
| **0 — Data model** | add `updatedAt`; hard-delete → **tombstones**; selectors filter tombstones; `settings` record for `pinnedGroupId` | decoupled from sync; local-only keeps working; land + test first |
| **R — Repo migration** | `git mv` extension → `apps/extension`; scaffold `apps/server` + `packages/shared`; workspace root; repoint CI | mechanical; see [engineering.md](engineering.md) |
| **E — Engineering infra** | monorepo CI, test infra, branch protection, release/deploy pipelines | set up early, maintained throughout — [engineering.md](engineering.md) |
| **1 — Accounts** | Hono skeleton, `users`, JWT; register / verify-email / login(authHash) / refresh / reset | no encryption/sync yet |
| **2 — E2E keys** | client crypto module; DEK + password slot + recovery slot; slot abstraction; recovery-code UX | password+recovery slots only |
| **3 — Sync engine** | envelope; `GET/POST /sync`; debounced push + `chrome.alarms` pull; LWW + tombstone GC; initial encrypt-and-merge | offline-first throughout |
| **4 — Settings & modes** | Settings options page; mode toggle; **server selection + test connection**; logout (keep/wipe); device list; README privacy copy | the user-facing surface of all the above |

Offline-first is invariant across all phases: the UI never waits on the network.
