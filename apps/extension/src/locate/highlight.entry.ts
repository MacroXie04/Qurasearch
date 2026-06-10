// Injected into the opened page (all frames) by the background service worker
// after a jump navigation completes. Bundled standalone via the crxjs
// `?script&iife` import in background.ts — it asks the background for its
// payload (executeScript({files}) cannot pass args), finds the clip with the
// tiered matcher, then scrolls to it and highlights it.
import type { JumpPayload } from '../types'
import { findMatch } from './match'

const HIGHLIGHT_NAME = 'qurasearch'
const STYLE_ID = '__qurasearch-style'
const TOAST_ID = '__qurasearch-toast'
const DEADLINE_MS = 8000
const RETRY_THROTTLE_MS = 500
const ELEMENT_PULSE_MS = 3000
const TOAST_MS = 4000

interface JumpController {
  cancel(): void
}

const win = window as Window & { __quraJump?: JumpController }

async function main(): Promise<void> {
  // Re-injection (user clicked "Open source" again for the same tab): cancel
  // the previous run's timers/observer/highlight before starting over.
  win.__quraJump?.cancel()

  let payload: JumpPayload | null = null
  try {
    payload = (await chrome.runtime.sendMessage({ type: 'qura:get-jump' })) as JumpPayload | null
  } catch {
    return
  }
  if (!payload || typeof payload.text !== 'string') return

  // Frame gating: a clip captured in a subframe is searched in that frame
  // (exact href, else same-origin frames). The top frame ALWAYS participates —
  // even for a subframe clip — as the backstop reporter, so a vanished
  // cross-origin subframe still yields a miss toast + cleanup instead of an
  // entry that lingers for the full TTL.
  const frameUrl = payload.locator?.frameUrl
  const isTop = window === window.top
  const isExactFrame = frameUrl != null && location.href === frameUrl
  if (frameUrl) {
    if (!isExactFrame && !sameOrigin(frameUrl) && !isTop) return
  } else if (!isTop) {
    return
  }
  const mayToast = isTop || isExactFrame

  let finished = false
  let lastAttempt = 0
  let retryTimer: number | undefined
  // eslint-disable-next-line prefer-const -- cleanup can run before observer initialization.
  let observer: MutationObserver | undefined
  let bestElement: Element | null = null
  let clearHighlight: (() => void) | undefined

  const cleanup = () => {
    observer?.disconnect()
    if (retryTimer !== undefined) clearTimeout(retryTimer)
    clearTimeout(deadlineTimer)
  }
  win.__quraJump = {
    cancel() {
      finished = true
      cleanup()
      clearHighlight?.()
    },
  }

  const finish = (ok: boolean) => {
    if (finished) return
    finished = true
    cleanup()
    chrome.runtime.sendMessage({ type: 'qura:jump-result', ok }).catch(() => {})
  }

  const p = payload
  const attempt = () => {
    if (finished) return
    lastAttempt = Date.now()
    let result
    try {
      result = findMatch(document, p)
    } catch {
      return
    }
    if (result.kind === 'range') {
      clearHighlight = highlightRange(result.range)
      finish(true)
    } else if (result.kind === 'element') {
      // Remember it, but keep retrying for a text match until the deadline —
      // lazy-loaded content may still bring the real text in.
      bestElement = result.element
    }
  }

  const deadlineTimer = window.setTimeout(() => {
    void onDeadline()
  }, DEADLINE_MS)

  async function onDeadline(): Promise<void> {
    if (finished) return
    if (bestElement && bestElement.isConnected) {
      clearHighlight = highlightElement(bestElement)
      finish(true)
      return
    }
    // Before announcing "not found", confirm the jump is still pending. If a
    // sibling frame (same-origin iframe capture) already found and highlighted
    // it, the background has dropped the entry — suppress a contradictory toast.
    if (mayToast) {
      let stillPending = true
      try {
        stillPending = (await chrome.runtime.sendMessage({ type: 'qura:get-jump' })) != null
      } catch {
        stillPending = false
      }
      if (!finished && stillPending) showToast('Qurasearch: saved text was not found on this page')
    }
    finish(false)
  }

  attempt()
  if (finished) return

  // Retry when the page mutates (SPA routing, lazy content), throttled.
  observer = new MutationObserver(() => {
    if (finished) return
    const wait = RETRY_THROTTLE_MS - (Date.now() - lastAttempt)
    if (wait <= 0) {
      attempt()
    } else if (retryTimer === undefined) {
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined
        attempt()
      }, wait)
    }
  })
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  })
}

function sameOrigin(url: string): boolean {
  try {
    return new URL(url).origin === location.origin
  } catch {
    return false
  }
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
::highlight(${HIGHLIGHT_NAME}) {
  background-color: rgba(255, 213, 0, 0.45);
  color: inherit;
}
@keyframes __qurasearch-pulse {
  0%, 100% { outline-color: rgba(255, 196, 0, 0.95); }
  50% { outline-color: rgba(255, 196, 0, 0.15); }
}
.__qurasearch-outline {
  outline: 3px solid rgba(255, 196, 0, 0.95) !important;
  outline-offset: 2px !important;
  animation: __qurasearch-pulse 0.75s ease-in-out 2;
}
#${TOAST_ID} {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 2147483647;
  background: rgba(32, 26, 25, 0.95);
  color: #fff;
  font: 13px/1.4 system-ui, sans-serif;
  padding: 10px 16px;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  pointer-events: none;
}`
  ;(document.head ?? document.documentElement).appendChild(style)
}

/** Scroll to and highlight a text range. Returns the cleanup function. */
function highlightRange(range: Range): () => void {
  ensureStyle()
  const scrollTarget =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as Element)
      : range.startContainer.parentElement
  scrollTarget?.scrollIntoView({ behavior: 'smooth', block: 'center' })

  let clear: () => void
  if (typeof Highlight === 'function' && 'highlights' in CSS) {
    CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(range))
    clear = () => CSS.highlights.delete(HIGHLIGHT_NAME)
  } else {
    // Older engines: outline the nearest containing element instead.
    const container = range.commonAncestorContainer
    const el =
      container.nodeType === Node.ELEMENT_NODE
        ? (container as Element)
        : (container.parentElement ?? document.body)
    clear = pulseOutline(el)
  }
  // Like find-in-page: the next interaction dismisses the highlight.
  const onPointerDown = () => clear()
  document.addEventListener('pointerdown', onPointerDown, { once: true, capture: true })
  return () => {
    document.removeEventListener('pointerdown', onPointerDown, { capture: true })
    clear()
  }
}

/** Tier 3b: the text is gone — scroll to and pulse the containing element. */
function highlightElement(el: Element): () => void {
  ensureStyle()
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  return pulseOutline(el)
}

function pulseOutline(el: Element): () => void {
  el.classList.add('__qurasearch-outline')
  const timer = window.setTimeout(
    () => el.classList.remove('__qurasearch-outline'),
    ELEMENT_PULSE_MS,
  )
  return () => {
    clearTimeout(timer)
    el.classList.remove('__qurasearch-outline')
  }
}

function showToast(message: string): void {
  ensureStyle()
  document.getElementById(TOAST_ID)?.remove()
  const toast = document.createElement('div')
  toast.id = TOAST_ID
  toast.textContent = message
  ;(document.body ?? document.documentElement).appendChild(toast)
  window.setTimeout(() => toast.remove(), TOAST_MS)
}

void main()
