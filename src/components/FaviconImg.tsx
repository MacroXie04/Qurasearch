import { useMemo, useState } from 'react'

import { prettyHost } from '../util'

// Favicon from Chrome's own cache via the `favicon` permission. The side panel
// is an extension page, so this is same-origin (no web_accessible_resources).
// Falls back to a first-letter avatar when the favicon can't be loaded.
export function FaviconImg({
  pageUrl,
  host,
  size = 20,
}: {
  pageUrl: string
  host: string
  size?: number
}) {
  const [errored, setErrored] = useState(false)

  const src = useMemo(() => {
    if (!pageUrl) return ''
    try {
      const u = new URL(chrome.runtime.getURL('/_favicon/'))
      u.searchParams.set('pageUrl', pageUrl)
      u.searchParams.set('size', '32')
      return u.toString()
    } catch {
      return ''
    }
  }, [pageUrl])

  if (errored || !src) {
    const letter = (prettyHost(host) || '?').charAt(0) || '?'
    return (
      <span
        className="favicon-fallback"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }}
        aria-hidden="true"
      >
        {letter}
      </span>
    )
  }

  return (
    <img
      className="favicon"
      src={src}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      onError={() => setErrored(true)}
    />
  )
}
