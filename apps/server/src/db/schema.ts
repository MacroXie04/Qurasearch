// Placeholder row types mirroring the Postgres tables of docs/sync-and-accounts.md §11.
// Becomes the real schema + SQL migrations in phase 1 (docs/sync-and-accounts.md §15);
// no DB dependency yet.

export interface UserRow {
  id: string
  email: string
  emailVerified: boolean
  /** server_hash = argon2id(authHash) — the server never sees the password (§7–8). */
  serverHash: string
  /** Per-account KDF salt returned by GET /auth/params. */
  kdfSalt: string
  /** KDF parameters (e.g. { kdf: 'PBKDF2-SHA256', iterations }), upgradeable per slot. */
  kdfParams: Record<string, unknown>
  createdAt: Date
}

export interface KeySlotRow {
  id: string
  userId: string
  /** 'password' | 'recovery' now; 'passkey-prf' | 'pairing' later (§9). */
  type: string
  /** The DEK wrapped under this slot's key — the server never sees the DEK. */
  wrappedDek: string
  /** Per-slot wrap params (json): { kdf, salt, iterations } etc. */
  wrapParams: Record<string, unknown>
  label: string | null
  createdAt: Date
}

export interface RecordRow {
  /** Client-generated uuid — the global sync key (§6). */
  id: string
  userId: string
  type: 'item' | 'group' | 'settings'
  /** Client clock; decides LWW conflicts only. */
  updatedAt: number
  /** Soft-delete tombstone; propagates deletions (§6). */
  deleted: boolean
  deletedAt: number | null
  /** Server-assigned monotonic sequence per account — the pull cursor (§10). */
  rev: number
  /** 96-bit AES-GCM IV, fresh per record. */
  iv: string
  /** AES-GCM-256 ciphertext under the DEK — the server is content-blind. */
  blob: string
}

export interface EmailTokenRow {
  id: string
  userId: string
  /** 'verify-email' | 'password-reset' — single-use, TTL-bound (§11). */
  type: string
  tokenHash: string
  expiresAt: Date
  usedAt: Date | null
  createdAt: Date
}

export interface SessionRow {
  id: string
  userId: string
  /** Refresh-token record: rotation + revoke (§11). */
  refreshTokenHash: string
  expiresAt: Date
  revokedAt: Date | null
  createdAt: Date
}
