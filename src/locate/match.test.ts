// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { buildTextIndex, findMatch, normalize, rangeFromIndex } from './match'
import type { Locator } from './locator'

function setBody(html: string) {
  document.body.innerHTML = html
}

afterEach(() => {
  document.body.innerHTML = ''
})

const loc = (over: Partial<Locator> = {}): Locator => ({
  v: 1,
  exact: '',
  prefix: '',
  suffix: '',
  selector: '',
  ...over,
})

describe('buildTextIndex / rangeFromIndex', () => {
  it('collapses whitespace and maps back to raw DOM offsets', () => {
    setBody('<p>hello \n\t  world</p>')
    const index = buildTextIndex(document.body)
    expect(index.norm).toBe('hello world')
    const range = rangeFromIndex(index, 6, 11)!
    expect(range.toString()).toBe('world')
  })

  it('spans element boundaries', () => {
    setBody('<p>one <b>two</b> three</p>')
    const index = buildTextIndex(document.body)
    const i = index.norm.indexOf('two three')
    const range = rangeFromIndex(index, i, i + 'two three'.length)!
    expect(range.toString()).toBe('two three')
    expect(range.startContainer.parentElement?.tagName).toBe('B')
  })

  it('skips script/style/noscript/template/textarea content', () => {
    setBody('<p>visible</p><script>hidden()</script><style>.x{}</style><textarea>typed</textarea>')
    const index = buildTextIndex(document.body)
    expect(index.norm).not.toContain('hidden')
    expect(index.norm).not.toContain('.x')
    expect(index.norm).not.toContain('typed')
    expect(index.norm).toContain('visible')
  })

  it('skips display:none / hidden text', () => {
    setBody(
      '<p>shown text</p><div style="display:none">hidden copy</div><div hidden>also hidden</div>',
    )
    const index = buildTextIndex(document.body)
    expect(index.norm).toContain('shown text')
    expect(index.norm).not.toContain('hidden copy')
    expect(index.norm).not.toContain('also hidden')
  })
})

describe('findMatch tier 1 (exact text)', () => {
  it('finds a unique occurrence without a locator (legacy clips)', () => {
    setBody('<p>alpha</p><p>the needle text</p><p>omega</p>')
    const res = findMatch(document, { text: 'the needle text' })
    expect(res.kind).toBe('range')
    if (res.kind === 'range') {
      expect(res.tier).toBe(1)
      expect(res.range.toString()).toBe('the needle text')
    }
  })

  it('matches even when the DOM splits the text across inline tags', () => {
    setBody('<p>the <em>needle</em> text</p>')
    const res = findMatch(document, { text: 'the needle text' })
    expect(res.kind).toBe('range')
  })

  it('disambiguates duplicates via prefix/suffix context', () => {
    setBody(
      '<p>intro words here. duplicate phrase. unrelated tail.</p>' +
        '<p>specific lead-in before it. duplicate phrase. specific follow-up after.</p>',
    )
    const res = findMatch(document, {
      text: 'duplicate phrase.',
      locator: loc({
        exact: 'duplicate phrase.',
        prefix: 'specific lead-in before it. ',
        suffix: ' specific follow-up after.',
      }),
    })
    expect(res.kind).toBe('range')
    if (res.kind === 'range') {
      const p = res.range.startContainer.parentElement
      expect(p?.textContent).toContain('specific lead-in')
    }
  })

  it('disambiguates duplicates via the stored selector', () => {
    setBody('<div id="a"><p>same words</p></div><div id="b"><p>same words</p></div>')
    const res = findMatch(document, {
      text: 'same words',
      locator: loc({ exact: 'same words', selector: '#b > p:nth-of-type(1)' }),
    })
    expect(res.kind).toBe('range')
    if (res.kind === 'range') {
      expect(document.getElementById('b')!.contains(res.range.startContainer)).toBe(true)
    }
  })

  it('takes the first occurrence for duplicate text without a locator', () => {
    setBody('<p id="first">same words</p><p>same words</p>')
    const res = findMatch(document, { text: 'same words' })
    expect(res.kind).toBe('range')
    if (res.kind === 'range') {
      expect(document.getElementById('first')!.contains(res.range.startContainer)).toBe(true)
    }
  })

  it('disambiguates correctly when exact had trailing whitespace (double-click selection)', () => {
    // Both paragraphs share the lead-in; only the tail differs. The selection
    // captured a trailing space (Chrome does this for word/paragraph selects).
    setBody(
      '<p>identical lead-in context here. duplicate phrase first-tail ends.</p>' +
        '<p>identical lead-in context here. duplicate phrase second-tail ends.</p>',
    )
    const res = findMatch(document, {
      text: 'duplicate phrase',
      locator: loc({
        exact: 'duplicate phrase ', // trailing space from the selection
        prefix: 'identical lead-in context here. ',
        suffix: 'second-tail ends.',
      }),
    })
    expect(res.kind).toBe('range')
    if (res.kind === 'range') {
      expect(res.range.startContainer.parentElement?.textContent).toContain('second-tail')
    }
  })
})

describe('findMatch tier 2 (context bracket)', () => {
  it('highlights the changed text occupying the original slot', () => {
    setBody('<p>stable prefix context here REWRITTEN WORDS NOW stable suffix context here</p>')
    const res = findMatch(document, {
      text: 'the original sentence',
      locator: loc({
        exact: 'the original sentence',
        prefix: 'stable prefix context here ',
        suffix: ' stable suffix context here',
      }),
    })
    expect(res.kind).toBe('range')
    if (res.kind === 'range') {
      expect(res.tier).toBe(2)
      expect(res.range.toString().trim()).toBe('REWRITTEN WORDS NOW')
    }
  })

  it('skips tier 2 when context is too short, falling through to selector', () => {
    setBody('<p id="target">totally different content now</p>')
    const res = findMatch(document, {
      text: 'the original sentence',
      locator: loc({ exact: 'the original sentence', prefix: 'ab ', suffix: ' cd', selector: '#target' }),
    })
    // tier 2 requires >=16 chars of context on both sides → tier 3 element
    expect(res.kind).toBe('element')
  })

  it('respects the max gap (wildly larger replacement does not bracket)', () => {
    const filler = 'filler words and more filler. '.repeat(40)
    setBody(`<p>stable prefix context here ${filler} stable suffix context here</p>`)
    const res = findMatch(document, {
      text: 'tiny',
      locator: loc({
        exact: 'tiny',
        prefix: 'stable prefix context here ',
        suffix: ' stable suffix context here',
      }),
    })
    expect(res.kind).toBe('miss')
  })
})

describe('findMatch tier 3 (selector descent)', () => {
  it('fuzzy-matches the largest surviving token window inside the element', () => {
    setBody(
      '<div id="box"><p>some of the original important words still remain in this spot</p></div>',
    )
    const res = findMatch(document, {
      text: 'all of the original important words were here',
      locator: loc({
        exact: 'all of the original important words were here',
        selector: '#box',
      }),
    })
    expect(res.kind).toBe('range')
    if (res.kind === 'range') {
      expect(res.tier).toBe(3)
      expect(res.range.toString()).toContain('the original important words')
    }
  })

  it('returns the element itself when no token window survives (tier 3b)', () => {
    setBody('<div id="box"><p>completely unrelated replacement copy</p></div>')
    const res = findMatch(document, {
      text: 'the original sentence that vanished entirely from here',
      locator: loc({ exact: 'the original sentence that vanished entirely from here', selector: '#box' }),
    })
    expect(res.kind).toBe('element')
    if (res.kind === 'element') expect(res.element.id).toBe('box')
  })

  it('handles an invalid stored selector gracefully', () => {
    setBody('<p>nothing relevant</p>')
    const res = findMatch(document, {
      text: 'gone text',
      locator: loc({ exact: 'gone text', selector: '!!!not-a-selector' }),
    })
    expect(res.kind).toBe('miss')
  })
})

describe('findMatch misses', () => {
  it('misses when nothing matches and there is no locator', () => {
    setBody('<p>unrelated page</p>')
    expect(findMatch(document, { text: 'absent text' }).kind).toBe('miss')
  })

  it('misses on an empty needle', () => {
    setBody('<p>page</p>')
    expect(findMatch(document, { text: '   ' }).kind).toBe('miss')
  })
})

describe('normalize', () => {
  it('collapses all whitespace runs including NBSP', () => {
    expect(normalize('a  b\n\tc')).toBe('a b c')
  })
})
