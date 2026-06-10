import { describe, expect, it } from 'vitest'

import { resolveTargetGroupId } from './storage'
import { type Group, UNGROUPED } from './types'

const g = (id: string): Group => ({ id, name: id, color: '#000000', order: 0, createdAt: 0 })
const groups = [g('g1'), g('g2')]

describe('resolveTargetGroupId (capture-target rule)', () => {
  it('routes to the currently open group', () => {
    expect(resolveTargetGroupId('g1', 'g2', groups)).toBe('g1')
  })

  it('Inbox sentinel forces Ungrouped and skips the default group', () => {
    expect(resolveTargetGroupId(UNGROUPED, 'g2', groups)).toBeNull()
  })

  it('falls back to the default group on Home / panel-closed', () => {
    expect(resolveTargetGroupId(null, 'g2', groups)).toBe('g2')
  })

  it('falls back to Ungrouped when there is no active group and no default', () => {
    expect(resolveTargetGroupId(null, null, groups)).toBeNull()
  })

  it('ignores a stale active group id that no longer exists', () => {
    expect(resolveTargetGroupId('gone', 'g1', groups)).toBe('g1')
  })

  it('ignores a default group id that no longer exists', () => {
    expect(resolveTargetGroupId(null, 'gone', groups)).toBeNull()
  })
})
