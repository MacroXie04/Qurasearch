import { Hono } from 'hono'

// Sync endpoints per docs/sync-and-accounts.md §10–11.
// TODO(phase 3 — docs/sync-and-accounts.md §15): LWW upsert by client updatedAt,
// server-assigned monotonic rev as the pull cursor.
export const syncRoutes = new Hono()

syncRoutes.get('/', (c) => c.json({ error: 'not_implemented' }, 501))
syncRoutes.post('/', (c) => c.json({ error: 'not_implemented' }, 501))
