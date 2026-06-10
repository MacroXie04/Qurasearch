// Qurasearch background service worker (MV3, plain TS — no React).
// Responsibilities: context menu, capture routing, opening the side panel,
// detecting panel close, the toolbar badge, and jump-to-highlight
// orchestration (open a clip's source tab, then inject the highlighter).
import { collectLocator } from './locate/capture'
import highlightScript from './locate/highlight.entry.ts?script&iife'
import { sanitizeLocator } from './locate/locator'
import { getLocalData, type LastCaptured, resolveTargetGroupId, uid } from './storage'
import { type Item, type Locator, type PendingJump, type QuraMessage } from './types'

const MENU_ID = 'qura-add'
const BADGE_COLOR = '#6750A4'
/** Locator capture must not hold up the save — give the page this long, max. */
const LOCATOR_TIMEOUT_MS = 1500
/** Pending jumps older than this are stale (navigation never completed). */
const JUMP_TTL_MS = 60_000

// ---------------------------------------------------------------------------
// Context menu + side-panel behavior
// ---------------------------------------------------------------------------
function setupContextMenu() {
  // removeAll first, so reloads/updates don't throw a duplicate-id error.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Add to Qurasearch',
      contexts: ['selection'],
    })
  })
}

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenu()
  // Clicking the toolbar icon opens the side panel (Chrome 116+).
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e) => console.error('[Qurasearch] setPanelBehavior failed', e))
  void updateBadge()
})

chrome.runtime.onStartup.addListener(() => {
  void updateBadge()
})

// ---------------------------------------------------------------------------
// Capture (right-click "Add to Qurasearch")
// ---------------------------------------------------------------------------
// IMPORTANT: this listener is intentionally NOT async. chrome.sidePanel.open()
// must run synchronously inside the user-gesture tick, before any `await`,
// or Chrome 127+ throws "may only be called in response to a user gesture".
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) return
  if (tab?.windowId != null) {
    chrome.sidePanel
      .open({ windowId: tab.windowId })
      .catch((e) => console.error('[Qurasearch] sidePanel.open failed', e))
  }
  // The (async) save runs after, outside the gesture path.
  void saveCapture(info, tab)
})

/**
 * Ask the page to describe where the selection lives (for jump-to-highlight).
 * Best-effort only: restricted pages (chrome://, Web Store, PDFs) or a slow
 * page degrade to a locator-less capture — never to a failed capture.
 */
async function captureLocator(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab,
): Promise<Locator | undefined> {
  const tabId = tab?.id
  if (tabId == null || tabId < 0) return undefined
  try {
    const results = await Promise.race([
      chrome.scripting.executeScript({
        target: { tabId, frameIds: [info.frameId ?? 0] },
        func: collectLocator,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('locator timeout')), LOCATOR_TIMEOUT_MS),
      ),
    ])
    return sanitizeLocator(results?.[0]?.result)
  } catch {
    return undefined
  }
}

async function saveCapture(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) {
  const text = (info.selectionText ?? '').trim()
  if (!text) return

  const url = info.pageUrl ?? tab?.url ?? ''
  let host = ''
  try {
    host = url ? new URL(url).hostname : ''
  } catch {
    host = ''
  }
  const title = (tab?.title && tab.title.trim()) || host || 'Untitled'

  const locator = await captureLocator(info, tab)

  const { groups, pinnedGroupId } = await getLocalData()
  const session = await chrome.storage.session.get('activeGroupId')
  const activeGroupId = (session.activeGroupId as string | null | undefined) ?? null
  const groupId = resolveTargetGroupId(activeGroupId, pinnedGroupId, groups)

  const now = Date.now()
  const item: Item = {
    id: uid(),
    text,
    url,
    host,
    title,
    groupId,
    order: now,
    createdAt: now,
    ...(locator ? { locator } : {}),
  }

  // Re-read items immediately before committing (read-modify-write) so a
  // concurrent panel edit can't be clobbered by a stale snapshot.
  const fresh = await chrome.storage.local.get('items')
  const current = (fresh.items as Item[] | undefined) ?? []
  await chrome.storage.local.set({ items: [...current, item] })
  const last: LastCaptured = { id: item.id, groupId, ts: now }
  await chrome.storage.session.set({ lastCaptured: last })
  // Badge refreshes via the storage.onChanged listener below.
}

// ---------------------------------------------------------------------------
// Jump-to-highlight ("Open source" on a clip)
// ---------------------------------------------------------------------------
// The panel sends qura:jump → we open the tab and remember what to highlight
// in session storage (keyed by tabId, so it survives service-worker restarts).
// When that tab finishes loading we inject the highlighter, which asks back
// for its payload via qura:get-jump.

type PendingJumps = Record<string, PendingJump>

async function getPendingJumps(): Promise<PendingJumps> {
  const r = await chrome.storage.session.get('pendingJumps')
  return (r.pendingJumps as PendingJumps | undefined) ?? {}
}

// pendingJumps is a single session-storage key touched by four concurrent async
// paths (startJump, the onUpdated sweep/inject, onRemoved, jump-result). MV3
// handlers interleave at every await, so serialize every read-modify-write
// through one in-worker promise chain to avoid clobbering sibling entries.
// (The queue resets if the worker restarts; storage stays consistent either way.)
let jumpChain: Promise<unknown> = Promise.resolve()

function mutateJumps<T>(fn: (jumps: PendingJumps) => { dirty: boolean; result: T }): Promise<T> {
  const run = jumpChain.then(async () => {
    const jumps = await getPendingJumps()
    const { dirty, result } = fn(jumps)
    if (dirty) await chrome.storage.session.set({ pendingJumps: jumps })
    return result
  })
  jumpChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function deletePendingJump(tabId: number): Promise<void> {
  return mutateJumps((jumps) => {
    const key = String(tabId)
    const had = key in jumps
    delete jumps[key]
    return { dirty: had, result: undefined }
  })
}

async function startJump(itemId: string): Promise<boolean> {
  const { items } = await getLocalData()
  const item = items.find((i) => i.id === itemId)
  if (!item?.url) return false
  try {
    const u = new URL(item.url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  } catch {
    return false
  }
  const tab = await chrome.tabs.create({ url: item.url, active: true })
  if (tab.id == null) return false
  const tabId = tab.id
  await mutateJumps((jumps) => {
    jumps[String(tabId)] = {
      itemId: item.id,
      text: item.text,
      ...(item.locator ? { locator: item.locator } : {}),
      createdAt: Date.now(),
    }
    return { dirty: true, result: undefined }
  })
  return true
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const msg = message as QuraMessage
  if (!msg || typeof msg !== 'object') return

  if (msg.type === 'qura:jump') {
    startJump(msg.itemId)
      .then((ok) => sendResponse({ ok }))
      .catch(() => sendResponse({ ok: false }))
    return true // keep sendResponse alive across the await
  }

  if (msg.type === 'qura:get-jump') {
    const tabId = sender.tab?.id
    if (tabId == null) {
      sendResponse(null)
      return
    }
    getPendingJumps()
      .then((jumps) => {
        const p = jumps[String(tabId)]
        // Not consumed here — with allFrames injection several frames may ask.
        sendResponse(
          p && Date.now() - p.createdAt <= JUMP_TTL_MS
            ? { text: p.text, ...(p.locator ? { locator: p.locator } : {}) }
            : null,
        )
      })
      .catch(() => sendResponse(null))
    return true
  }

  if (msg.type === 'qura:jump-result') {
    // Terminal either way: the highlighter ran and reported. Keeping a missed
    // entry around would re-inject the highlighter into the next, unrelated
    // page the user navigates this tab to within the TTL.
    const tabId = sender.tab?.id
    if (tabId != null) void deletePendingJump(tabId)
    return
  }
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return
  void mutateJumps((jumps) => {
    // Sweep stale entries (tab never finished loading, SW restarted, …).
    const now = Date.now()
    let dirty = false
    for (const [key, jump] of Object.entries(jumps)) {
      if (now - jump.createdAt > JUMP_TTL_MS) {
        delete jumps[key]
        dirty = true
      }
    }
    const entry = jumps[String(tabId)]
    // Inject exactly once per jump. A second `complete` (in-page navigation,
    // bfcache restore, redirect) must NOT re-run the highlighter on a page the
    // user wasn't sent to — mark injected and skip thereafter.
    const shouldInject = !!entry && !entry.injected
    if (shouldInject) {
      entry.injected = true
      dirty = true
    }
    return { dirty, result: shouldInject }
  }).then((shouldInject) => {
    if (!shouldInject) return
    return chrome.scripting
      .executeScript({ target: { tabId, allFrames: true }, files: [highlightScript] })
      .catch(() => {
        // Restricted page — the tab is open, highlighting just isn't possible.
        return deletePendingJump(tabId)
      })
  })
})

chrome.tabs.onRemoved.addListener((tabId) => {
  void deletePendingJump(tabId)
})

// ---------------------------------------------------------------------------
// Side-panel close detection
// ---------------------------------------------------------------------------
// The panel opens a runtime port named "sidepanel" on mount. When that port
// disconnects, the panel has closed — reset the "current group" so the next
// capture follows the default/Ungrouped rule rather than the last-open group.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'sidepanel') return
  port.onDisconnect.addListener(() => {
    chrome.storage.session.set({ activeGroupId: null }).catch(() => {})
  })
})

// ---------------------------------------------------------------------------
// Toolbar badge (total clip count)
// ---------------------------------------------------------------------------
async function updateBadge() {
  const { items } = await getLocalData()
  const count = items.length
  await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' })
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR })
  // setBadgeTextColor is newer than the rest — only call it if it exists.
  if (typeof chrome.action.setBadgeTextColor === 'function') {
    chrome.action.setBadgeTextColor({ color: '#FFFFFF' }).catch(() => {})
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.items) {
    void updateBadge()
  }
})
