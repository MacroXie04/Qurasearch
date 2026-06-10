import { serve } from '@hono/node-server'

import { app } from './app.js'
import { config } from './lib/config.js'

serve({ fetch: app.fetch, port: config.PORT })

console.log(`@qurasearch/server listening on http://localhost:${config.PORT}`)
