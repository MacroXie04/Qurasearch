import { defineManifest } from '@crxjs/vite-plugin'

import pkg from './package.json'

// Manifest V3 authored for @crxjs. Icons are referenced by their source path;
// @crxjs emits them and rewrites the built manifest.
export default defineManifest({
  manifest_version: 3,
  name: 'Qurasearch',
  version: pkg.version,
  description:
    'Select text on any page, right-click to save it with its source into the side panel, and organize clips into groups.',
  icons: {
    16: 'src/assets/icon-16.png',
    32: 'src/assets/icon-32.png',
    48: 'src/assets/icon-48.png',
    128: 'src/assets/icon-128.png',
  },
  action: {
    default_title: 'Open Qurasearch',
    // NOTE: deliberately NO default_popup — clicking the toolbar icon opens the
    // side panel (via setPanelBehavior({ openPanelOnActionClick: true })).
    default_icon: {
      16: 'src/assets/icon-16.png',
      32: 'src/assets/icon-32.png',
      48: 'src/assets/icon-48.png',
      128: 'src/assets/icon-128.png',
    },
  },
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
  side_panel: {
    default_path: 'index.html',
  },
  permissions: ['contextMenus', 'storage', 'sidePanel', 'favicon', 'activeTab', 'scripting'],
  // Jump-to-highlight injects a locator script at capture time and the
  // highlighter into the reopened source page — both need host access.
  host_permissions: ['<all_urls>'],
})
