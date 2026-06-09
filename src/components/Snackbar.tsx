import { useEffect, useRef, useState } from 'react'

export interface SnackbarData {
  id: number
  message: string
  actionLabel?: string
  onAction?: () => void
}

export function Snackbar({ data, onDismiss }: { data: SnackbarData; onDismiss: () => void }) {
  // Keep onDismiss in a ref so unrelated App re-renders don't restart the timer.
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss
  const [paused, setPaused] = useState(false)

  // Give actionable toasts (Undo) longer to be reached, and pause while the user
  // is hovering or keyboard-focused inside the snackbar.
  const hasAction = !!data.actionLabel
  useEffect(() => {
    if (paused) return
    const ms = hasAction ? 10000 : 5000
    const t = window.setTimeout(() => onDismissRef.current(), ms)
    return () => window.clearTimeout(t)
  }, [data.id, paused, hasAction])

  return (
    <div
      className="snackbar"
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <span className="snackbar-text body-medium">{data.message}</span>
      {data.actionLabel ? (
        <button
          type="button"
          className="snackbar-action"
          onClick={() => {
            data.onAction?.()
            onDismiss()
          }}
        >
          {data.actionLabel}
        </button>
      ) : null}
    </div>
  )
}
