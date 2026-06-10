import type { MiddlewareHandler } from 'hono'

// TODO(phase 1 — docs/sync-and-accounts.md §11): login rate-limiting / lockout is an
// owned security surface of first-party accounts. Pass-through until then.
export const rateLimit: MiddlewareHandler = async (_c, next) => {
  await next()
}
