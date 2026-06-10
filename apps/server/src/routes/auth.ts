import type { Context } from 'hono'
import { Hono } from 'hono'

// Auth endpoints per docs/sync-and-accounts.md §11. All stubs until their phase lands.
export const authRoutes = new Hono()

const notImplemented = (c: Context) => c.json({ error: 'not_implemented' }, 501)

// TODO(phase 1 — docs/sync-and-accounts.md §15): register / login / params
// (authHash credential, server stores argon2id(authHash); key slots per §9).
authRoutes.post('/register', notImplemented)
authRoutes.post('/login', notImplemented)
authRoutes.get('/params', notImplemented)

// TODO(phase 1): session JWTs — refresh rotation + revoke (sessions table, §11).
authRoutes.post('/refresh', notImplemented)
authRoutes.post('/logout', notImplemented)

// TODO(phase 1): email verification + password reset (email_tokens, single-use, TTL;
// reset cannot decrypt old data without the recovery code — §8).
authRoutes.post('/verify-email', notImplemented)
authRoutes.post('/reset/request', notImplemented)
authRoutes.post('/reset/confirm', notImplemented)
