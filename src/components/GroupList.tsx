import { type StoreState, sortedGroups, countForGroup } from '../store'
import { AppBar } from './AppBar'
import { EmptyState } from './EmptyState'
import { OverflowMenu, type MenuEntry } from './OverflowMenu'
import { IconButton, List, ListItem, Fab } from '../md'
import {
  SearchIcon,
  InboxIcon,
  ChevronRightIcon,
  AddIcon,
  DownloadIcon,
  UploadIcon,
  PushPinIcon,
  BookmarkIcon,
} from '../icons'

interface GroupListProps {
  state: StoreState
  onOpenGroup: (id: string) => void
  onOpenInbox: () => void
  onNewGroup: () => void
  onSearch: () => void
  onExport: () => void
  onImport: () => void
}

export function GroupList({
  state,
  onOpenGroup,
  onOpenInbox,
  onNewGroup,
  onSearch,
  onExport,
  onImport,
}: GroupListProps) {
  const groups = sortedGroups(state)
  const ungroupedCount = countForGroup(state, null)
  const noData = state.groups.length === 0 && state.items.length === 0

  const overflow: MenuEntry[] = [
    { key: 'export', label: 'Export backup', leading: <DownloadIcon />, onClick: onExport },
    { key: 'import', label: 'Import backup', leading: <UploadIcon />, onClick: onImport },
  ]

  return (
    <div className="app">
      <AppBar
        title={<span className="ellipsis">Qurasearch</span>}
        actions={
          <>
            <IconButton aria-label="Search clips" onClick={onSearch}>
              <SearchIcon />
            </IconButton>
            <OverflowMenu items={overflow} ariaLabel="More options" />
          </>
        }
      />
      <div className="app-body with-fab">
        {noData ? (
          <EmptyState
            icon={<BookmarkIcon size={28} />}
            title="No clips yet"
            text="Select text on any page, right-click, and choose 'Add to Qurasearch'."
          />
        ) : (
          <List className="group-list">
            <ListItem type="button" onClick={onOpenInbox}>
              <span
                slot="start"
                className="icon-24"
                style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
              >
                <InboxIcon />
              </span>
              <div slot="headline">
                Ungrouped
                <span className="sr-only">
                  {' · '}
                  {ungroupedCount} clip{ungroupedCount === 1 ? '' : 's'}
                </span>
              </div>
              <div slot="end" className="row-trailing" aria-hidden="true">
                <span className="pill">{ungroupedCount}</span>
                <ChevronRightIcon size={20} />
              </div>
            </ListItem>

            {groups.map((g) => {
              const count = countForGroup(state, g.id)
              const isDefault = state.pinnedGroupId === g.id
              return (
                <ListItem key={g.id} type="button" onClick={() => onOpenGroup(g.id)}>
                  <span slot="start">
                    <span className="color-dot" style={{ background: g.color }} />
                  </span>
                  <div slot="headline" className="ellipsis">
                    {g.name}
                    <span className="sr-only">
                      {' · '}
                      {count} clip{count === 1 ? '' : 's'}
                      {isDefault ? ', default group' : ''}
                    </span>
                  </div>
                  <div slot="end" className="row-trailing" aria-hidden="true">
                    {isDefault ? (
                      <span className="pin-mark">
                        <PushPinIcon size={18} />
                      </span>
                    ) : null}
                    <span className="pill">{count}</span>
                    <ChevronRightIcon size={20} />
                  </div>
                </ListItem>
              )
            })}
          </List>
        )}
      </div>

      <div className="fab-wrap">
        <Fab variant="primary" size="medium" label="New group" aria-label="New group" onClick={onNewGroup}>
          <span slot="icon">
            <AddIcon />
          </span>
        </Fab>
      </div>
    </div>
  )
}
