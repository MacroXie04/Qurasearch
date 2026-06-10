// Pure DOM-matching logic for jump-to-highlight. No chrome.* and no side
// effects — everything here is unit-testable under jsdom. The injected entry
// (highlight.entry.ts) drives these functions on the live page.
import type { JumpPayload } from '../types'

export type MatchResult =
  | { kind: 'range'; tier: 1 | 2 | 3; range: Range }
  | { kind: 'element'; element: Element }
  | { kind: 'miss' }

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA'])
const MAX_OCCURRENCES = 50
const MAX_PREFIX_OCCURRENCES = 20
const MAX_FUZZY_TOKENS = 50
const FUZZY_FLOOR = 0.4
const SELECTOR_BONUS = 1000
/** Tier 2 needs meaningful context on both sides to bracket changed text. */
const MIN_CONTEXT = 16

export function normalize(s: string): string {
  return s.replace(/[\s\u00A0]+/g, ' ')
}

export interface TextIndex {
  /** Whitespace-normalized concatenation of all visible text nodes. */
  norm: string
  /** map[i] = offset into the RAW concatenation of the char at norm[i]. */
  map: number[]
  /** Text nodes in document order with their raw-concatenation offsets. */
  nodes: Array<{ node: Text; rawStart: number }>
}

/**
 * Concatenate every visible text node under `root` and build a
 * normalized→raw offset map, so matches found in normalized space can be
 * converted back into precise DOM Ranges.
 */
/** Cheap "not rendered" test that also works under jsdom (no layout engine). */
function isHidden(el: Element): boolean {
  const h = el as HTMLElement
  if (h.hidden) return true
  if (h.style && (h.style.display === 'none' || h.style.visibility === 'hidden')) return true
  // checkVisibility (Chrome 105+) catches stylesheet display:none / content-visibility;
  // absent under jsdom, where the inline checks above are the best we can do.
  if (typeof h.checkVisibility === 'function' && !h.checkVisibility()) return true
  return false
}

export function buildTextIndex(root: Node): TextIndex {
  const doc = root.nodeType === Node.DOCUMENT_NODE ? (root as Document) : root.ownerDocument!
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        // REJECT prunes the whole subtree; SKIP still descends into children.
        const el = n as Element
        return SKIP_TAGS.has(el.tagName) || isHidden(el)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_SKIP
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })

  const nodes: Array<{ node: Text; rawStart: number }> = []
  let raw = ''
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push({ node: n as Text, rawStart: raw.length })
    raw += (n as Text).data
  }

  // Collapse whitespace runs to single spaces, recording for every emitted
  // char the raw offset of its first source char.
  const map: number[] = []
  let norm = ''
  const isWs = (c: string) => /[\s\u00A0]/.test(c)
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (isWs(c)) {
      if (norm.length === 0 || norm[norm.length - 1] === ' ') continue
      norm += ' '
      map.push(i)
    } else {
      norm += c
      map.push(i)
    }
  }
  return { norm, map, nodes }
}

/** All occurrences of `needle` in `haystack`, capped. */
export function findOccurrences(haystack: string, needle: string, cap = MAX_OCCURRENCES): number[] {
  const out: number[] = []
  if (!needle) return out
  let from = 0
  while (out.length < cap) {
    const i = haystack.indexOf(needle, from)
    if (i < 0) break
    out.push(i)
    from = i + 1
  }
  return out
}

/** Convert a [normStart, normEnd) span in the index back into a DOM Range. */
export function rangeFromIndex(index: TextIndex, normStart: number, normEnd: number): Range | null {
  if (normStart < 0 || normEnd <= normStart || normEnd > index.map.length) return null
  const rawStart = index.map[normStart]
  const rawEnd = index.map[normEnd - 1] + 1
  const a = nodeAt(index.nodes, rawStart)
  const b = nodeAt(index.nodes, rawEnd - 1)
  if (!a || !b) return null
  const range = a.node.ownerDocument!.createRange()
  range.setStart(a.node, rawStart - a.rawStart)
  range.setEnd(b.node, rawEnd - b.rawStart)
  return range
}

function nodeAt(
  nodes: TextIndex['nodes'],
  rawOffset: number,
): { node: Text; rawStart: number } | null {
  let lo = 0
  let hi = nodes.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const e = nodes[mid]
    if (rawOffset < e.rawStart) hi = mid - 1
    else if (rawOffset >= e.rawStart + e.node.data.length) lo = mid + 1
    else return e
  }
  return null
}

/** Raw-offset span [start, end) of the text inside `el`, in index space. */
function elementSpan(index: TextIndex, el: Element): { start: number; end: number } | null {
  let start = -1
  let end = -1
  for (const e of index.nodes) {
    if (el.contains(e.node)) {
      if (start < 0) start = e.rawStart
      end = e.rawStart + e.node.data.length
    }
  }
  return start < 0 ? null : { start, end }
}

/** Length of the longest common suffix of `a` and `b` (for prefix-context scoring). */
function commonSuffixLen(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++
  return n
}

/** Length of the longest common prefix of `a` and `b` (for suffix-context scoring). */
function commonPrefixLen(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n++
  return n
}

function resolveSelector(doc: Document, selector: string | undefined): Element | null {
  if (!selector) return null
  try {
    return doc.querySelector(selector)
  } catch {
    return null
  }
}

/**
 * Find the clip described by `payload` in `doc`.
 *
 * Tier 1 — exact normalized text; duplicates disambiguated by stored
 *          prefix/suffix context and by containment in the stored selector.
 * Tier 2 — the text changed: bracket the original slot between the stored
 *          prefix and suffix and highlight whatever is there now.
 * Tier 3 — descend the stored CSS selector and fuzzy-match inside it
 *          (largest window of consecutive tokens, floor 40%); if no text
 *          survives, return the element itself.
 */
export function findMatch(doc: Document, payload: JumpPayload): MatchResult {
  const root = doc.body ?? doc.documentElement
  if (!root) return { kind: 'miss' }
  const locator = payload.locator
  const needle = normalize(locator?.exact ?? payload.text).trim()
  if (!needle) return { kind: 'miss' }

  const index = buildTextIndex(root)
  const selectorEl = resolveSelector(doc, locator?.selector)

  // ---- Tier 1: exact text -------------------------------------------------
  const occurrences = findOccurrences(index.norm, needle)
  if (occurrences.length === 1 || (occurrences.length > 1 && !locator)) {
    const range = rangeFromIndex(index, occurrences[0], occurrences[0] + needle.length)
    if (range) return { kind: 'range', tier: 1, range }
  } else if (occurrences.length > 1 && locator) {
    const normPrefix = normalize(locator.prefix)
    const normSuffix = normalize(locator.suffix)
    // The needle is trimmed, but the stored context was captured adjacent to
    // the UNTRIMMED selection. If exact had leading/trailing whitespace (common
    // for double/triple-click selections), the page char dropped by trim sits
    // between the needle and the stored context — account for that one space so
    // the context comparison lines up on the correct occurrence.
    const normExact = normalize(locator.exact ?? '')
    const leadGap = /^\s/.test(normExact) ? 1 : 0
    const trailGap = /\s$/.test(normExact) ? 1 : 0
    const selSpan = selectorEl ? elementSpan(index, selectorEl) : null
    let best = occurrences[0]
    let bestScore = -1
    for (const occ of occurrences) {
      let score = 0
      if (normPrefix)
        score += commonSuffixLen(index.norm.slice(0, Math.max(0, occ - leadGap)), normPrefix)
      if (normSuffix)
        score += commonPrefixLen(index.norm.slice(occ + needle.length + trailGap), normSuffix)
      if (selSpan) {
        const rawA = index.map[occ]
        const rawB = index.map[occ + needle.length - 1] + 1
        if (rawA < selSpan.end && rawB > selSpan.start) score += SELECTOR_BONUS
      }
      if (score > bestScore) {
        bestScore = score
        best = occ
      }
    }
    const range = rangeFromIndex(index, best, best + needle.length)
    if (range) return { kind: 'range', tier: 1, range }
  }

  // ---- Tier 2: context bracket (text changed in place) --------------------
  if (locator) {
    const normPrefix = normalize(locator.prefix).trim()
    const normSuffix = normalize(locator.suffix).trim()
    if (normPrefix.length >= MIN_CONTEXT && normSuffix.length >= MIN_CONTEXT) {
      const maxGap = Math.max(needle.length * 3, needle.length + 200)
      let best: { start: number; end: number } | null = null
      let bestDelta = Infinity
      for (const p of findOccurrences(index.norm, normPrefix, MAX_PREFIX_OCCURRENCES)) {
        const afterPrefix = p + normPrefix.length
        const s = index.norm.indexOf(normSuffix, afterPrefix)
        if (s < 0) continue
        const gap = s - afterPrefix
        if (gap < 1 || gap > maxGap) continue
        const delta = Math.abs(gap - needle.length)
        if (delta < bestDelta) {
          bestDelta = delta
          best = { start: afterPrefix, end: s }
        }
      }
      if (best) {
        const range = rangeFromIndex(index, best.start, best.end)
        if (range) return { kind: 'range', tier: 2, range }
      }
    }
  }

  // ---- Tier 3: selector descent -------------------------------------------
  if (selectorEl) {
    const scoped = buildTextIndex(selectorEl)
    // 3a: exact within the element, else largest token window.
    const exactIn = scoped.norm.indexOf(needle)
    if (exactIn >= 0) {
      const range = rangeFromIndex(scoped, exactIn, exactIn + needle.length)
      if (range) return { kind: 'range', tier: 3, range }
    }
    const tokens = needle.split(' ').filter(Boolean).slice(0, MAX_FUZZY_TOKENS)
    const floor = Math.max(1, Math.ceil(tokens.length * FUZZY_FLOOR))
    for (let k = tokens.length; k >= floor; k--) {
      for (let i = 0; i + k <= tokens.length; i++) {
        const window = tokens.slice(i, i + k).join(' ')
        const hit = scoped.norm.indexOf(window)
        if (hit >= 0) {
          const range = rangeFromIndex(scoped, hit, hit + window.length)
          if (range) return { kind: 'range', tier: 3, range }
        }
      }
    }
    // 3b: the element still exists but none of the text survived.
    return { kind: 'element', element: selectorEl }
  }

  return { kind: 'miss' }
}
