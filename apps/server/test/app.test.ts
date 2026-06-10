import { createRequire } from 'node:module'

import { HealthResponseSchema, PROTOCOL_VERSION, VersionResponseSchema } from '@qurasearch/shared'
import { describe, expect, it } from 'vitest'

import { app } from '../src/app.js'

const pkg = createRequire(import.meta.url)('../package.json') as { version: string }

describe('GET /health', () => {
  it('returns 200 with a valid health body', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    expect(HealthResponseSchema.parse(await res.json())).toEqual({ status: 'ok' })
  })
})

describe('GET /version', () => {
  it('returns 200 with the advertised protocol version', async () => {
    const res = await app.request('/version')
    expect(res.status).toBe(200)
    const body = VersionResponseSchema.parse(await res.json())
    expect(body.protocolVersion).toBe(PROTOCOL_VERSION)
  })

  // SERVER_VERSION is a hardcoded constant; pin it to package.json so a
  // Changesets bump (engineering.md §7) can't silently leave /version stale.
  it('reports the package.json version', async () => {
    const res = await app.request('/version')
    const body = VersionResponseSchema.parse(await res.json())
    expect(body.version).toBe(pkg.version)
  })
})

describe('auth gating', () => {
  it('rejects GET /sync without an Authorization header', async () => {
    const res = await app.request('/sync')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })
})

describe('stub endpoints', () => {
  it('POST /auth/register is not implemented yet', async () => {
    const res = await app.request('/auth/register', { method: 'POST' })
    expect(res.status).toBe(501)
    expect(await res.json()).toEqual({ error: 'not_implemented' })
  })
})
