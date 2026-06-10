import { CheckIcon } from '../icons'
import { PALETTE } from '../types'

export function ColorPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (color: string) => void
}) {
  return (
    <div className="color-picker" role="radiogroup" aria-label="Group color">
      {PALETTE.map((c) => {
        const selected = c.toLowerCase() === value.toLowerCase()
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`Color ${c}`}
            className={'swatch' + (selected ? ' selected' : '')}
            style={{ background: c }}
            onClick={() => onChange(c)}
          >
            {selected ? <CheckIcon size={20} /> : null}
          </button>
        )
      })}
    </div>
  )
}
