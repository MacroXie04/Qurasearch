import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  PROTOCOL_VERSION,
  RecordEnvelopeSchema,
  type RecordEnvelope,
  type RecordType,
} from './index'

const validEnvelope = {
  id: '6f1f29d4-8c3a-4f6e-9b2d-1a7c5e0d4b38',
  type: 'item',
  updatedAt: 1717900000000,
  deleted: false,
  iv: 'AAAAAAAAAAAAAAAA',
  blob: 'c2VhbGVkLWNpcGhlcnRleHQ=',
}

describe('PROTOCOL_VERSION', () => {
  it('is 1', () => {
    expect(PROTOCOL_VERSION).toBe(1)
  })
})

describe('RecordEnvelopeSchema', () => {
  it('parses a valid envelope', () => {
    expect(RecordEnvelopeSchema.safeParse(validEnvelope).success).toBe(true)
  })

  // Schema-level regression guard for "the server stays content-blind": any plaintext
  // content field smuggled to the top level must be rejected by the strict envelope.
  it('rejects an envelope carrying a top-level plaintext field', () => {
    expect(RecordEnvelopeSchema.safeParse({ ...validEnvelope, text: 'secret' }).success).toBe(false)
    expect(
      RecordEnvelopeSchema.safeParse({ ...validEnvelope, url: 'https://example.com' }).success,
    ).toBe(false)
  })

  it('rejects a non-uuid id', () => {
    expect(RecordEnvelopeSchema.safeParse({ ...validEnvelope, id: 'not-a-uuid' }).success).toBe(
      false,
    )
  })

  it('rejects a non-base64 iv', () => {
    expect(RecordEnvelopeSchema.safeParse({ ...validEnvelope, iv: '!!not base64!!' }).success).toBe(
      false,
    )
  })

  // The IV is length-pinned (12 bytes / 96 bits = 16 base64 chars) and the blob
  // can never be shorter than the bare AES-GCM tag — anything else would be
  // accepted by the server, stored, and forever undecryptable.
  it('rejects a wrong-length or empty iv', () => {
    expect(RecordEnvelopeSchema.safeParse({ ...validEnvelope, iv: '' }).success).toBe(false)
    expect(RecordEnvelopeSchema.safeParse({ ...validEnvelope, iv: 'AAAAAAAA' }).success).toBe(false)
    expect(
      RecordEnvelopeSchema.safeParse({ ...validEnvelope, iv: 'AAAAAAAAAAAAAAAAAAAAAAA=' }).success,
    ).toBe(false)
  })

  it('rejects an empty or sub-tag-length blob', () => {
    expect(RecordEnvelopeSchema.safeParse({ ...validEnvelope, blob: '' }).success).toBe(false)
    expect(RecordEnvelopeSchema.safeParse({ ...validEnvelope, blob: 'c2hvcnQ=' }).success).toBe(
      false,
    )
  })

  it('requires deletedAt on tombstones', () => {
    expect(RecordEnvelopeSchema.safeParse({ ...validEnvelope, deleted: true }).success).toBe(false)
    expect(
      RecordEnvelopeSchema.safeParse({ ...validEnvelope, deleted: true, deletedAt: 1717900000001 })
        .success,
    ).toBe(true)
  })

  it('rejects a missing updatedAt', () => {
    const { updatedAt: _updatedAt, ...withoutUpdatedAt } = validEnvelope
    expect(RecordEnvelopeSchema.safeParse(withoutUpdatedAt).success).toBe(false)
  })

  it('treats rev as optional but positive when present', () => {
    expect(RecordEnvelopeSchema.safeParse(validEnvelope).success).toBe(true)
    expect(RecordEnvelopeSchema.safeParse({ ...validEnvelope, rev: 1 }).success).toBe(true)
    expect(RecordEnvelopeSchema.safeParse({ ...validEnvelope, rev: 0 }).success).toBe(false)
  })
})

describe('inferred types', () => {
  it('match the wire protocol', () => {
    expectTypeOf<RecordEnvelope['type']>().toEqualTypeOf<RecordType>()
    expectTypeOf<RecordEnvelope['updatedAt']>().toEqualTypeOf<number>()
    expectTypeOf<RecordEnvelope['rev']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<RecordEnvelope['blob']>().toEqualTypeOf<string>()
  })
})
