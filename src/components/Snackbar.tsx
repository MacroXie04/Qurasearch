import { useEffect } from 'react'

export interface SnackbarData {
  id: number
  message: string
  actionLabel?: string
  onAction?: () => void
}

export function Snackbar({ data, onDismiss }: { data: SnackbarData; onDismiss: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, 5000)
    return () => window.clearTimeout(t)
  }, [data.id, onDismiss])

  return (
    <div className="snackbar" role="status" aria-live="polite">
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
