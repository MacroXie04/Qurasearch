import { describe, expect, it, vi } from 'vitest'

import { installChrome } from './test/chromeMock'
import type { Backup, Group, Item } from './types'

const grp = (id: string, over: Partial<Group> = {}): Group => ({
  id,
  name: id,
  color: '#123456',
  order: 0,
  createdAt: 0,
  ...over,
})
const itm = (id: string, groupId: string | null, order = 0): Item => ({
  id,
  text: id + ' text',
  url: 'https://e.com/' + id,
  host: 'e.com',
  title: id,
  groupId,
  order,
  createdAt: order,
})

// Re-import the store with a fresh module instance + fresh chrome mock per test.
async function freshStore(
  seedLocal: Record<string, unknown> = {},
  seedSession: Record<string, unknown> = {},
) {
  vi.resetModules()
  installChrome(seedLocal, seedSession)
  const store = await import('./store')
  await store.initStore()
  return store
}

describe('store mutations', () => {
  it('addGroup creates a group', async () => {
    const store = await freshStore()
    const id = await store.addGroup('Work', '#6750A4')
    const s = store.getSnapshot()
    expect(s.groups).toHaveLength(1)
    expect(s.groups[0]).toMatchObject({ id, name: 'Work', color: '#6750A4' })
  })

  it('deleteGroup moves its clips to Ungrouped and clears the default', async () => {
    const store = await freshStore({
      groups: [grp('g1'), grp('g2')],
      items: [itm('a', 'g1'), itm('b', 'g2'), itm('c', null)],
      pinnedGroupId: 'g1',
    })
    await store.deleteGroup('g1')
    const s = store.getSnapshot()
    expect(s.groups.map((g) => g.id)).toEqual(['g2'])
    expect(s.items.find((i) => i.id === 'a')!.groupId).toBeNull()
    expect(s.items.find((i) => i.id === 'b')!.groupId).toBe('g2')
    expect(s.pinnedGroupId).toBeNull()
  })

  it('moveItem changes group and bumps order to the top', async () => {
    const store = await freshStore({ groups: [grp('g1')], items: [itm('a', null, 10)] })
    await store.moveItem('a', 'g1')
    const moved = store.getSnapshot().items.find((i) => i.id === 'a')!
    expect(moved.groupId).toBe('g1')
    expect(moved.order).toBeGreaterThan(10)
  })

  it('reorderItems persists the new visible (DESC) order', async () => {
    const store = await freshStore({
      groups: [grp('g1')],
      items: [itm('a', 'g1', 100), itm('b', 'g1', 200), itm('c', 'g1', 300)],
    })
    // Visible order is DESC: [c, b, a]; reorder to put a first, then c, then b.
    await store.reorderItems(['a', 'c', 'b'])
    const visible = store.itemsForGroup(store.getSnapshot(), 'g1').map((i) => i.id)
    expect(visible).toEqual(['a', 'c', 'b'])
  })

  it('setDefaultGroup sets and unsets the pinned group', async () => {
    const store = await freshStore({ groups: [grp('g1')] })
    await store.setDefaultGroup('g1')
    expect(store.getSnapshot().pinnedGroupId).toBe('g1')
    await store.setDefaultGroup(null)
    expect(store.getSnapshot().pinnedGroupId).toBeNull()
  })

  it('deleteItem then restoreItem round-trips the clip', async () => {
    const item = itm('a', null, 5)
    const store = await freshStore({ items: [item] })
    await store.deleteItem('a')
    expect(store.getSnapshot().items).toHaveLength(0)
    await store.restoreItem(item)
    expect(store.getSnapshot().items.map((i) => i.id)).toEqual(['a'])
  })

  it('clearLastCaptured consumes the one-shot capture marker', async () => {
    const store = await freshStore({}, { lastCaptured: { id: 'x', groupId: null, ts: 1 } })
    expect(store.getSnapshot().lastCaptured).not.toBeNull()
    await store.clearLastCaptured()
    expect(store.getSnapshot().lastCaptured).toBeNull()
  })
})

describe('backup import', () => {
  const backup: Backup = {
    version: 1,
    exportedAt: 0,
    groups: [grp('g1'), grp('g2')],
    items: [itm('i1', 'g1'), itm('i2', 'g2')],
    pinnedGroupId: 'g2',
  }

  it('merge de-dupes by id and adopts the backup default when none is set', async () => {
    const store = await freshStore({
      groups: [grp('g1')],
      items: [itm('i1', 'g1')],
      pinnedGroupId: null,
    })
    await store.importBackup(backup, 'merge')
    const s = store.getSnapshot()
    expect(s.groups.map((g) => g.id).sort()).toEqual(['g1', 'g2'])
    expect(s.items.map((i) => i.id).sort()).toEqual(['i1', 'i2'])
    expect(s.pinnedGroupId).toBe('g2')
  })

  it('replace overwrites everything', async () => {
    const store = await freshStore({
      groups: [grp('zz')],
      items: [itm('zz', null)],
      pinnedGroupId: 'zz',
    })
    await store.importBackup(backup, 'replace')
    const s = store.getSnapshot()
    expect(s.groups.map((g) => g.id)).toEqual(['g1', 'g2'])
    expect(s.items.map((i) => i.id)).toEqual(['i1', 'i2'])
    expect(s.pinnedGroupId).toBe('g2')
  })

  it('keeps a valid locator and strips malformed ones, keeping the item', async () => {
    const validLocator = { v: 1, exact: 'sel text', prefix: 'a', suffix: 'b', selector: '#x' }
    const store = await freshStore()
    await store.importBackup(
      {
        version: 1,
        exportedAt: 0,
        groups: [],
        items: [
          { ...itm('ok', null), locator: validLocator },
          { ...itm('badver', null), locator: { ...validLocator, v: 2 } },
          { ...itm('badshape', null), locator: { v: 1, exact: 7 } },
          { ...itm('oversize', null), locator: { ...validLocator, selector: 's'.repeat(2000) } },
        ] as Item[],
        pinnedGroupId: null,
      },
      'replace',
    )
    const s = store.getSnapshot()
    expect(s.items).toHaveLength(4)
    expect(s.items.find((i) => i.id === 'ok')!.locator).toEqual(validLocator)
    for (const id of ['badver', 'badshape', 'oversize']) {
      expect(s.items.find((i) => i.id === id)!.locator).toBeUndefined()
    }
  })
})

describe('selectors', () => {
  it('itemsForGroup sorts DESC; countForGroup and groupName work', async () => {
    const store = await freshStore({
      groups: [grp('g1')],
      items: [itm('a', 'g1', 1), itm('b', 'g1', 3), itm('c', null, 2)],
    })
    const s = store.getSnapshot()
    expect(store.itemsForGroup(s, 'g1').map((i) => i.id)).toEqual(['b', 'a'])
    expect(store.countForGroup(s, 'g1')).toBe(2)
    expect(store.countForGroup(s, null)).toBe(1)
    expect(store.groupName(s, 'g1')).toBe('g1')
    expect(store.groupName(s, null)).toBe('Ungrouped')
  })
})
