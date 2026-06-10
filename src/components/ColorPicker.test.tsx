// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PALETTE } from '../types'
import { ColorPicker } from './ColorPicker'

afterEach(cleanup)

describe('ColorPicker', () => {
  it('renders every palette swatch and marks the selected one', () => {
    const { container } = render(<ColorPicker value={PALETTE[2]} onChange={() => {}} />)
    const swatches = container.querySelectorAll('.swatch')
    expect(swatches).toHaveLength(PALETTE.length)
    const selected = container.querySelector('.swatch.selected')!
    expect(selected.getAttribute('aria-checked')).toBe('true')
  })

  it('calls onChange with the clicked color', () => {
    const onChange = vi.fn()
    const { container } = render(<ColorPicker value={PALETTE[0]} onChange={onChange} />)
    const swatches = container.querySelectorAll('.swatch')
    fireEvent.click(swatches[3])
    expect(onChange).toHaveBeenCalledWith(PALETTE[3])
  })
})
