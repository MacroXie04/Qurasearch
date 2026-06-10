import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { type CSSProperties, useState } from 'react'

import { CopyIcon, DeleteIcon, DragIcon, OpenInNewIcon, QuoteIcon } from '../icons'
import { IconButton } from '../md'
import { type Group, type Item } from '../types'
import { isLongText, prettyHost, relativeTime } from '../util'
import { FaviconImg } from './FaviconImg'
import { type MenuEntry, OverflowMenu } from './OverflowMenu'

export interface ClipActions {
  onCopy: (item: Item) => void
  onOpen: (item: Item) => void
  onMove: (item: Item, groupId: string | null) => void
  onDelete: (item: Item) => void
}

interface ClipCardProps extends ClipActions {
  item: Item
  groups: Group[]
  setNodeRef?: (el: HTMLElement | null) => void
  style?: CSSProperties
  handleProps?: Record<string, unknown>
  isDragging?: boolean
  showHandle?: boolean
}

export function ClipCard({
  item,
  groups,
  onCopy,
  onOpen,
  onMove,
  onDelete,
  setNodeRef,
  style,
  handleProps,
  isDragging,
  showHandle = true,
}: ClipCardProps) {
  const [expanded, setExpanded] = useState(false)
  const long = isLongText(item.text)
  const clamp = long && !expanded

  const moveEntries: MenuEntry[] = [
    {
      key: 'mv-ungrouped',
      label: 'Ungrouped',
      checked: item.groupId === null,
      onClick: () => onMove(item, null),
    },
    ...groups.map((g) => ({
      key: 'mv-' + g.id,
      label: g.name,
      leading: <span className="color-dot" style={{ background: g.color }} />,
      checked: item.groupId === g.id,
      onClick: () => onMove(item, g.id),
    })),
  ]

  const menu: MenuEntry[] = [
    { key: 'copy', label: 'Copy text', leading: <CopyIcon />, onClick: () => onCopy(item) },
    { key: 'open', label: 'Open source', leading: <OpenInNewIcon />, onClick: () => onOpen(item) },
    { key: 'd1', divider: true },
    ...moveEntries,
    { key: 'd2', divider: true },
    {
      key: 'del',
      label: 'Delete',
      leading: <DeleteIcon />,
      danger: true,
      onClick: () => onDelete(item),
    },
  ]

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={'clip-card' + (isDragging ? ' dragging' : '')}
    >
      <div className="clip-head">
        <button
          type="button"
          className={'drag-handle' + (showHandle ? '' : ' hidden')}
          aria-label="Drag to reorder"
          tabIndex={showHandle ? 0 : -1}
          {...(handleProps ?? {})}
        >
          <DragIcon size={20} />
        </button>
        <FaviconImg pageUrl={item.url} host={item.host} size={20} />
        <span className="clip-host body-small" title={item.url || item.host}>
          {prettyHost(item.host) || 'Unknown source'}
        </span>
        <OverflowMenu items={menu} ariaLabel="Clip actions" />
      </div>

      <div className="clip-quote">
        <span className="quote-mark">
          <QuoteIcon size={18} />
        </span>
        <div className={'clip-text body-medium' + (clamp ? ' clamp' : '')}>{item.text}</div>
      </div>
      {long ? (
        <button type="button" className="expand-btn" onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      ) : null}

      <div className="clip-footer">
        <span className="clip-time body-small">{relativeTime(item.createdAt)}</span>
        <IconButton aria-label="Copy text" onClick={() => onCopy(item)}>
          <CopyIcon size={20} />
        </IconButton>
        <IconButton aria-label="Open source" onClick={() => onOpen(item)}>
          <OpenInNewIcon size={20} />
        </IconButton>
      </div>
    </article>
  )
}

// Drag-reorderable variant (used inside a DndContext + SortableContext).
export function SortableClipCard(props: { item: Item; groups: Group[] } & ClipActions) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.item.id,
  })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
  }
  return (
    <ClipCard
      {...props}
      setNodeRef={setNodeRef}
      style={style}
      handleProps={{ ...attributes, ...listeners }}
      isDragging={isDragging}
    />
  )
}
