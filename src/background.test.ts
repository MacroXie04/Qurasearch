import { describe, it, expect, vi } from 'vitest'
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
