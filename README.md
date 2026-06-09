# Qurasearch

A Chrome extension (Manifest V3) for clipping text from any web page into the
**Chrome side panel**. Select text, right‑click **“Add to Qurasearch”**, and the
clip — text, source URL, page title, site, favicon, and time — is saved into the
side panel where you can organize clips into colored groups.

Built with **React 19 + Vite + @crxjs/vite-plugin**, **@material/web** (Material
Design 3 components) and **@dnd-kit** for drag‑reordering. Everything is stored
locally; there are **no network calls** (favicons come from Chrome’s own cache).

---

## Install (no build required)

The thing you install is the prebuilt `dist/` folder. You do **not** need Node or
to run any build.

**Option A — load the folder**
1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top‑right).
3. Click **Load unpacked** and select the **`dist/`** folder.

**Option B — load the zip**
1. Unzip **`qurasearch.zip`** (its `manifest.json` is at the root of the archive).
2. Open `chrome://extensions` → **Developer mode** → **Load unpacked** → select the
   unzipped folder.

Requires **Chrome 116+** (needed for the side panel API). Pin the toolbar icon to
open the panel any time.

---

## Using it

- **Clip:** select text on any page → right‑click → **Add to Qurasearch**. The side
  panel opens and a snackbar confirms where it was saved (with **Undo**).
- **Groups:** tap **New group** (color + name). Open a group’s **⋮** menu to rename,
  recolor, **set it as the default group**, or delete it (deleting moves its clips
  back to *Ungrouped*).
- **Where new clips land** (priority):
  1. the **group you’re currently viewing**,
  2. otherwise the **default group** (if you’ve set one),
  3. otherwise **Ungrouped**.
  Closing the panel or returning Home “leaves” the current group. The Inbox
  (*Ungrouped*) view always routes new clips to Ungrouped.
- **Cards:** copy text, open the source, **Move to group…**, delete (undoable), and
  expand/collapse long clips. Drag the handle to reorder within a group.
- **Search:** the search icon matches by text / title / site across all clips.
- **Backup:** the Home **⋮** menu exports a JSON backup and imports one
  (**Merge** or **Replace**).

### Permissions

Only `contextMenus`, `storage`, `sidePanel`, `favicon`, and `activeTab` — no
`tabs` permission and **no host permissions**. `activeTab` gives the page title at
the moment you invoke the menu; opening a source link uses `chrome.tabs.create`,
which needs no extra permission.

---

## Developing (only needed to modify the source)

```bash
npm install
npm run gen-icons     # regenerate the toolbar PNGs from the inline SVG (optional)
npm run build         # → dist/  (load this unpacked)
npm run typecheck     # tsc --noEmit
npm test              # vitest run (unit tests)
npm run test:watch    # vitest in watch mode
```

### Tests & CI

Unit tests use **Vitest** (`src/**/*.test.{ts,tsx}`) and cover the capture-target
rule, the store mutations (group delete → clips to Ungrouped, default cleared;
move/reorder ordering; backup merge de-dupe / replace; one-shot capture marker),
the relative-time/util helpers, and a jsdom component test for the color picker.
`src/test/chromeMock.ts` provides an in-memory `chrome.storage` mock.

**GitHub Actions** (`.github/workflows/ci.yml`) runs on every push/PR to `main`
across Node 20 and 22: `npm ci` → typecheck → tests → build → a guard that fails
if any `eval`/`new Function` slips into the bundle (MV3 CSP), and uploads `dist/`
as a build artifact.

For an iterative loop use `npm run watch` (`vite build --watch`) and click the
reload button on the extension card. **Do not** use the raw Vite dev server for the
panel — its HMR uses `eval`, which the MV3 CSP (`script-src 'self'`) blocks. The
production build emits static ES modules with no `eval`.

To repackage the loadable zip after a build:

```bash
cd dist && zip -r -X ../qurasearch.zip . && cd ..
```

---

## How it’s built

```
manifest.config.ts   Manifest V3 (authored for @crxjs)
vite.config.ts       Vite + @crxjs/vite-plugin + @vitejs/plugin-react
index.html           side-panel entry (mounts React)
src/
  background.ts      service worker: context menu, capture routing, open panel,
                     panel-close detection, toolbar badge
  storage.ts         chrome.storage helpers + the capture-target rule
  store.ts           reactive store (useSyncExternalStore + storage.onChanged)
  App.tsx            view switch: Home / Group / Inbox / Search + dialogs/snackbar
  md.tsx             @lit/react wrappers for the @material/web elements
  icons.tsx          inline SVG icons (offline)
  theme.css          MD3 --md-sys-color-* tokens (light/dark) + bundled Roboto
  app.css            hand-built component styles (app bar, card, banner, snackbar…)
  components/        AppBar, GroupList, GroupView, ClipCard, CaptureBanner,
                     Snackbar, GroupDialog, ConfirmDialog, ColorPicker,
                     SearchView, FaviconImg, EmptyState, OverflowMenu
  fonts/             Roboto variable woff2 (latin + latin-ext), bundled locally
```

### Data model (`chrome.storage`)

```
local (persistent):   groups[], items[], pinnedGroupId
session (ephemeral):  activeGroupId, lastCaptured
```

`@material/web` components (Lit‑based) are eval‑free and run under the MV3 CSP.
Interactive elements (buttons, list items, menu, dialog, text field, FAB) come from
`@material/web`; the top app bar, clip card, capture banner, snackbar, and search
bar are hand‑built with the MD3 tokens. Material Web reads the same
`--md-sys-color-*` tokens defined in `theme.css`.
