import { useEffect, useState } from 'react'

import { Dialog, FilledButton, OutlinedTextField, TextButton } from '../md'
import { PALETTE } from '../types'
import { ColorPicker } from './ColorPicker'

export interface GroupDialogState {
  open: boolean
  mode: 'new' | 'edit'
  groupId?: string
  initialName: string
  initialColor: string
}

export function GroupDialog({
  state,
  onClose,
  onSubmit,
}: {
  state: GroupDialogState
  onClose: () => void
  onSubmit: (name: string, color: string) => void
}) {
  const [name, setName] = useState(state.initialName)
  const [color, setColor] = useState(state.initialColor || PALETTE[0])

  useEffect(() => {
    if (state.open) {
      setName(state.initialName)
      setColor(state.initialColor || PALETTE[0])
    }
  }, [state.open, state.initialName, state.initialColor])

  function submit() {
    const n = name.trim()
    if (!n) return
    onSubmit(n, color)
    onClose()
  }

  return (
    <Dialog open={state.open} onClosed={onClose}>
      <div slot="headline">{state.mode === 'new' ? 'New group' : 'Edit group'}</div>
      <form
        slot="content"
        className="dialog-content"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="dialog-field">
          <OutlinedTextField
            label="Name"
            value={name}
            onTfInput={(e: Event) => setName((e.target as HTMLInputElement).value)}
          />
        </div>
        <div className="dialog-field">
          <span className="dialog-label body-small">Color</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>
      </form>
      <div slot="actions">
        <TextButton onClick={onClose}>Cancel</TextButton>
        <FilledButton onClick={submit} disabled={!name.trim()}>
          {state.mode === 'new' ? 'Create' : 'Save'}
        </FilledButton>
      </div>
    </Dialog>
  )
}
