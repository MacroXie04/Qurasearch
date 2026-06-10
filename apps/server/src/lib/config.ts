import { z } from 'zod'

const EnvSchema = z.object({
  PORT: z.coerce.number().int().default(8787),
  DATABASE_URL: z.url().optional(),
  // TODO(phase 1 — docs/sync-and-accounts.md §15): required once JWTs are issued.
  JWT_SECRET: z.string().min(32).optional(),
})

export const config = EnvSchema.parse(process.env)

// Keep in sync with package.json; served by GET /version.
export const SERVER_VERSION = '0.1.0'
