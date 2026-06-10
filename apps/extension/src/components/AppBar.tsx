import type { ReactNode } from 'react'

export function AppBar({
  leading,
  title,
  actions,
}: {
  leading?: ReactNode
  title: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="appbar">
      {leading}
      <div className="appbar-title title-large">{title}</div>
      {actions ? <div className="appbar-actions">{actions}</div> : null}
    </header>
  )
}
