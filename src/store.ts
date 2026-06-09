// Single source of truth for the side panel: reads/writes chrome.storage and
// pushes updates into React via useSyncExternalStore + chrome.storage.onChanged.
import { useSyncExternalStore } from 'react'
import { type Backup, BACKUP_VERSION, type Group, type Item } from './types'
import { getLocalData, uid, type LastCaptured, type LocalData } from './storage'

export interface StoreState {
  groups: Group[]
  items: Item[]
  pinnedGroupId: string | null
  activeGroupId: string | null
  lastCaptured: LastCaptured | null
  ready: boolean
}

let state: StoreState = {
  groups: [],
  items: [],
  pinnedGroupId: null,
  activeGroupId: null,
  lastCaptured: null,
  ready: false,
}

const listeners = new Set<() => void>()
function emit() {
  for (const l of listeners) l()
}
function setState(patch: Partial<StoreState>) {
  state = { ...state, ...patch }
  emit()
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
export function getSnapshot(): StoreState {
  return state
}

export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, getSnapshot)
}

// ---------------------------------------------------------------------------
// Init: hydrate from storage and subscribe to cross-context changes.
// ---------------------------------------------------------------------------
let initialized = false
export async function initStore(): Promise<void> {
  if (initialized) return
  initialized = true

  // Subscribe BEFORE reading so a write that commits during hydration is still
  // delivered (otherwise it could slip between the read and the subscription).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      const patch: Partial<StoreState> = {}
      if (changes.groups) patch.groups = (changes.groups.newValue as Group[]) ?? []
      if (changes.items) patch.items = (changes.items.newValue as Item[]) ?? []
      if ('pinnedGroupId' in changes)
        patch.pinnedGroupId = (changes.pinnedGroupId.newValue as string | null) ?? null
      if (Object.keys(patch).length) setState(patch)
    } else if (area === 'session') {
      const patch: Partial<StoreState> = {}
      if ('activeGroupId' in changes)
        patch.activeGroupId = (changes.activeGroupId.newValue as string | null) ?? null
      if ('lastCaptured' in changes)
        patch.lastCaptured = (changes.lastCaptured.newValue as LastCaptured | null) ?? null
      if (Object.keys(patch).length) setState(patch)
    }
  })

  const [local, session] = await Promise.all([
    getLocalData(),
    chrome.storage.session.get(['activeGroupId', 'lastCaptured']),
  ])
  setState({
    ...local,
    activeGroupId: (session.activeGroupId as string | null | undefined) ?? null,
    lastCaptured: (session.lastCaptured as LastCaptured | null | undefined) ?? null,
    ready: true,
  })
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------
/** Groups sorted for display (oldest first / creation order). */
export function sortedGroups(s: StoreState): Group[] {
  return [...s.groups].sort((a, b) => a.order - b.order)
}
/** Clips for a group (null = Ungrouped), newest first. */
export function itemsForGroup(s: StoreState, groupId: string | null): Item[] {
  return s.items.filter((i) => i.groupId === groupId).sort((a, b) => b.order - a.order)
}
export function countForGroup(s: StoreState, groupId: string | null): number {
  return s.items.reduce((n, i) => (i.groupId === groupId ? n + 1 : n), 0)
}
export function groupName(s: StoreState, groupId: string | null): string {
  if (groupId == null) return 'Ungrouped'
  return s.groups.find((g) => g.id === groupId)?.name ?? 'Ungrouped'
}

// ---------------------------------------------------------------------------
// Mutations — all writes go through chrome.storage so background + panel stay
// in sync via onChanged. Each mutation re-reads the latest stored value before
// computing its write (read-modify-write), so a concurrent capture from the
// background worker can't be clobbered by a stale in-memory snapshot.
// ---------------------------------------------------------------------------
async function mutateLocal(fn: (data: LocalData) => Partial<LocalData>): Promise<void> {
  const fresh = await getLocalData()
  const patch = fn(fresh)
  if (Object.keys(patch).length) await chrome.storage.local.set(patch)
}

export async function addGroup(name: string, color: string): Promise<string> {
  const now = Date.now()
  const g: Group = { id: uid(), name: name.trim() || 'Untitled', color, order: now, createdAt: now }
  await mutateLocal(({ groups }) => ({ groups: [...groups, g] }))
  return g.id
}

export async function updateGroup(
  id: string,
  patch: Partial<Pick<Group, 'name' | 'color'>>,
): Promise<void> {
  const next = { ...patch }
  if (typeof next.name === 'string') next.name = next.name.trim() || 'Untitled'
  await mutateLocal(({ groups }) => ({
    groups: groups.map((g) => (g.id === id ? { ...g, ...next } : g)),
  }))
}

export async function deleteGroup(id: string): Promise<void> {
  await mutateLocal(({ groups, items, pinnedGroupId }) => ({
    groups: groups.filter((g) => g.id !== id),
    // Move the group's clips back to Ungrouped rather than deleting them.
    items: items.map((i) => (i.groupId === id ? { ...i, groupId: null } : i)),
    pinnedGroupId: pinnedGroupId === id ? null : pinnedGroupId,
  }))
}

export async function setDefaultGroup(id: string | null): Promise<void> {
  await chrome.storage.local.set({ pinnedGroupId: id })
}

export async function deleteItem(id: string): Promise<void> {
  await mutateLocal(({ items }) => ({ items: items.filter((i) => i.id !== id) }))
}

/** Re-insert a previously deleted clip (used by snackbar Undo). */
export async function restoreItem(item: Item): Promise<void> {
  await mutateLocal(({ items }) =>
    items.some((i) => i.id === item.id) ? {} : { items: [...items, item] },
  )
}

export async function moveItem(id: string, groupId: string | null): Promise<void> {
  const now = Date.now()
  await mutateLocal(({ items }) => ({
    items: items.map((i) => (i.id === id ? { ...i, groupId, order: now } : i)),
  }))
}

/** Rewrite `order` (descending) for a group's items from a top-to-bottom id list. */
export async function reorderItems(orderedIds: string[]): Promise<void> {
  const base = Date.now()
  const orderById = new Map(orderedIds.map((id, i) => [id, base - i]))
  await mutateLocal(({ items }) => ({
    items: items.map((i) => (orderById.has(i.id) ? { ...i, order: orderById.get(i.id)! } : i)),
  }))
}

export async function setActiveGroup(activeGroupId: string | null): Promise<void> {
  await chrome.storage.session.set({ activeGroupId })
}

/** Consume the one-shot capture marker so the "Saved" snackbar can't re-fire on reopen. */
export async function clearLastCaptured(): Promise<void> {
  await chrome.storage.session.remove('lastCaptured')
}

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------
export function buildBackup(): Backup {
  return {
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    groups: state.groups,
    items: state.items,
    pinnedGroupId: state.pinnedGroupId,
  }
}

export async function importBackup(backup: Backup, mode: 'merge' | 'replace'): Promise<void> {
  const inGroups = Array.isArray(backup.groups) ? backup.groups : []
  const inItems = Array.isArray(backup.items) ? backup.items : []
  if (mode === 'replace') {
    await chrome.storage.local.set({
      groups: inGroups,
      items: inItems,
      pinnedGroupId: backup.pinnedGroupId ?? null,
    })
    return
  }
  // merge — de-dupe by id, keeping existing entries.
  await mutateLocal(({ groups, items, pinnedGroupId }) => {
    const groupIds = new Set(groups.map((g) => g.id))
    const itemIds = new Set(items.map((i) => i.id))
    return {
      groups: [...groups, ...inGroups.filter((g) => !groupIds.has(g.id))],
      items: [...items, ...inItems.filter((i) => !itemIds.has(i.id))],
      pinnedGroupId: pinnedGroupId ?? backup.pinnedGroupId ?? null,
    }
  })
}
