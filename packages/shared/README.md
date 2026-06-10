# @qurasearch/shared

Shared wire-protocol schemas (zod) and `PROTOCOL_VERSION` for the Qurasearch sync protocol.
Imported by both `apps/extension` and `apps/server`, so an envelope-field mismatch is a
**compile error**, not silent data corruption.

The record envelope is strict: plaintext content never appears at the top level — it lives
AES-GCM-encrypted inside `blob`. Design: [docs/sync-and-accounts.md](../../docs/sync-and-accounts.md)
(§7, §10–11).

## Develop

```sh
npm run build -w packages/shared       # emit dist/ (also runs on npm ci via prepare)
npm run typecheck -w packages/shared   # includes type-level test assertions
npm test -w packages/shared            # vitest
```
