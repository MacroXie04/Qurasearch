// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { downloadText, downloadJson } from './util'

function captureNextAnchor(): { current: HTMLAnchorElement | null } {
  const captured: { current: HTMLAnchorElement | null } = { current: null }
  const origAppend = document.body.appendChild.bind(document.body)
  vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
    if (node instanceof HTMLAnchorElement) {
      captured.current = node
      vi.spyOn(node, 'click').mockImplementation(() => {})
    }
    return origAppend(node)
  })
  return captured
}

describe('downloadText / downloadJson', () => {
  it('downloads with the given filename and mime', () => {
    // jsdom has no URL.createObjectURL — stub it.
    const create = vi.fn((_blob: Blob) => 'blob:fake')
    const revoke = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }))
    const anchor = captureNextAnchor()

    downloadText('notes.md', '# hi', 'text/markdown')

    expect(anchor.current?.download).toBe('notes.md')
    expect(anchor.current?.href).toBe('blob:fake')
    const blob = create.mock.calls[0][0] as Blob
    expect(blob.type).toBe('text/markdown')
  })

  it('downloadJson wraps downloadText with pretty JSON', () => {
    const create = vi.fn((_blob: Blob) => 'blob:fake')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }))
    const anchor = captureNextAnchor()

    downloadJson('backup.json', { a: 1 })

    expect(anchor.current?.download).toBe('backup.json')
    const blob = create.mock.calls[0][0] as Blob
    expect(blob.type).toBe('application/json')
  })
})
