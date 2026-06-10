import { crx } from '@crxjs/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

import manifest from './manifest.config'

// crxjs's `?script&iife` import auto-adds the highlighter to
// web_accessible_resources with use_dynamic_url:false, giving it a stable
// chrome-extension:// URL any page can probe to fingerprint the extension. The
// file is only ever injected via chrome.scripting (which doesn't need WAR at
// all), so randomize its URL per session to remove the fingerprinting surface.
// `order: 'post'` runs this after crxjs re-emits the manifest asset during its
// own generateBundle, so the edit isn't overwritten — and needs no fs/node types.
function hardenWebAccessibleResources(): Plugin {
  return {
    name: 'qura-harden-war',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const entry = bundle['manifest.json']
        if (!entry || entry.type !== 'asset' || typeof entry.source !== 'string') return
        const m = JSON.parse(entry.source)
        if (!Array.isArray(m.web_accessible_resources)) return
        for (const war of m.web_accessible_resources) war.use_dynamic_url = true
        entry.source = JSON.stringify(m, null, 2)
      },
    },
  }
}

// @crxjs wires up the manifest, the service worker, the side-panel HTML page,
// and MV3-compatible HMR. The crx() plugin MUST come AFTER the framework plugin.
export default defineConfig({
  plugins: [react(), crx({ manifest }), hardenWebAccessibleResources()],
  build: {
    // Static ES modules, esbuild minify (no eval) — required by the MV3 CSP.
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      // @crxjs auto-registers manifest-referenced pages; the export page is a
      // free-standing extension page so it must be listed explicitly.
      input: { sidepanel: 'index.html', export: 'export.html' },
    },
  },
  // Dev server settings (only used with `vite`/crxjs HMR — never the raw dev server for the panel).
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 },
  },
})
