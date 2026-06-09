// Shared data model and constants for Qurasearch.
import { type Locator } from './locate/locator'

export { type Locator }

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
  /** DOM context for jump-back highlighting. Absent on clips captured before
      this feature or on pages where the capture script could not run. */
  locator?: Locator
}

// ---------------------------------------------------------------------------
// Jump-to-highlight messaging (panel ⇄ background ⇄ injected script)
// ---------------------------------------------------------------------------

/** Panel → background: open `itemId`'s source and highlight the clip there. */
export interface JumpRequest {
  type: 'qura:jump'
  itemId: string
}

/** Injected script → background: "what am I supposed to highlight in this tab?" */
export interface GetJumpRequest {
  type: 'qura:get-jump'
}

/** Injected script → background: highlight outcome (ok deletes the pending entry). */
export interface JumpResult {
  type: 'qura:jump-result'
  ok: boolean
}

export type QuraMessage = JumpRequest | GetJumpRequest | JumpResult

/** What the injected script needs to find the clip on the page. */
export interface JumpPayload {
  text: string
  locator?: Locator
}

/** Session-storage entry under `pendingJumps`, keyed by tabId. */
export interface PendingJump extends JumpPayload {
  itemId: string
  createdAt: number
  /** Set once the highlighter has been injected, so a later navigation of the
      same tab does not re-inject into an unrelated page. */
  injected?: boolean
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
