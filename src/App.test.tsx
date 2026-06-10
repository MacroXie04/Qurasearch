// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { installChrome } from './test/chromeMock'

// Replace the Lit-based @material/web wrappers with light host elements so <App/>
// renders in jsdom without the web-component runtime.
vi.mock('./md', async () => {
  const React = await import('react')
  const make =
    (tag: string, opts: { button?: boolean; overlay?: boolean } = {}) =>
    (props: any) => {
      if (opts.overlay && props.open === false) return null
      const domProps: any = { onClick: props.onClick, 'data-tag': tag }
      if (props['aria-label']) domProps['aria-label'] = props['aria-label']
      if (props.id) domProps.id = props.id
      if (props.className) domProps.className = props.className
      return React.createElement(opts.button ? 'button' : 'div', domProps, props.children)
    }
  return {
    IconButton: make('icon-button', { button: true }),
    FilledButton: make('filled-button', { button: true }),
    TextButton: make('text-button', { button: true }),
    Fab: make('fab', { button: true }),
    List: make('list'),
    ListItem: make('list-item', { button: true }),
    Menu: make('menu', { overlay: true }),
    MenuItem: make('menu-item', { button: true }),
    Divider: make('divider'),
    Dialog: make('dialog', { overlay: true }),
    OutlinedTextField: make('text-field'),
  }
})

afterEach(cleanup)

async function mountApp(
  seedLocal: Record<string, unknown> = {},
  seedSession: Record<string, unknown> = {},
) {
  vi.resetModules()
  const c = installChrome(seedLocal, seedSession)
  const store = await import('./store')
  await store.initStore()
  const { App } = await import('./App')
  render(<App />)
  return c
}

describe('App capture snackbar (one-shot)', () => {
  it('shows "Saved to <group>" once and consumes the session marker', async () => {
    const c = await mountApp({}, { lastCaptured: { id: 'cap1', groupId: null, ts: Date.now() } })
    expect(await screen.findByText(/Saved to Ungrouped/)).toBeTruthy()
    // The one-shot marker is cleared so reopening the panel can't re-fire it.
    const { lastCaptured } = await c.storage.session.get('lastCaptured')
    expect(lastCaptured).toBeUndefined()
  })

  it('does not show a snackbar for a stale capture (>10s old)', async () => {
    await mountApp({}, { lastCaptured: { id: 'old', groupId: null, ts: Date.now() - 20000 } })
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.queryByText(/Saved to/)).toBeNull()
  })
})
