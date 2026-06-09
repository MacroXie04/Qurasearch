import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'

// background.ts imports the highlighter with the crxjs `?script&iife` suffix,
// which only the crx plugin understands. In tests, resolve any such import to
// a stub file-name string (background.test.ts never executes the script).
const crxScriptStub: Plugin = {
  name: 'crx-script-stub',
  enforce: 'pre',
  resolveId(id) {
    if (id.includes('?script')) return '\0crx-script-stub'
  },
  load(id) {
    if (id === '\0crx-script-stub') return 'export default "stub-script.js"'
  },
}

// Dedicated test config (kept separate from vite.config.ts so the @crxjs plugin
// does not run during tests). Logic tests run in 'node'; component tests opt into
// jsdom via a `// @vitest-environment jsdom` docblock.
export default defineConfig({
  plugins: [crxScriptStub, react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
})
