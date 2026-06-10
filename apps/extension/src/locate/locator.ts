// The Locator is the DOM context captured alongside a clip so the clip can be
// found again on the live page later — even after the page text has changed.
// It is stored on Item.locator and travels through backups, so it must be
// sanitized field-by-field on import (same prototype-pollution defense as the
// rest of the backup pipeline).

export interface Locator {
  v: 1
  /**
   * Exact selected text from Range.toString() — real DOM whitespace, unlike
   * info.selectionText which Chrome whitespace-collapses.
   */
  exact: string
  /** Whitespace-normalized text immediately BEFORE the selection (disambiguates duplicates). */
  prefix: string
  /** Whitespace-normalized text immediately AFTER the selection. */
  suffix: string
  /**
   * CSS path to the deepest element containing the whole selection:
   * an `#id` anchor when a unique-id ancestor exists, else a
   * `tag:nth-of-type(...)` chain from body.
   */
  selector: string
  /** Set only when the selection lived in a subframe: that frame's href. */
  frameUrl?: string
}

export const LOCATOR_LIMITS = {
  exact: 8000,
  context: 200,
  selector: 1000,
  frameUrl: 2000,
} as const

/**
 * Rebuild a Locator field-by-field from untrusted input (executeScript results,
 * imported backups). Returns undefined when the shape is unusable; oversized
 * fields invalidate rather than truncate (a clipped selector is useless).
 */
export function sanitizeLocator(raw: unknown): Locator | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  if (o.v !== 1) return undefined
  if (typeof o.exact !== 'string' || !o.exact.trim()) return undefined
  if (typeof o.prefix !== 'string' || typeof o.suffix !== 'string') return undefined
  if (typeof o.selector !== 'string') return undefined
  if (o.frameUrl !== undefined && typeof o.frameUrl !== 'string') return undefined
  if (
    o.exact.length > LOCATOR_LIMITS.exact ||
    o.prefix.length > LOCATOR_LIMITS.context ||
    o.suffix.length > LOCATOR_LIMITS.context ||
    o.selector.length > LOCATOR_LIMITS.selector ||
    (o.frameUrl?.length ?? 0) > LOCATOR_LIMITS.frameUrl
  ) {
    return undefined
  }
  return {
    v: 1,
    exact: o.exact,
    prefix: o.prefix,
    suffix: o.suffix,
    selector: o.selector,
    ...(o.frameUrl ? { frameUrl: o.frameUrl } : {}),
  }
}
