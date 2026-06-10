import type { MiddlewareHandler } from 'hono'

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const authorization = c.req.header('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  // TODO(phase 1 — docs/sync-and-accounts.md §15): verify the JWT and set userId
  // on the context for downstream handlers.
  await next()
}
