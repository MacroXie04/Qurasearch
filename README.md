# Qurasearch

A Chrome extension (Manifest V3) for clipping text from any web page into the
**Chrome side panel**. Select text, right‑click **“Add to Qurasearch”**, and the
clip — text, source URL, page title, site, favicon, and time — is saved into the
side panel where you can organize clips into colored groups. Clicking a clip’s
source link **jumps back to the page, scrolls to the clipped text and
highlights it** — even when the page has changed since. A standalone **export
page** turns any selection of clips into plain text, Markdown, HTML, or CSV.

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
  back to _Ungrouped_).
- **Where new clips land** (priority):
  1. the **group you’re currently viewing**,
  2. otherwise the **default group** (if you’ve set one),
  3. otherwise **Ungrouped**.
     Closing the panel or returning Home “leaves” the current group. The Inbox
     (_Ungrouped_) view always routes new clips to Ungrouped.
- **Cards:** copy text, open the source, **Move to group…**, delete (undoable), and
  expand/collapse long clips. Drag the handle to reorder within a group.
- **Jump back & highlight:** **Open source** reopens the page, auto‑scrolls to the
  clipped text and highlights it (CSS Custom Highlight API — no DOM mutation;
  click anywhere to dismiss). If the text changed since you clipped it, the saved
  DOM context takes over: the spot is re‑located from the surrounding text, or
  from the stored CSS path to the original element (which gets an outline pulse
  if the text is gone entirely). Clips saved before this feature still highlight
  via plain text matching. A toast tells you when the text can’t be found at all.
- **Search:** the search icon matches by text / title / site across all clips.
- **Export page:** the Home **⋮** menu → **Export…** opens a full‑tab page where you
  pick clips (whole groups or individual clips), choose **Plain text / Markdown /
  HTML / CSV** plus how links appear (text only, URL after each clip, or the text
  as the link), preview live, and **Copy** or **Download** the result.
- **Backup:** the Home **⋮** menu exports a JSON backup and imports one
  (**Merge** or **Replace**).

### Permissions

`contextMenus`, `storage`, `sidePanel`, `favicon`, `activeTab`, `scripting`,
and host access to all sites (`<all_urls>`).

The host access + `scripting` pair exists solely for jump‑to‑highlight:

- at **capture** time a small script reads where the selection lives (text,
  surrounding context, CSS path) so the clip can be found again later;
- at **jump** time the highlighter script is injected into the reopened page to
  scroll to and highlight the clip.

Nothing is read from pages you don’t clip from or jump to, and the extension
still makes **no network calls**. Restricted pages (chrome://, the Web Store,
PDFs) simply degrade: capture still saves the text, and jumping opens the page
without a highlight. Known limitation: text inside closed shadow DOM (some web
components) can’t be searched.

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
The jump feature has its own suites: `src/locate/capture.test.ts` rehydrates the
injected `collectLocator` from source (so an accidental closure over module scope
fails the test — `executeScript({func})` would silently lose it), and
`src/locate/match.test.ts` exercises all matching tiers under jsdom. The export
formatters are tested in `src/export/formats.test.ts`, including HTML escaping
and CSV formula-injection guards. `src/test/chromeMock.ts` provides in-memory
`chrome.storage`/`scripting`/`tabs`/messaging mocks.

**GitHub Actions** (`.github/workflows/ci.yml`) runs on every push/PR to `main`
across Node 20 and 22: `npm ci` → typecheck → tests → build → a guard that fails
if any `eval`/`new Function` slips into the bundle (MV3 CSP), and uploads `dist/`
as a build artifact.

For an iterative loop use `npm run watch` (`vite build --watch`) and click the
reload button on the extension card. **Do not** use the raw Vite dev server for the
panel — its HMR uses `eval`, which the MV3 CSP (`script-src 'self'`) blocks. The
production build emits static ES modules with no `eval`. Note the export page is
a free-standing entry (not referenced by the manifest), so crxjs HMR does not
cover it either — `npm run watch` is the way to iterate on it too.

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
export.html          export-page entry (full browser tab)
src/
  background.ts      service worker: context menu, capture routing (+ locator
                     injection), open panel, panel-close detection, toolbar
                     badge, jump orchestration (open tab → inject highlighter)
  storage.ts         chrome.storage helpers + the capture-target rule
  store.ts           reactive store (useSyncExternalStore + storage.onChanged)
  App.tsx            view switch: Home / Group / Inbox / Search + dialogs/snackbar
  md.tsx             @lit/react wrappers for the @material/web elements
  icons.tsx          inline SVG icons (offline)
  theme.css          MD3 --md-sys-color-* tokens (light/dark) + bundled Roboto
  app.css            hand-built component styles (app bar, card, banner, snackbar…)
  locate/            jump-to-highlight:
    locator.ts         Locator type + sanitizeLocator (import/IPC validation)
    capture.ts         collectLocator — self-contained func injected at capture
    match.ts           pure tiered matcher (exact → context bracket → selector)
    highlight.entry.ts injected highlighter (bundled standalone via ?script&iife)
  export/            export page: main.tsx, ExportApp.tsx, formats.ts (pure
                     TXT/MD/HTML/CSV formatters), export.css
  components/        AppBar, GroupList, GroupView, ClipCard, CaptureBanner,
                     Snackbar, GroupDialog, ConfirmDialog, ColorPicker,
                     SearchView, FaviconImg, EmptyState, OverflowMenu
  fonts/             Roboto variable woff2 (latin + latin-ext), bundled locally
```

### Data model (`chrome.storage`)

```
local (persistent):   groups[], items[], pinnedGroupId
                      (items may carry an optional `locator` — the DOM context
                       captured for jump-to-highlight)
session (ephemeral):  activeGroupId, lastCaptured, pendingJumps
```

### How jump-to-highlight works

1. **Capture**: alongside the normal save, `collectLocator` is injected into the
   clicked frame (1.5 s budget) and records the exact selected text, ~64 chars of
   context on each side, and a CSS path to the containing element (`#id`-anchored
   when possible). Failure of any kind just means the clip saves without a locator.
2. **Jump**: the panel messages the background (`qura:jump`); it opens the tab and
   stores a `pendingJumps[tabId]` entry in session storage (TTL 60 s — survives
   service-worker restarts). When the tab reaches `complete`, the highlighter is
   injected into all frames; each instance asks `qura:get-jump` for its payload.
3. **Match** (`src/locate/match.ts`), in tiers: ① exact whitespace-normalized text
   (duplicates disambiguated by stored context + selector containment); ② if the
   text changed, bracket the original slot between the stored prefix/suffix and
   highlight what is there now; ③ descend the stored CSS selector and fuzzy-match
   the largest surviving token window (≥40 %), or pulse the element itself.
   Misses retry on DOM mutations for up to 8 s (SPAs, lazy content), then toast.

`@material/web` components (Lit‑based) are eval‑free and run under the MV3 CSP.
Interactive elements (buttons, list items, menu, dialog, text field, FAB) come from
`@material/web`; the top app bar, clip card, capture banner, snackbar, and search
bar are hand‑built with the MD3 tokens. Material Web reads the same
`--md-sys-color-*` tokens defined in `theme.css`.
