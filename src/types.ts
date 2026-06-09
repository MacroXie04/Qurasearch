// Shared data model and constants for Qurasearch.

/** Sentinel value for `activeGroupId` when the Inbox (Ungrouped) detail view is open. */
export const UNGROUPED = '__ungrouped__'

export interface Group {
  id: string
  name: string
  color: string
  order: number
  createdAt: number
}

export interface Item {
  id: string
  text: string
  url: string
  host: string
  title: string
  /** `null` means the clip lives in "Ungrouped" (the Inbox). */
  groupId: string | null
  order: number
  createdAt: number
}

export const BACKUP_VERSION = 1

export interface Backup {
  version: number
  exportedAt: number
  groups: Group[]
  items: Item[]
  pinnedGroupId: string | null
}

/** Group palette — 10 distinguishable colors the user picks from. */
export const PALETTE = [
  '#6750A4',
  '#1565C0',
  '#2E7D32',
  '#EF6C00',
  '#C2185B',
  '#00838F',
  '#5D4037',
  '#7B1FA2',
  '#558B2F',
  '#455A64',
] as const

/** Which screen the side panel is showing. */
export type View =
  | { kind: 'home' }
  | { kind: 'group'; groupId: string }
  | { kind: 'inbox' }
  | { kind: 'search' }
