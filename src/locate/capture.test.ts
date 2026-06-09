// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { collectLocator } from './capture'
import { sanitizeLocator } from './locator'

// chrome.scripting.executeScript({func}) serializes the function with
// toString() — closures over module scope are silently lost. Rehydrating from
// source makes any accidental module-scope reference throw in tests.
// (Test-only eval: the CI CSP guard scans dist/, not test files.)
const rehydrated = (0, eval)('(' + collectLocator.toString() + ')') as typeof collectLocator

function setBody(html: string) {
  document.body.innerHTML = html
}

function selectRange(
  startNode: Node,
  startOffset: number,
  endNode: Node,
  endOffset: number,
): void {
  const range = document.createRange()
  range.setStart(startNode, startOffset)
  range.setEnd(endNode, endOffset)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
}

afterEach(() => {
  window.getSelection()?.removeAllRanges()
  document.body.innerHTML = ''
})

describe('collectLocator (rehydrated — must be self-contained)', () => {
  it('captures exact text, context, and an id-anchored selector', () => {
    setBody(
      '<main id="content"><p>Before paragraph gives prefix context here.</p>' +
        '<p>The quick brown fox jumps over the lazy dog.</p>' +
        '<p>After paragraph gives suffix context here.</p></main>',
    )
    const p = document.querySelectorAll('p')[1].firstChild!
    selectRange(p, 4, p, 19) // "quick brown fox"

    const raw = rehydrated()
    const locator = sanitizeLocator(raw)
    expect(locator).toBeDefined()
    expect(locator!.exact).toBe('quick brown fox')
    expect(locator!.prefix.endsWith('The ')).toBe(true)
    expect(locator!.suffix.startsWith(' jumps over')).toBe(true)
    expect(locator!.selector).toContain('#content')
    expect(document.querySelector(locator!.selector)).toBe(
      document.querySelectorAll('p')[1],
    )
    expect(locator!.frameUrl).toBeUndefined()
  })

  it('captures a cross-element selection with the common ancestor selector', () => {
    setBody('<div><p>first <b>bold</b> part</p><p>second part</p></div>')
    const start = document.querySelector('b')!.firstChild!
    const end = document.querySelectorAll('p')[1].firstChild!
    selectRange(start, 0, end, 6) // "bold part" + "second"

    const locator = sanitizeLocator(rehydrated())
    expect(locator).toBeDefined()
    expect(locator!.exact).toBe('bold partsecond')
    // common ancestor of both <p>s is the <div>
    expect(document.querySelector(locator!.selector)?.tagName).toBe('DIV')
  })

  it('keeps partial context instead of discarding it in deeply nested layouts', () => {
    // Selection starts at offset 0 inside 5 nested block wrappers with no
    // preceding text in them — climbing exhausts its budget before reaching
    // the <p> that holds the real preceding context. Must not yield ''.
    setBody(
      '<p>Plenty of preceding context lives here for the clip.</p>' +
        '<div><div><div><div><div><p>selected sentence starts the block.</p></div></div></div></div></div>',
    )
    const inner = document.querySelectorAll('p')[1].firstChild!
    selectRange(inner, 0, inner, 17) // "selected sentence"
    const locator = sanitizeLocator(rehydrated())
    expect(locator).toBeDefined()
    expect(locator!.suffix.length).toBeGreaterThan(0)
  })

  it('builds nth-of-type chains when no usable id exists', () => {
    setBody('<section><p>one</p><p>two two two</p></section>')
    const p2 = document.querySelectorAll('p')[1].firstChild!
    selectRange(p2, 0, p2, 11)

    const locator = sanitizeLocator(rehydrated())
    expect(locator).toBeDefined()
    expect(locator!.selector).toMatch(/^body > section:nth-of-type\(1\) > p:nth-of-type\(2\)$/)
  })

  it('ignores duplicate ids', () => {
    setBody('<div id="dup"><p>alpha beta gamma</p></div><div id="dup"></div>')
    const p = document.querySelector('p')!.firstChild!
    selectRange(p, 0, p, 5)
    const locator = sanitizeLocator(rehydrated())
    expect(locator!.selector).not.toContain('#dup')
  })

  it('returns null with no selection or a collapsed selection', () => {
    setBody('<p>text</p>')
    expect(rehydrated()).toBeNull()
    const p = document.querySelector('p')!.firstChild!
    selectRange(p, 1, p, 1)
    expect(rehydrated()).toBeNull()
  })

  it('caps exact at 8000 chars (and the result still sanitizes)', () => {
    const long = 'word '.repeat(2500) // 12,500 chars
    setBody(`<p>${long}</p>`)
    const p = document.querySelector('p')!.firstChild!
    selectRange(p, 0, p, (p as Text).data.length)
    const locator = sanitizeLocator(rehydrated())
    expect(locator).toBeDefined()
    expect(locator!.exact.length).toBe(8000)
  })
})

describe('sanitizeLocator', () => {
  const valid = { v: 1, exact: 'x', prefix: '', suffix: '', selector: 'body' }

  it('accepts a valid locator and drops unknown keys', () => {
    const out = sanitizeLocator({ ...valid, evil: 'payload' })
    expect(out).toEqual(valid)
    expect(out).not.toHaveProperty('evil')
  })

  it('keeps a valid frameUrl', () => {
    expect(sanitizeLocator({ ...valid, frameUrl: 'https://e.com/f' })?.frameUrl).toBe(
      'https://e.com/f',
    )
  })

  it.each([
    ['wrong version', { ...valid, v: 2 }],
    ['missing exact', { ...valid, exact: undefined }],
    ['whitespace exact', { ...valid, exact: '   ' }],
    ['non-string selector', { ...valid, selector: 5 }],
    ['non-string frameUrl', { ...valid, frameUrl: 5 }],
    ['oversize exact', { ...valid, exact: 'x'.repeat(8001) }],
    ['oversize selector', { ...valid, selector: 's'.repeat(1001) }],
    ['null', null],
    ['string', 'nope'],
  ])('rejects %s', (_name, raw) => {
    expect(sanitizeLocator(raw)).toBeUndefined()
  })
})
