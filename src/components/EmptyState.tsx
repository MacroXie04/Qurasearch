import type { ReactNode } from 'react'

export function EmptyState({
  icon,
  title,
  text,
}: {
  icon: ReactNode
  title: string
  text: string
}) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <div className="empty-title title-medium">{title}</div>
      <div className="body-medium">{text}</div>
    </div>
  )
}
