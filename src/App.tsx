import { useEffect, useRef, useState } from 'react'

import { type ClipActions } from './components/ClipCard'
import { ConfirmDialog, type ConfirmState } from './components/ConfirmDialog'
import { GroupDialog, type GroupDialogState } from './components/GroupDialog'
import { GroupList } from './components/GroupList'
import { GroupView } from './components/GroupView'
import { SearchView } from './components/SearchView'
import { Snackbar, type SnackbarData } from './components/Snackbar'
import { Dialog, FilledButton, TextButton } from './md'
import {
  addGroup,
  buildBackup,
  clearLastCaptured,
  deleteGroup,
  deleteItem,
  groupName,
  importBackup,
  itemsForGroup,
  moveItem,
  reorderItems,
  restoreItem,
  setActiveGroup,
  setDefaultGroup,
  setStoreErrorHandler,
  sortedGroups,
  updateGroup,
  useStore,
} from './store'
import { type Backup, type Group, PALETTE, UNGROUPED, type View } from './types'
import { downloadJson, readJsonFile, todayStamp } from './util'

export function App() {
  const s = useStore()
  const [view, setView] = useState<View>({ kind: 'home' })

  const [groupDialog, setGroupDialog] = useState<GroupDialogState>({
    open: false,
    mode: 'new',
    initialName: '',
    initialColor: PALETTE[0],
  })
  const [confirm, setConfirm] = useState<ConfirmState>({
    open: false,
    title: '',
    message: '',
    confirmLabel: '',
    onConfirm: () => {},
  })
  const [importState, setImportState] = useState<{
    open: boolean
    backup: Backup | null
    groups: number
    items: number
  }>({ open: false, backup: null, groups: 0, items: 0 })

  const [snackbar, setSnackbar] = useState<SnackbarData | null>(null)
  const snackSeq = useRef(0)
  const shownCaptureId = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function showSnackbar(message: string, action?: { label: string; onAction: () => void }) {
    snackSeq.current += 1
    setSnackbar({
      id: snackSeq.current,
      message,
      actionLabel: action?.label,
      onAction: action?.onAction,
    })
  }

  // Keep session.activeGroupId in sync with the current view (drives capture routing).
  useEffect(() => {
    const target = view.kind === 'group' ? view.groupId : view.kind === 'inbox' ? UNGROUPED : null
    void setActiveGroup(target)
  }, [view])

  // Show the "Saved" snackbar once per fresh capture.
  useEffect(() => {
    const lc = s.lastCaptured
    if (!lc || shownCaptureId.current === lc.id) return
    if (Date.now() - lc.ts > 10000) return
    shownCaptureId.current = lc.id
    showSnackbar(`Saved to ${groupName(s, lc.groupId)}`, {
      label: 'Undo',
      onAction: () => void deleteItem(lc.id),
    })
    // Consume the marker so reopening the panel within 10s can't re-fire this
    // snackbar (and its live Undo) against an already-saved clip.
    void clearLastCaptured()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.lastCaptured])

  // If the group being viewed disappears (deleted elsewhere), fall back Home.
  useEffect(() => {
    if (view.kind === 'group' && !s.groups.some((g) => g.id === view.groupId)) {
      setView({ kind: 'home' })
    }
  }, [s.groups, view])

  // Surface storage write failures (e.g. quota exceeded) to the user.
  useEffect(() => {
    setStoreErrorHandler((message) => showSnackbar(message))
    return () => setStoreErrorHandler(() => {})
  }, [])

  // ---- navigation ----
  const goHome = () => setView({ kind: 'home' })
  const openGroup = (id: string) => setView({ kind: 'group', groupId: id })
  const openInbox = () => setView({ kind: 'inbox' })
  const openSearch = () => setView({ kind: 'search' })

  // ---- clip actions ----
  const clipActions: ClipActions = {
    onCopy: (item) => {
      navigator.clipboard
        .writeText(item.text)
        .then(() => showSnackbar('Copied to clipboard'))
        .catch(() => showSnackbar('Copy failed'))
    },
    onOpen: (item) => {
      if (!item.url) return
      try {
        const u = new URL(item.url)
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          showSnackbar('Can only open http(s) links')
          return
        }
      } catch {
        showSnackbar('Invalid link')
        return
      }
      // The background opens the tab and injects the highlighter that scrolls
      // to the clip. If messaging fails for any reason, open the tab plainly.
      const fallback = () =>
        chrome.tabs.create({ url: item.url }).catch(() => showSnackbar('Could not open link'))
      chrome.runtime.sendMessage({ type: 'qura:jump', itemId: item.id }).then(
        (res: { ok?: boolean } | undefined) => {
          if (!res?.ok) void fallback()
        },
        () => void fallback(),
      )
    },
    onMove: (item, groupId) => {
      void moveItem(item.id, groupId)
      showSnackbar(`Moved to ${groupName(s, groupId)}`)
    },
    onDelete: (item) => {
      void deleteItem(item.id)
      showSnackbar('Clip deleted', { label: 'Undo', onAction: () => void restoreItem(item) })
    },
  }

  // ---- group dialog / management ----
  const openNewGroup = () =>
    setGroupDialog({ open: true, mode: 'new', initialName: '', initialColor: PALETTE[0] })
  const openEditGroup = (g: Group) =>
    setGroupDialog({
      open: true,
      mode: 'edit',
      groupId: g.id,
      initialName: g.name,
      initialColor: g.color,
    })

  const submitGroup = (name: string, color: string) => {
    if (groupDialog.mode === 'new') {
      void addGroup(name, color).then(() => showSnackbar('Group created'))
    } else if (groupDialog.groupId) {
      void updateGroup(groupDialog.groupId, { name, color })
    }
  }

  function groupActionsFor(group: Group, isDefault: boolean) {
    return {
      onRename: () => openEditGroup(group),
      onChangeColor: () => openEditGroup(group),
      onToggleDefault: () => void setDefaultGroup(isDefault ? null : group.id),
      onDeleteGroup: () =>
        setConfirm({
          open: true,
          title: 'Delete group?',
          danger: true,
          confirmLabel: 'Delete',
          message: `“${group.name}” will be deleted and its clips moved to Ungrouped.`,
          onConfirm: () => {
            void deleteGroup(group.id)
            if (view.kind === 'group' && view.groupId === group.id) goHome()
            showSnackbar('Group deleted')
          },
        }),
    }
  }

  // ---- export page ----
  const onOpenExport = () => {
    chrome.tabs
      .create({ url: chrome.runtime.getURL('export.html') })
      .catch(() => showSnackbar('Could not open the export page'))
  }

  // ---- backup ----
  const onExport = () => {
    downloadJson(`qurasearch-backup-${todayStamp()}.json`, buildBackup())
    showSnackbar('Backup exported')
  }
  const onImport = () => fileInputRef.current?.click()
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const data = (await readJsonFile(file)) as Backup
      if (!data || !Array.isArray(data.groups) || !Array.isArray(data.items)) {
        showSnackbar('Invalid backup file')
        return
      }
      setImportState({
        open: true,
        backup: data,
        groups: data.groups.length,
        items: data.items.length,
      })
    } catch {
      showSnackbar('Could not read file')
    }
  }
  const chooseImport = (mode: 'merge' | 'replace') => {
    if (importState.backup) {
      void importBackup(importState.backup, mode).then(() =>
        showSnackbar(mode === 'merge' ? 'Backup merged' : 'Backup replaced'),
      )
    }
    setImportState((st) => ({ ...st, open: false }))
  }

  // ---- render body ----
  let body
  if (!s.ready) {
    body = <div className="app" />
  } else if (view.kind === 'search') {
    body = <SearchView state={s} onBack={goHome} {...clipActions} />
  } else if (view.kind === 'inbox') {
    body = (
      <GroupView
        group={null}
        items={itemsForGroup(s, null)}
        groups={sortedGroups(s)}
        isDefault={false}
        onBack={goHome}
        onReorder={(ids) => void reorderItems(ids)}
        onRename={() => {}}
        onChangeColor={() => {}}
        onToggleDefault={() => {}}
        onDeleteGroup={() => {}}
        {...clipActions}
      />
    )
  } else if (view.kind === 'group') {
    const group = s.groups.find((g) => g.id === view.groupId)
    if (group) {
      const isDefault = s.pinnedGroupId === group.id
      body = (
        <GroupView
          group={group}
          items={itemsForGroup(s, group.id)}
          groups={sortedGroups(s)}
          isDefault={isDefault}
          onBack={goHome}
          onReorder={(ids) => void reorderItems(ids)}
          {...groupActionsFor(group, isDefault)}
          {...clipActions}
        />
      )
    }
  }
  if (!body) {
    body = (
      <GroupList
        state={s}
        onOpenGroup={openGroup}
        onOpenInbox={openInbox}
        onNewGroup={openNewGroup}
        onSearch={openSearch}
        onOpenExport={onOpenExport}
        onExport={onExport}
        onImport={onImport}
      />
    )
  }

  return (
    <>
      {body}

      <GroupDialog
        state={groupDialog}
        onClose={() => setGroupDialog((st) => ({ ...st, open: false }))}
        onSubmit={submitGroup}
      />
      <ConfirmDialog state={confirm} onClose={() => setConfirm((st) => ({ ...st, open: false }))} />

      <Dialog
        open={importState.open}
        onClosed={() => setImportState((st) => ({ ...st, open: false }))}
      >
        <div slot="headline">Import backup</div>
        <div slot="content" className="dialog-text body-medium">
          This file has {importState.groups} group{importState.groups === 1 ? '' : 's'} and{' '}
          {importState.items} clip{importState.items === 1 ? '' : 's'}. Merge it with your current
          data, or replace everything?
        </div>
        <div slot="actions">
          <TextButton onClick={() => setImportState((st) => ({ ...st, open: false }))}>
            Cancel
          </TextButton>
          <TextButton onClick={() => chooseImport('replace')}>Replace</TextButton>
          <FilledButton onClick={() => chooseImport('merge')}>Merge</FilledButton>
        </div>
      </Dialog>

      {snackbar ? <Snackbar data={snackbar} onDismiss={() => setSnackbar(null)} /> : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        onChange={onFile}
      />
    </>
  )
}
