// Qurasearch background service worker (MV3, plain TS — no React).
// Responsibilities: context menu, capture routing, opening the side panel,
// detecting panel close, and the toolbar badge.
import { type Item } from './types'
import { getLocalData, resolveTargetGroupId, uid, type LastCaptured } from './storage'

const MENU_ID = 'qura-add'
const BADGE_COLOR = '#6750A4'

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

  const { groups, pinnedGroupId } = await getLocalData()
  const session = await chrome.storage.session.get('activeGroupId')
  const activeGroupId = (session.activeGroupId as string | null | undefined) ?? null
  const groupId = resolveTargetGroupId(activeGroupId, pinnedGroupId, groups)

  const now = Date.now()
  const item: Item = { id: uid(), text, url, host, title, groupId, order: now, createdAt: now }

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
