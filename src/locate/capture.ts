// collectLocator runs INSIDE the captured page via
// chrome.scripting.executeScript({ func: collectLocator }). executeScript
// serializes the function with toString(), so it must be fully self-contained:
// every helper is a nested declaration and nothing references module scope.
// (capture.test.ts enforces this by rehydrating the function from its source.)

/**
 * Read the current selection and describe where it lives, so the clip can be
 * found again later even if the page text changes. Returns a Locator-shaped
 * plain object, or null when there is no usable selection. Must never throw —
 * the caller treats any failure as "capture without locator".
 */
export function collectLocator(): unknown {
  const LIMIT_EXACT = 8000
  const CONTEXT_LEN = 64
  const MAX_BLOCK_CLIMBS = 4

  function norm(s: string): string {
    return s.replace(/[\s\u00A0]+/g, ' ')
  }

  /** Nearest block-ish ancestor — the boundary for prefix/suffix context. */
  function blockAncestor(start: Node): Element {
    let el = start.nodeType === Node.ELEMENT_NODE ? (start as Element) : start.parentElement
    while (el && el !== document.body) {
      const d = getComputedStyle(el).display
      if (d === 'block' || d === 'list-item' || d === 'table-cell' || d === 'flex' || d === 'grid') {
        return el
      }
      el = el.parentElement
    }
    return document.body
  }

  /**
   * CSS path from body (or the nearest unique #id ancestor) down to `el`.
   * The id regex keeps only selector-safe ids, so no escaping is needed.
   */
  function cssPath(el: Element): string {
    const parts: string[] = []
    let node: Element | null = el
    while (node) {
      if (node === document.body) {
        parts.push('body')
        break
      }
      const id = node.id
      if (id && /^[A-Za-z][\w-]*$/.test(id) && document.querySelectorAll('#' + id).length === 1) {
        parts.push('#' + id)
        break
      }
      let k = 1
      let sib = node.previousElementSibling
      while (sib) {
        if (sib.tagName === node.tagName) k++
        sib = sib.previousElementSibling
      }
      parts.push(node.tagName.toLowerCase() + ':nth-of-type(' + k + ')')
      node = node.parentElement
    }
    return parts.reverse().join(' > ')
  }

  /**
   * Normalized text adjacent to the range, up to CONTEXT_LEN chars. Starts at
   * the nearest block boundary; climbs to wider blocks while too short (a
   * selection at the very start of a paragraph still gets context from the
   * section above it).
   */
  function context(range: Range, side: 'before' | 'after'): string {
    const edgeNode = side === 'before' ? range.startContainer : range.endContainer
    let block: Element = blockAncestor(edgeNode)
    let best = ''
    for (let climb = 0; climb < MAX_BLOCK_CLIMBS; climb++) {
      const r = range.cloneRange()
      if (side === 'before') {
        r.collapse(true)
        r.setStart(block, 0)
      } else {
        r.collapse(false)
        r.setEnd(block, block.childNodes.length)
      }
      const t = norm(r.toString())
      const out = side === 'before' ? t.slice(-CONTEXT_LEN) : t.slice(0, CONTEXT_LEN)
      // Keep the widest context seen — climbing can only add surrounding text.
      if (out.trim().length > best.trim().length) best = out
      if (best.trim().length >= CONTEXT_LEN / 2 || block === document.body) return best
      block = block.parentElement ? blockAncestor(block.parentElement) : document.body
    }
    // Exhausted the climb budget short of body: return the best partial context
    // rather than discarding it (would otherwise disable tier-2 recovery).
    return best
  }

  try {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
    const range = sel.getRangeAt(0)
    const exact = range.toString().slice(0, LIMIT_EXACT)
    if (!exact.trim()) return null

    const container = range.commonAncestorContainer
    const anchorEl =
      container.nodeType === Node.ELEMENT_NODE
        ? (container as Element)
        : (container.parentElement ?? document.body)

    const out: Record<string, unknown> = {
      v: 1,
      exact,
      prefix: context(range, 'before'),
      suffix: context(range, 'after'),
      selector: cssPath(anchorEl),
    }
    if (window !== window.top) out.frameUrl = location.href
    return out
  } catch {
    return null
  }
}
