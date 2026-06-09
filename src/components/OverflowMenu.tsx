import { useId, useState, type ReactNode } from 'react'
import { IconButton, Menu, MenuItem, Divider } from '../md'
import { MoreIcon, CheckIcon } from '../icons'

export interface MenuEntry {
  key: string
  label?: string
  leading?: ReactNode
  checked?: boolean
  danger?: boolean
  divider?: boolean
  onClick?: () => void
}

// Reusable overflow menu: an md-icon-button anchoring an md-menu of md-menu-items.
export function OverflowMenu({
  items,
  ariaLabel = 'More options',
  icon,
}: {
  items: MenuEntry[]
  ariaLabel?: string
  icon?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const anchorId = 'menu-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')

  return (
    <span className="menu-anchor">
      <IconButton
        id={anchorId}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {icon ?? <MoreIcon />}
      </IconButton>
      <Menu
        anchor={anchorId}
        open={open}
        onClosed={() => setOpen(false)}
        positioning="fixed"
        anchorCorner="end-end"
        menuCorner="start-end"
        quick
      >
        {items.map((it) =>
          it.divider ? (
            <Divider key={it.key} />
          ) : (
            <MenuItem
              key={it.key}
              onClick={() => {
                setOpen(false)
                it.onClick?.()
              }}
            >
              {it.leading ? (
                <span slot="start" className="icon-24">
                  {it.leading}
                </span>
              ) : null}
              <div slot="headline" className={it.danger ? 'danger-text' : undefined}>
                {it.label}
              </div>
              {it.checked ? (
                <span slot="end" className="icon-24">
                  <CheckIcon />
                </span>
              ) : null}
            </MenuItem>
          ),
        )}
      </Menu>
    </span>
  )
}
