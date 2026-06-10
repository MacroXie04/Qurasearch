import { describe, expect, it, vi } from 'vitest'

import { installChrome, type MockChrome } from './test/chromeMock'
import { UNGROUPED } from './types'

const tab = { id: 1, windowId: 7, title: 'Example Page', url: 'https://example.com/page' }
const clickInfo = (over: Record<string, unknown> = {}) => ({
  menuItemId: 'qura-add',
  selectionText: 'hello world',
  pageUrl: 'https://example.com/page',
  ...over,
})
const tick = () => new Promise((r) => setTimeout(r, 0))
const grp = (id: string) => ({ id, name: id, color: '#000000', order: 0, createdAt: 0 })

async function loadBackground(
  seedLocal: Record<string, unknown> = {},
  seedSession: Record<string, unknown> = {},
) {
  vi.resetModules()
  const c: MockChrome = installChrome(seedLocal, seedSession)
  await import('./background')
  return { c, onClicked: c._handlers.onClicked[0] }
}

describe('background capture routing', () => {
  it('saves a clip and routes to Ungrouped by default', async () => {
    const { c, onClicked } = await loadBackground()
    onClicked(clickInfo(), tab)
    await tick()
    const { items } = await c.storage.local.get('items')
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      text: 'hello world',
      url: 'https://example.com/page',
      host: 'example.com',
      title: 'Example Page',
      groupId: null,
    })
    const { lastCaptured } = await c.storage.session.get('lastCaptured')
    expect(lastCaptured).toMatchObject({ id: items[0].id, groupId: null })
  })

  it('routes to the currently open group', async () => {
    const { c, onClicked } = await loadBackground({ groups: [grp('g1')] }, { activeGroupId: 'g1' })
    onClicked(clickInfo(), tab)
    await tick()
    const { items } = await c.storage.local.get('items')
    expect(items[0].groupId).toBe('g1')
  })

  it('routes to the default group when on Home (activeGroupId null)', async () => {
    const { c, onClicked } = await loadBackground(
      { groups: [grp('g1')], pinnedGroupId: 'g1' },
      { activeGroupId: null },
    )
    onClicked(clickInfo(), tab)
    await tick()
    const { items } = await c.storage.local.get('items')
    expect(items[0].groupId).toBe('g1')
  })

  it('Inbox sentinel forces Ungrouped and skips the default', async () => {
    const { c, onClicked } = await loadBackground(
      { groups: [grp('g1')], pinnedGroupId: 'g1' },
      { activeGroupId: UNGROUPED },
    )
    onClicked(clickInfo(), tab)
    await tick()
    const { items } = await c.storage.local.get('items')
    expect(items[0].groupId).toBeNull()
  })

  it('ignores empty / whitespace-only selections', async () => {
    const { c, onClicked } = await loadBackground()
    onClicked(clickInfo({ selectionText: '   ' }), tab)
    await tick()
    const { items } = await c.storage.local.get('items')
    expect(items).toBeUndefined()
  })

  it('ignores clicks from other context-menu items', async () => {
    const { c, onClicked } = await loadBackground()
    onClicked(clickInfo({ menuItemId: 'something-else' }), tab)
    await tick()
    const { items } = await c.storage.local.get('items')
    expect(items).toBeUndefined()
  })

  it('falls back to host="" and title="Untitled" on a malformed URL with no tab title', async () => {
    const { c, onClicked } = await loadBackground()
    onClicked(clickInfo({ pageUrl: 'not a url' }), { windowId: 7 })
    await tick()
    const { items } = await c.storage.local.get('items')
    expect(items[0].host).toBe('')
    expect(items[0].title).toBe('Untitled')
  })
})

describe('capture-time locator', () => {
  const validLocator = {
    v: 1,
    exact: 'hello world',
    prefix: 'pre ',
    suffix: ' suf',
    selector: 'body > p:nth-of-type(1)',
  }

  it('attaches a sanitized locator from the page script result', async () => {
    const { c, onClicked } = await loadBackground()
    c._setExecuteScript(async () => [{ result: { ...validLocator, junk: 'dropped' } }])
    onClicked(clickInfo(), tab)
    await tick()
    const { items } = await c.storage.local.get('items')
    expect(items[0].locator).toEqual(validLocator)
    expect(items[0].locator).not.toHaveProperty('junk')
  })

  it('targets the clicked frame', async () => {
    const { c, onClicked } = await loadBackground()
    onClicked(clickInfo({ frameId: 3 }), tab)
    await tick()
    expect(c._calls.executeScript[0].target).toEqual({ tabId: 1, frameIds: [3] })
  })

  it('defaults to the top frame when frameId is absent', async () => {
    const { c, onClicked } = await loadBackground()
    onClicked(clickInfo(), tab)
    await tick()
    expect(c._calls.executeScript[0].target).toEqual({ tabId: 1, frameIds: [0] })
  })

  it('still captures when injection is rejected (restricted page)', async () => {
    const { c, onClicked } = await loadBackground()
    c._setExecuteScript(async () => {
      throw new Error('Cannot access a chrome:// URL')
    })
    onClicked(clickInfo(), tab)
    await tick()
    const { items } = await c.storage.local.get('items')
    expect(items).toHaveLength(1)
    expect(items[0].locator).toBeUndefined()
  })

  it('drops a malformed locator result without failing the capture', async () => {
    const { c, onClicked } = await loadBackground()
    c._setExecuteScript(async () => [{ result: { v: 99, exact: 5 } }])
    onClicked(clickInfo(), tab)
    await tick()
    const { items } = await c.storage.local.get('items')
    expect(items).toHaveLength(1)
    expect(items[0].locator).toBeUndefined()
  })

  it('skips injection entirely when there is no tab id', async () => {
    const { c, onClicked } = await loadBackground()
    onClicked(clickInfo(), { windowId: 7 })
    await tick()
    expect(c._calls.executeScript).toHaveLength(0)
    const { items } = await c.storage.local.get('items')
    expect(items).toHaveLength(1)
  })
})

describe('jump orchestration', () => {
  const seedItem = (over: Record<string, unknown> = {}) => ({
    id: 'it1',
    text: 'clip text',
    url: 'https://example.com/article',
    host: 'example.com',
    title: 'T',
    groupId: null,
    order: 1,
    createdAt: 1,
    ...over,
  })

  it('qura:jump opens the tab and records a pending jump', async () => {
    const locator = { v: 1, exact: 'clip text', prefix: '', suffix: '', selector: 'body' }
    const { c } = await loadBackground({ items: [seedItem({ locator })] })
    const res = await c._sendMessage({ type: 'qura:jump', itemId: 'it1' })
    expect(res).toEqual({ ok: true })
    expect(c._calls.tabsCreate[0]).toMatchObject({
      url: 'https://example.com/article',
      active: true,
    })
    const { pendingJumps } = await c.storage.session.get('pendingJumps')
    const entry = Object.values(pendingJumps)[0] as Record<string, unknown>
    expect(entry).toMatchObject({ itemId: 'it1', text: 'clip text', locator })
  })

  it('qura:jump refuses unknown items and non-http(s) urls', async () => {
    const { c } = await loadBackground({ items: [seedItem({ url: 'javascript:alert(1)' })] })
    expect(await c._sendMessage({ type: 'qura:jump', itemId: 'missing' })).toEqual({ ok: false })
    expect(await c._sendMessage({ type: 'qura:jump', itemId: 'it1' })).toEqual({ ok: false })
    expect(c._calls.tabsCreate).toHaveLength(0)
  })

  it('onUpdated complete injects the highlighter into the pending tab only', async () => {
    const { c } = await loadBackground({ items: [seedItem()] })
    await c._sendMessage({ type: 'qura:jump', itemId: 'it1' })
    const tabId = c._calls.tabsCreate.length && (await c.storage.session.get('pendingJumps'))
    const pending = (tabId as any).pendingJumps as Record<string, unknown>
    const jumpTabId = Number(Object.keys(pending)[0])

    c._handlers.onUpdated[0](999, { status: 'complete' }, {})
    await tick()
    expect(c._calls.executeScript).toHaveLength(0)

    c._handlers.onUpdated[0](jumpTabId, { status: 'loading' }, {})
    await tick()
    expect(c._calls.executeScript).toHaveLength(0)

    c._handlers.onUpdated[0](jumpTabId, { status: 'complete' }, {})
    await tick()
    expect(c._calls.executeScript).toHaveLength(1)
    expect(c._calls.executeScript[0]).toMatchObject({
      target: { tabId: jumpTabId, allFrames: true },
      files: ['stub-script.js'],
    })
  })

  it('qura:get-jump returns the payload for the sender tab without consuming it', async () => {
    const { c } = await loadBackground({ items: [seedItem()] })
    await c._sendMessage({ type: 'qura:jump', itemId: 'it1' })
    const { pendingJumps } = await c.storage.session.get('pendingJumps')
    const jumpTabId = Number(Object.keys(pendingJumps)[0])

    const payload = await c._sendMessage({ type: 'qura:get-jump' }, { tab: { id: jumpTabId } })
    expect(payload).toEqual({ text: 'clip text' })
    // not consumed — a second frame can still ask
    expect(await c._sendMessage({ type: 'qura:get-jump' }, { tab: { id: jumpTabId } })).toEqual({
      text: 'clip text',
    })
    // unknown tab → null
    expect(await c._sendMessage({ type: 'qura:get-jump' }, { tab: { id: 12345 } })).toBeNull()
  })

  it('injects only once — a second complete on the same tab does not re-inject', async () => {
    const { c } = await loadBackground({ items: [seedItem()] })
    await c._sendMessage({ type: 'qura:jump', itemId: 'it1' })
    const { pendingJumps } = await c.storage.session.get('pendingJumps')
    const jumpTabId = Number(Object.keys(pendingJumps)[0])

    c._handlers.onUpdated[0](jumpTabId, { status: 'complete' }, {})
    await tick()
    expect(c._calls.executeScript).toHaveLength(1)

    // A later in-page navigation / bfcache restore re-fires complete — must NOT
    // re-run the highlighter on a page the user wasn't sent to.
    c._handlers.onUpdated[0](jumpTabId, { status: 'complete' }, {})
    await tick()
    expect(c._calls.executeScript).toHaveLength(1)
  })

  it('qura:jump-result deletes the pending entry on success AND on miss', async () => {
    for (const ok of [true, false]) {
      const { c } = await loadBackground({ items: [seedItem()] })
      await c._sendMessage({ type: 'qura:jump', itemId: 'it1' })
      const { pendingJumps } = await c.storage.session.get('pendingJumps')
      const jumpTabId = Number(Object.keys(pendingJumps)[0])

      await c._sendMessage({ type: 'qura:jump-result', ok }, { tab: { id: jumpTabId } })
      await tick()
      const after = await c.storage.session.get('pendingJumps')
      expect(after.pendingJumps).toEqual({})
    }
  })

  it('tab removal and the TTL sweep clean up pending entries', async () => {
    const stale = { itemId: 'x', text: 't', createdAt: Date.now() - 120_000 }
    const { c } = await loadBackground({ items: [seedItem()] }, { pendingJumps: { '50': stale } })
    await c._sendMessage({ type: 'qura:jump', itemId: 'it1' })
    const { pendingJumps } = await c.storage.session.get('pendingJumps')
    const jumpTabId = Number(Object.keys(pendingJumps).find((k) => k !== '50'))

    // any onUpdated completion sweeps the stale entry
    c._handlers.onUpdated[0](jumpTabId, { status: 'complete' }, {})
    await tick()
    const swept = await c.storage.session.get('pendingJumps')
    expect(swept.pendingJumps['50']).toBeUndefined()

    c._handlers.onRemoved[0](jumpTabId)
    await tick()
    const removed = await c.storage.session.get('pendingJumps')
    expect(removed.pendingJumps).toEqual({})
  })

  it('injection failure on a restricted page drops the pending entry', async () => {
    const { c } = await loadBackground({ items: [seedItem()] })
    await c._sendMessage({ type: 'qura:jump', itemId: 'it1' })
    const { pendingJumps } = await c.storage.session.get('pendingJumps')
    const jumpTabId = Number(Object.keys(pendingJumps)[0])

    c._setExecuteScript(async () => {
      throw new Error('Cannot access contents of the page')
    })
    c._handlers.onUpdated[0](jumpTabId, { status: 'complete' }, {})
    await tick()
    const after = await c.storage.session.get('pendingJumps')
    expect(after.pendingJumps).toEqual({})
  })
})
