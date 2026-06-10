import { type CSSProperties } from 'react'

import { Dialog, FilledButton, TextButton } from '../md'

export interface ConfirmState {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
}

const dangerStyle = {
  '--md-filled-button-container-color': 'var(--md-sys-color-error)',
  '--md-filled-button-label-text-color': 'var(--md-sys-color-on-error)',
} as CSSProperties

export function ConfirmDialog({ state, onClose }: { state: ConfirmState; onClose: () => void }) {
  return (
    <Dialog open={state.open} onClosed={onClose}>
      <div slot="headline">{state.title}</div>
      <div slot="content" className="dialog-text body-medium">
        {state.message}
      </div>
      <div slot="actions">
        <TextButton onClick={onClose}>Cancel</TextButton>
        <FilledButton
          style={state.danger ? dangerStyle : undefined}
          onClick={() => {
            state.onConfirm()
            onClose()
          }}
        >
          {state.confirmLabel}
        </FilledButton>
      </div>
    </Dialog>
  )
}
