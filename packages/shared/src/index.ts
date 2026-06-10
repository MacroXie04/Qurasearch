/**
 * @qurasearch/shared — wire-protocol schemas shared by apps/extension and apps/server.
 *
 * E2E invariant: the record envelope is STRICT. Plaintext content fields (text, url,
 * host, title, groupId, group name/color, settings values) must NEVER appear at the
 * top level of an envelope — they live AES-GCM-encrypted inside `blob` under the DEK.
 * See docs/sync-and-accounts.md §7 "What is encrypted vs in the clear".
 */
import { z } from 'zod'

/**
 * Protocol version advertised by the server's GET /version and by the extension;
 * a mismatch surfaces in Settings rather than failing opaquely (docs/engineering.md §7).
 */
export const PROTOCOL_VERSION = 1

export const RecordTypeSchema = z.enum(['item', 'group', 'settings'])
export type RecordType = z.infer<typeof RecordTypeSchema>

export const RecordEnvelopeSchema = z
  .strictObject({
    id: z.uuid(),
    type: RecordTypeSchema,
    updatedAt: z.number().int().nonnegative(),
    deleted: z.boolean(),
    deletedAt: z.number().int().nonnegative().optional(),
    // Server-assigned monotonic sequence per account — the pull cursor.
    // Absent until the record's first server ack.
    rev: z.number().int().positive().optional(),
    // 96-bit AES-GCM IV, fresh per record: exactly 12 bytes = 16 base64 chars.
    // Length-pinned so a buggy client can't store undecryptable records.
    iv: z.base64().length(16),
    // AES-GCM ciphertext under the DEK; the 16-byte auth tag alone is 24
    // base64 chars, so anything shorter is cryptographic garbage.
    blob: z.base64().min(24),
  })
  // Tombstone GC (~30-day window, §10) keys off deletedAt; a tombstone
  // without it could never be collected.
  .refine((r) => !r.deleted || r.deletedAt !== undefined, {
    message: 'tombstones require deletedAt',
  })
export type RecordEnvelope = z.infer<typeof RecordEnvelopeSchema>

export const SyncPushRequestSchema = z.strictObject({
  records: z.array(RecordEnvelopeSchema).nonempty(),
})
export type SyncPushRequest = z.infer<typeof SyncPushRequestSchema>

export const SyncPushResponseSchema = z.strictObject({
  cursor: z.number().int().nonnegative(),
  rejected: z.array(z.uuid()),
})
export type SyncPushResponse = z.infer<typeof SyncPushResponseSchema>

export const SyncPullResponseSchema = z.strictObject({
  records: z.array(RecordEnvelopeSchema),
  cursor: z.number().int().nonnegative(),
})
export type SyncPullResponse = z.infer<typeof SyncPullResponseSchema>

export const HealthResponseSchema = z.strictObject({
  status: z.literal('ok'),
})
export type HealthResponse = z.infer<typeof HealthResponseSchema>

export const VersionResponseSchema = z.strictObject({
  version: z.string(),
  protocolVersion: z.number().int().positive(),
})
export type VersionResponse = z.infer<typeof VersionResponseSchema>
