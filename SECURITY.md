# Security Policy

Qurasearch is an end-to-end-encrypted product. The sync server is designed to be
**content-blind**: it must never see plaintext clip content (text, URLs, titles,
group names, settings), the user's **password**, or the data encryption key
(**DEK**) — only ciphertext blobs, sync metadata, and a slow-hashed auth
credential. Anything that breaks that promise — in the design or in the code —
is a security bug, and we want to hear about it privately.

## Reporting a vulnerability

- **Preferred:** GitHub private vulnerability reporting —
  [open a draft advisory](https://github.com/MacroXie04/Qurasearch/security/advisories/new).
- **Email:** [xiehongzhe04@gmail.com](mailto:xiehongzhe04@gmail.com)

**Please never open public issues for vulnerabilities.** A public issue exposes
users before a fix exists; the private channels above reach the maintainer just
as fast.

You will receive an acknowledgement within **72 hours**, followed by a triage
verdict and a remediation plan. We will credit you in the fix's release notes
unless you ask otherwise.

## Scope

| surface | examples |
|---------|----------|
| **Extension** (`apps/extension`) | capture/injection scripts, storage handling, the client crypto module, MV3 CSP escapes |
| **Server** (`apps/server`) | auth flows, sync endpoints, rate limiting, token handling |
| **Shared protocol** (`packages/shared`) | envelope/DTO schemas, protocol-version negotiation |
| **CI / supply chain** | `.github/workflows`, dependency and release pipelines |

## Scrutiny of the crypto design is welcome

The cryptography is public and we explicitly invite review of it:
[docs/sync-and-accounts.md §7 — Cryptography](docs/sync-and-accounts.md#7-cryptography)
describes the key model (password-derived KEK, multi-slot wrapped DEK, AES-GCM
content encryption), and
[§13 — Threat model & what leaks](docs/sync-and-accounts.md#13-threat-model--what-leaks)
states what each adversary is expected to see. If you can show the server
learning **plaintext content, a password, or the DEK** — on paper or in code —
that is exactly the report we want most.

## Supported versions

While Qurasearch is pre-1.0, only the **latest release** receives security
fixes. Please reproduce against the latest release (or `main`) before reporting.
