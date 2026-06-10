// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { installChrome } from '../test/chromeMock'
import type { Item } from '../types'

vi.mock('../md', async () => {
  const React = await import('react')
  const button = (tag: string) => (props: any) =>
    React.createElement(
      'button',
      {
        'aria-label': props['aria-label'],
        className: props.className,
        'data-tag': tag,
        disabled: props.disabled,
        onClick: props.onClick,
        type: props.type ?? 'button',
      },
      props.children,
    )
  const input = (type: 'checkbox' | 'radio') => (props: any) =>
    React.createElement('input', {
      'aria-label': props['aria-label'],
      checked: props.checked,
      name: props.name,
      onChange: props.onChange,
      type,
      value: props.value,
    })
  return {
    Checkbox: input('checkbox'),
    FilledButton: button('filled-button'),
    IconButton: button('icon-button'),
    OutlinedButton: button('outlined-button'),
    Radio: input('radio'),
  }
})

const item = (id: string, text: string): Item => ({
  id,
  text,
  url: 'https://example.com/' + id,
  host: 'example.com',
  title: 'Example',
  groupId: null,
  order: 1,
  createdAt: 1700000000000,
})

async function mountExport(seedLocal: Record<string, unknown> = {}) {
  vi.resetModules()
  const chrome = installChrome(seedLocal)
  const store = await import('../store')
  await store.initStore()
  const { ExportApp } = await import('./ExportApp')
  render(<ExportApp />)
  return chrome
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ExportApp editable output', () => {
  it('copies the edited output instead of the generated text', async () => {
    await mountExport({ items: [item('a', 'Generated clip')] })
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    const output = await screen.findByLabelText('Export preview')
    expect(output.tagName).toBe('TEXTAREA')
    fireEvent.change(output, { target: { value: 'edited export text' } })
    fireEvent.click(screen.getByText('Copy'))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('edited export text'))
  })

  it('saves the edited output in extension local storage', async () => {
    const chrome = await mountExport({ items: [item('a', 'Generated clip')] })

    const output = await screen.findByLabelText('Export preview')
    fireEvent.change(output, { target: { value: 'stored export text' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(async () => {
      const { savedExport } = await chrome.storage.local.get('savedExport')
      expect(savedExport).toMatchObject({
        text: 'stored export text',
        format: 'txt',
        linkStyle: 'after',
      })
    })
  })
})
