import { describe, expect, it } from 'vitest'

import { isLongText, prettyHost, relativeTime } from './util'

describe('relativeTime', () => {
  it('reports "just now" for a fresh timestamp', () => {
    expect(relativeTime(Date.now())).toBe('just now')
  })
  it('reports minutes with pluralization', () => {
    expect(relativeTime(Date.now() - 5 * 60 * 1000)).toBe('5 mins ago')
  })
  it('uses singular for one hour', () => {
    expect(relativeTime(Date.now() - 60 * 60 * 1000)).toBe('1 hour ago')
  })
})

describe('prettyHost', () => {
  it('strips a leading www.', () => {
    expect(prettyHost('www.example.com')).toBe('example.com')
  })
  it('passes other hosts through', () => {
    expect(prettyHost('docs.rust-lang.org')).toBe('docs.rust-lang.org')
  })
})

describe('isLongText', () => {
  it('is long when over 180 chars', () => {
    expect(isLongText('a'.repeat(200))).toBe(true)
  })
  it('is long when over 4 lines', () => {
    expect(isLongText('a\nb\nc\nd\ne')).toBe(true)
  })
  it('is short otherwise', () => {
    expect(isLongText('hello world')).toBe(false)
  })
})
