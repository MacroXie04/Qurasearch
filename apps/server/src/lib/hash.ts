/**
 * Credential hashing. The server stores server_hash = argon2id(authHash); it NEVER
 * sees the password or the DEK (docs/sync-and-accounts.md §7–8).
 *
 * TODO(phase 1 — docs/sync-and-accounts.md §15): implement with argon2id.
 */

export function hashAuthHash(_authHash: string): never {
  throw new Error('not_implemented: hashAuthHash lands in phase 1')
}

export function verifyAuthHash(_authHash: string, _serverHash: string): never {
  throw new Error('not_implemented: verifyAuthHash lands in phase 1')
}
