// Low-level chrome.storage access shared by the background worker and the panel.
import { type Group, type Item, UNGROUPED } from './types'

export interface LocalData {
  groups: Group[]
  items: Item[]
  pinnedGroupId: string | null
}

/** Written by the background after each capture so the panel can show the "Saved" snackbar. */
export interface LastCaptured {
  id: string
  groupId: string | null
  ts: number
}

export function uid(): string {
  return crypto.randomUUID()
}

export async function getLocalData(): Promise<LocalData> {
  const r = await chrome.storage.local.get(['groups', 'items', 'pinnedGroupId'])
  return {
    groups: (r.groups as Group[] | undefined) ?? [],
    items: (r.items as Item[] | undefined) ?? [],
    pinnedGroupId: (r.pinnedGroupId as string | null | undefined) ?? null,
  }
}

/**
 * The core capture-target rule. Priority:
 *   1. the currently open group (panel is on a group detail view)
 *   2. the default group (pinnedGroupId), if any
 *   3. Ungrouped
 * Being inside the Inbox view (activeGroupId === UNGROUPED) forces Ungrouped and
 * deliberately skips the default group.
 */
export function resolveTargetGroupId(
  activeGroupId: string | null | undefined,
  pinnedGroupId: string | null,
  groups: Group[],
): string | null {
  if (activeGroupId === UNGROUPED) return null
  if (activeGroupId && groups.some((g) => g.id === activeGroupId)) return activeGroupId
  if (pinnedGroupId && groups.some((g) => g.id === pinnedGroupId)) return pinnedGroupId
  return null
}
