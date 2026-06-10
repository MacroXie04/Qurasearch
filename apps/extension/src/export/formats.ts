// Pure formatters for the export page. No chrome.* and no DOM access — every
// function maps (sections, options) → string and is unit-tested directly.
//
// Security notes:
//  - HTML output escapes ALL interpolated text and only emits <a href> for
//    http(s) URLs (attribute-escaped), so a malicious clip can't inject markup.
//  - CSV output quotes per RFC 4180 and defuses spreadsheet formula injection
//    by prefixing dangerous leading chars with a single quote.

export interface ExportClip {
  text: string
  url: string
  title: string
  host: string
  createdAt: number
}

export interface ExportSection {
  groupName: string
  clips: ExportClip[]
}

export type ExportFormat = 'txt' | 'md' | 'html' | 'csv'
/**
 * How source links appear:
 *  - none:   text only
 *  - after:  the URL on its own line after each clip (txt, md)
 *  - inline: the clip text becomes a markdown link label (md)
 *  - links:  the clip text becomes a clickable <a> (html)
 */
export type LinkStyle = 'none' | 'after' | 'inline' | 'links'

export interface ExportOptions {
  format: ExportFormat
  linkStyle: LinkStyle
}

/** Link styles each format supports (first entry = default). */
export const LINK_STYLES: Record<ExportFormat, LinkStyle[]> = {
  txt: ['after', 'none'],
  md: ['inline', 'after', 'none'],
  html: ['links', 'none'],
  csv: ['none'],
}

export function exportFilename(format: ExportFormat, stamp: string): string {
  return `qurasearch-export-${stamp}.${format}`
}

export function exportMime(format: ExportFormat): string {
  switch (format) {
    case 'md':
      return 'text/markdown'
    case 'html':
      return 'text/html'
    case 'csv':
      return 'text/csv'
    default:
      return 'text/plain'
  }
}

/**
 * Only http(s) URLs are emitted as links anywhere. Returns the NORMALIZED
 * `u.href`, which percent-encodes `<` `>` `"` and spaces — without that, a
 * `>` in a stored URL would terminate a markdown `<autolink>` early and let
 * the remainder render as raw HTML.
 */
export function safeHref(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

export function formatExport(sections: ExportSection[], opts: ExportOptions): string {
  switch (opts.format) {
    case 'txt':
      return formatTxt(sections, opts.linkStyle)
    case 'md':
      return formatMd(sections, opts.linkStyle)
    case 'html':
      return formatHtml(sections, opts.linkStyle)
    case 'csv':
      return formatCsv(sections)
  }
}

// ---------------------------------------------------------------------------
// Plain text
// ---------------------------------------------------------------------------

export function formatTxt(sections: ExportSection[], linkStyle: LinkStyle): string {
  const showHeadings = sections.length > 1
  const parts: string[] = []
  for (const section of sections) {
    const body = section.clips
      .map((clip) => {
        const href = linkStyle === 'after' ? safeHref(clip.url) : null
        return href ? `${clip.text}\n${href}` : clip.text
      })
      .join('\n\n')
    parts.push(showHeadings ? `== ${section.groupName} ==\n\n${body}` : body)
  }
  return parts.join('\n\n') + (parts.length ? '\n' : '')
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

/** Escape a string used as a markdown link label (kept on one line). Also
    neutralizes raw-HTML tags, which CommonMark passes through inside link text. */
function mdLabel(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/([\\[\]])/g, '\\$1')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Percent-encode parens so the URL can't break out of `[...](...)`. */
function mdUrl(url: string): string {
  return url.replace(/\(/g, '%28').replace(/\)/g, '%29')
}

export function formatMd(sections: ExportSection[], linkStyle: LinkStyle): string {
  const showHeadings = sections.length > 1
  const parts: string[] = []
  for (const section of sections) {
    const body = section.clips
      .map((clip) => {
        const href = safeHref(clip.url)
        if (linkStyle === 'inline' && href) return `[${mdLabel(clip.text)}](${mdUrl(href)})`
        if (linkStyle === 'after' && href) return `${clip.text}\n\n<${mdUrl(href)}>`
        return clip.text
      })
      .join('\n\n')
    parts.push(showHeadings ? `## ${section.groupName}\n\n${body}` : body)
  }
  return parts.join('\n\n') + (parts.length ? '\n' : '')
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function formatHtml(sections: ExportSection[], linkStyle: LinkStyle): string {
  const showHeadings = sections.length > 1
  const blocks: string[] = []
  for (const section of sections) {
    if (showHeadings) blocks.push(`<h2>${escapeHtml(section.groupName)}</h2>`)
    for (const clip of section.clips) {
      const href = linkStyle === 'links' ? safeHref(clip.url) : null
      const text = escapeHtml(clip.text)
      const body = href ? `<a href="${escapeHtml(href)}">${text}</a>` : text
      blocks.push(`<blockquote class="clip">${body}</blockquote>`)
    }
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Qurasearch export</title>
<style>
body { font: 16px/1.6 system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; color: #1c1b1f; }
h2 { margin: 1.6em 0 0.4em; font-size: 1.15rem; }
.clip { margin: 0 0 1rem; padding: 0.6rem 1rem; border-left: 3px solid #6750a4; background: #f7f4fb; white-space: pre-wrap; overflow-wrap: break-word; }
.clip a { color: inherit; }
</style>
</head>
<body>
${blocks.join('\n')}
</body>
</html>
`
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Quote per RFC 4180 and defuse leading formula chars (OWASP CSV injection). */
export function csvField(value: string): string {
  let v = value
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v
  if (/[",\n\r]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"'
  return v
}

/** ISO timestamp, guarded against the RangeError Date throws past ±8.64e15 ms
    (a corrupt/hand-edited imported backup could carry such a value). */
function isoOrEmpty(ms: number): string {
  if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) return ''
  return new Date(ms).toISOString()
}

export function formatCsv(sections: ExportSection[]): string {
  const rows = ['text,url,title,host,group,createdAt']
  for (const section of sections) {
    for (const clip of section.clips) {
      rows.push(
        [
          csvField(clip.text),
          csvField(clip.url),
          csvField(clip.title),
          csvField(clip.host),
          csvField(section.groupName),
          isoOrEmpty(clip.createdAt),
        ].join(','),
      )
    }
  }
  // BOM so Excel detects UTF-8; CRLF row endings per RFC 4180.
  return '\uFEFF' + rows.join('\r\n') + '\r\n'
}
