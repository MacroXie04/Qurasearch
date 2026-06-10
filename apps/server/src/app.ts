import { PROTOCOL_VERSION } from '@qurasearch/shared'
import { Hono } from 'hono'

import { SERVER_VERSION } from './lib/config.js'
import { requireAuth } from './middleware/auth.js'
import { rateLimit } from './middleware/rateLimit.js'
import { authRoutes } from './routes/auth.js'
import { syncRoutes } from './routes/sync.js'

export const app = new Hono()

// Unauthenticated; used by the extension's Settings "Test connection"
// (docs/sync-and-accounts.md §11).
app.get('/health', (c) => c.json({ status: 'ok' }))
app.get('/version', (c) => c.json({ version: SERVER_VERSION, protocolVersion: PROTOCOL_VERSION }))

// Mounted now (pass-through) so the phase-1 limiter only needs a body, not wiring.
app.use('/auth/*', rateLimit)
app.route('/auth', authRoutes)
app.use('/sync/*', requireAuth)
app.route('/sync', syncRoutes)
