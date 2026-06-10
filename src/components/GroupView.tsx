import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'

import {
  ArrowBackIcon,
  ColorIcon,
  DeleteIcon,
  EditIcon,
  InboxIcon,
  PushPinIcon,
  QuoteIcon,
} from '../icons'
import { IconButton } from '../md'
import { type Group, type Item } from '../types'
import { AppBar } from './AppBar'
import { CaptureBanner } from './CaptureBanner'
import { type ClipActions, SortableClipCard } from './ClipCard'
import { EmptyState } from './EmptyState'
import { type MenuEntry, OverflowMenu } from './OverflowMenu'

interface GroupViewProps extends ClipActions {
  /** null = the Inbox / Ungrouped view. */
  group: Group | null
  items: Item[]
  groups: Group[]
  isDefault: boolean
  onBack: () => void
  onReorder: (orderedIds: string[]) => void
  onRename: () => void
  onChangeColor: () => void
  onToggleDefault: () => void
  onDeleteGroup: () => void
}

export function GroupView(props: GroupViewProps) {
  const { group, items, groups, isDefault, onBack, onReorder } = props

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const ids = items.map((i) => i.id)

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    onReorder(arrayMove(ids, oldIndex, newIndex))
  }

  const bannerVariant = group ? (isDefault ? 'default' : 'group') : 'inbox'

  const title = group ? (
    <>
      <span className="color-dot lg" style={{ background: group.color }} />
      <span className="ellipsis">{group.name}</span>
    </>
  ) : (
    <>
      <span className="appbar-lead" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
        <InboxIcon />
      </span>
      <span className="ellipsis">Ungrouped</span>
    </>
  )

  const groupMenu: MenuEntry[] = group
    ? [
        { key: 'rename', label: 'Rename', leading: <EditIcon />, onClick: props.onRename },
        {
          key: 'color',
          label: 'Change color',
          leading: <ColorIcon />,
          onClick: props.onChangeColor,
        },
        {
          key: 'default',
          label: isDefault ? 'Unset default group' : 'Set as default group',
          leading: <PushPinIcon />,
          onClick: props.onToggleDefault,
        },
        { key: 'd', divider: true },
        {
          key: 'delete',
          label: 'Delete group',
          leading: <DeleteIcon />,
          danger: true,
          onClick: props.onDeleteGroup,
        },
      ]
    : []

  return (
    <div className="app">
      <AppBar
        leading={
          <IconButton aria-label="Back" onClick={onBack}>
            <ArrowBackIcon />
          </IconButton>
        }
        title={title}
        actions={group ? <OverflowMenu items={groupMenu} ariaLabel="Group actions" /> : null}
      />
      <div className="app-body">
        <CaptureBanner variant={bannerVariant} />
        {items.length === 0 ? (
          <EmptyState
            icon={group ? <QuoteIcon size={28} /> : <InboxIcon size={28} />}
            title={group ? 'No clips here yet' : 'Ungrouped is empty'}
            text={
              group
                ? "While this group is open, select text on a page and choose 'Add to Qurasearch'."
                : 'Clips that belong to no group show up here.'
            }
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <div className="clip-list">
                {items.map((it) => (
                  <SortableClipCard
                    key={it.id}
                    item={it}
                    groups={groups}
                    onCopy={props.onCopy}
                    onOpen={props.onOpen}
                    onMove={props.onMove}
                    onDelete={props.onDelete}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  )
}
