// TODO(phase 1 — docs/sync-and-accounts.md §15): implement with hono/jwt; access
// tokens + refresh rotation (sessions table, §11).

export function signAccessToken(_userId: string): never {
  throw new Error('not_implemented: signAccessToken lands in phase 1')
}

export function verifyAccessToken(_token: string): never {
  throw new Error('not_implemented: verifyAccessToken lands in phase 1')
}
