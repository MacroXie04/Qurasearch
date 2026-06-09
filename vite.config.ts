import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

// @crxjs wires up the manifest, the service worker, the side-panel HTML page,
// and MV3-compatible HMR. The crx() plugin MUST come AFTER the framework plugin.
export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    // Static ES modules, esbuild minify (no eval) — required by the MV3 CSP.
    target: 'es2022',
    sourcemap: false,
  },
  // Dev server settings (only used with `vite`/crxjs HMR — never the raw dev server for the panel).
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 },
  },
})
