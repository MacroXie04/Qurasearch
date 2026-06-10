import { describe, expect, it } from 'vitest'

import {
  csvField,
  escapeHtml,
  exportFilename,
  exportMime,
  type ExportSection,
  formatCsv,
  formatExport,
  formatHtml,
  formatMd,
  formatTxt,
  safeHref,
} from './formats'

const clip = (text: string, url = 'https://e.com/a', over = {}) => ({
  text,
  url,
  title: 'Title',
  host: 'e.com',
  createdAt: 1700000000000,
  ...over,
})

const one: ExportSection[] = [
  { groupName: 'Work', clips: [clip('first clip'), clip('second clip')] },
]
const two: ExportSection[] = [
  { groupName: 'Work', clips: [clip('work clip')] },
  { groupName: 'Play', clips: [clip('play clip')] },
]

describe('formatTxt', () => {
  it('text only', () => {
    expect(formatTxt(one, 'none')).toBe('first clip\n\nsecond clip\n')
  })

  it('text + url after each clip', () => {
    expect(formatTxt(one, 'after')).toBe(
      'first clip\nhttps://e.com/a\n\nsecond clip\nhttps://e.com/a\n',
    )
  })

  it('headings only with more than one section', () => {
    expect(formatTxt(one, 'none')).not.toContain('==')
    const out = formatTxt(two, 'none')
    expect(out).toContain('== Work ==')
    expect(out).toContain('== Play ==')
  })

  it('non-http(s) urls never become links', () => {
    const s: ExportSection[] = [{ groupName: 'G', clips: [clip('x', 'javascript:alert(1)')] }]
    expect(formatTxt(s, 'after')).toBe('x\n')
  })

  it('empty scope produces empty output', () => {
    expect(formatTxt([], 'after')).toBe('')
  })
})

describe('formatMd', () => {
  it('inline turns the clip into a link with an escaped, one-line label', () => {
    const s: ExportSection[] = [
      { groupName: 'G', clips: [clip('multi\nline [bracketed] \\ text', 'https://e.com/a(b)')] },
    ]
    expect(formatMd(s, 'inline')).toBe(
      '[multi line \\[bracketed\\] \\\\ text](https://e.com/a%28b%29)\n',
    )
  })

  it('after appends an autolink line', () => {
    expect(formatMd(one, 'after')).toBe(
      'first clip\n\n<https://e.com/a>\n\nsecond clip\n\n<https://e.com/a>\n',
    )
  })

  it('uses ## headings for multiple sections', () => {
    expect(formatMd(two, 'none')).toContain('## Work')
  })

  it('encodes a malicious URL so it cannot break out of the autolink', () => {
    const evil = 'https://e.com/a> <img src=x onerror="alert(1)">'
    const s: ExportSection[] = [{ groupName: 'G', clips: [clip('t', evil)] }]
    const out = formatMd(s, 'after')
    expect(out).not.toContain('<img')
    expect(out).toContain('%3E') // the '>' is encoded
  })

  it('escapes raw HTML tags inside inline link labels', () => {
    const s: ExportSection[] = [{ groupName: 'G', clips: [clip('<img src=x onerror=1>')] }]
    const out = formatMd(s, 'inline')
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img src=x onerror=1&gt;')
  })
})

describe('formatHtml', () => {
  it('escapes text and group names', () => {
    const s: ExportSection[] = [
      { groupName: '<img src=x>', clips: [clip('<script>alert("hi")</script>')] },
      { groupName: 'B', clips: [clip('y')] },
    ]
    const out = formatHtml(s, 'none')
    expect(out).not.toContain('<script>alert')
    expect(out).toContain('&lt;script&gt;')
    expect(out).toContain('<h2>&lt;img src=x&gt;</h2>')
  })

  it('links style wraps the text in an attribute-escaped anchor', () => {
    // safeHref returns the normalized u.href, which percent-encodes the quotes.
    const s: ExportSection[] = [{ groupName: 'G', clips: [clip('text', 'https://e.com/?q="x"')] }]
    const out = formatHtml(s, 'links')
    expect(out).toContain('<a href="https://e.com/?q=%22x%22">text</a>')
  })

  it('drops javascript: urls even in links style', () => {
    const s: ExportSection[] = [{ groupName: 'G', clips: [clip('text', 'javascript:alert(1)')] }]
    const out = formatHtml(s, 'links')
    expect(out).not.toContain('<a ')
    expect(out).not.toContain('javascript:')
  })

  it('is a complete document', () => {
    const out = formatHtml(one, 'links')
    expect(out).toMatch(/^<!doctype html>/)
    expect(out).toContain('<meta charset="utf-8">')
  })
})

describe('formatCsv / csvField', () => {
  it('quotes fields with commas, quotes, and newlines', () => {
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('line1\nline2')).toBe('"line1\nline2"')
    expect(csvField('plain')).toBe('plain')
  })

  it('defuses leading formula characters', () => {
    expect(csvField('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvField('+1')).toBe("'+1")
    expect(csvField('-1')).toBe("'-1")
    expect(csvField('@cmd')).toBe("'@cmd")
  })

  it('emits BOM, header, ISO dates, and CRLF endings', () => {
    const out = formatCsv(one)
    expect(out.startsWith('\uFEFF')).toBe(true)
    const lines = out.slice(1).split('\r\n')
    expect(lines[0]).toBe('text,url,title,host,group,createdAt')
    expect(lines[1]).toBe('first clip,https://e.com/a,Title,e.com,Work,2023-11-14T22:13:20.000Z')
    expect(out.endsWith('\r\n')).toBe(true)
  })

  it('does not crash on an out-of-range createdAt (corrupt imported backup)', () => {
    const s: ExportSection[] = [
      { groupName: 'G', clips: [clip('x', 'https://e.com/a', { createdAt: 1e30 })] },
    ]
    expect(() => formatCsv(s)).not.toThrow()
    const lines = formatCsv(s).slice(1).split('\r\n')
    expect(lines[1]).toBe('x,https://e.com/a,Title,e.com,G,') // empty timestamp, no throw
  })
})

describe('helpers', () => {
  it('safeHref accepts only http(s) and returns the normalized, encoded href', () => {
    expect(safeHref('https://e.com')).toBe('https://e.com/')
    expect(safeHref('http://e.com')).toBe('http://e.com/')
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('file:///etc/passwd')).toBeNull()
    expect(safeHref('not a url')).toBeNull()
    // Normalization percent-encodes characters that could break out of a
    // markdown <autolink> or an HTML attribute.
    expect(safeHref('https://e.com/a> <img src=x>')).toBe('https://e.com/a%3E%20%3Cimg%20src=x%3E')
  })

  it('escapeHtml covers the critical five', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })

  it('exportFilename / exportMime line up per format', () => {
    expect(exportFilename('md', '2026-06-09')).toBe('qurasearch-export-2026-06-09.md')
    expect(exportMime('txt')).toBe('text/plain')
    expect(exportMime('md')).toBe('text/markdown')
    expect(exportMime('html')).toBe('text/html')
    expect(exportMime('csv')).toBe('text/csv')
  })

  it('formatExport dispatches by format', () => {
    expect(formatExport(one, { format: 'csv', linkStyle: 'none' })).toContain('text,url,title')
    expect(formatExport(one, { format: 'md', linkStyle: 'inline' })).toContain('](https://e.com/a)')
  })
})
