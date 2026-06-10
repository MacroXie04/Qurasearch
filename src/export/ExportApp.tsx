// The standalone export page: pick clips (whole groups or individual clips),
// pick a format and link style, edit the output, then copy/download/save it.
import { useEffect, useMemo, useRef, useState } from 'react'

import { BookmarkIcon, ChevronRightIcon, ExpandMoreIcon, InboxIcon } from '../icons'
import { Checkbox, FilledButton, IconButton, OutlinedButton, Radio } from '../md'
import { itemsForGroup, sortedGroups, type StoreState, useStore } from '../store'
import { downloadText, todayStamp } from '../util'
import {
  exportFilename,
  type ExportFormat,
  exportMime,
  type ExportSection,
  formatExport,
  LINK_STYLES,
  type LinkStyle,
} from './formats'

const SAVED_EXPORT_KEY = 'savedExport'
// Prefixed so it can never collide with a real group id (group ids are UUIDs,
// but an imported/hand-edited backup could carry any string, e.g. the public
// UNGROUPED sentinel).
const UNGROUPED_KEY = 'pseudo:ungrouped'

const FORMAT_LABELS: Record<ExportFormat, string> = {
  txt: 'Plain text (.txt)',
  md: 'Markdown (.md)',
  html: 'HTML (.html)',
  csv: 'CSV (.csv)',
}

const LINK_STYLE_LABELS: Record<LinkStyle, string> = {
  none: 'Text only',
  after: 'Text + source URL after each clip',
  inline: 'Text as a link — [text](url)',
  links: 'Text as a clickable link',
}

const DEFAULT_LINK_STYLES: Record<ExportFormat, LinkStyle> = {
  txt: LINK_STYLES.txt[0],
  md: LINK_STYLES.md[0],
  html: LINK_STYLES.html[0],
  csv: LINK_STYLES.csv[0],
}

interface ScopeGroup {
  key: string
  name: string
  isUngrouped: boolean
  color?: string
  items: { id: string; text: string; url: string; title: string; host: string; createdAt: number }[]
}

interface SavedExport {
  text: string
  format: ExportFormat
  linkStyle: LinkStyle
  filename: string
  clipCount: number
  savedAt: number
}

function scopeGroups(s: StoreState): ScopeGroup[] {
  const out: ScopeGroup[] = []
  const ungrouped = itemsForGroup(s, null)
  if (ungrouped.length)
    out.push({ key: UNGROUPED_KEY, name: 'Ungrouped', isUngrouped: true, items: ungrouped })
  for (const g of sortedGroups(s)) {
    const items = itemsForGroup(s, g.id)
    if (items.length)
      out.push({ key: g.id, name: g.name, isUngrouped: false, color: g.color, items })
  }
  return out
}

function readSavedExport(raw: unknown): SavedExport | null {
  if (!raw || typeof raw !== 'object') return null
  const saved = raw as Record<string, unknown>
  if (
    typeof saved.text !== 'string' ||
    typeof saved.filename !== 'string' ||
    typeof saved.clipCount !== 'number' ||
    typeof saved.savedAt !== 'number'
  )
    return null
  if (!['txt', 'md', 'html', 'csv'].includes(String(saved.format))) return null
  if (!['none', 'after', 'inline', 'links'].includes(String(saved.linkStyle))) return null
  return {
    text: saved.text,
    format: saved.format as ExportFormat,
    linkStyle: saved.linkStyle as LinkStyle,
    filename: saved.filename,
    clipCount: saved.clipCount,
    savedAt: saved.savedAt,
  }
}

function savedAtLabel(ts: number): string {
  if (!Number.isFinite(ts)) return ''
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function ExportApp() {
  const s = useStore()
  // Track DESELECTED ids rather than selected ones: "everything except what the
  // user unchecked". This makes delete→undo round-trips lossless (a restored
  // clip's id was never in `deselected`, so it comes back checked) and needs no
  // seeding effect — `selected` is derived, so there's no first-paint flash.
  const [deselected, setDeselected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [format, setFormat] = useState<ExportFormat>('txt')
  const [linkStyles, setLinkStyles] = useState(DEFAULT_LINK_STYLES)
  const [draft, setDraft] = useState('')
  const [edited, setEdited] = useState(false)
  const [savedExport, setSavedExport] = useState<SavedExport | null>(null)
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const restoredDraft = useRef<string | null>(null)
  const copyTimer = useRef<number | undefined>(undefined)
  const saveTimer = useRef<number | undefined>(undefined)

  useEffect(
    () => () => {
      window.clearTimeout(copyTimer.current)
      window.clearTimeout(saveTimer.current)
    },
    [],
  )

  useEffect(() => {
    let active = true
    chrome.storage.local.get(SAVED_EXPORT_KEY).then((r) => {
      if (active) setSavedExport(readSavedExport(r[SAVED_EXPORT_KEY]))
    })
    return () => {
      active = false
    }
  }, [])

  const groups = useMemo(() => scopeGroups(s), [s])
  const isSelected = (id: string) => !deselected.has(id)
  const totalCount = s.items.length
  const selectedCount = useMemo(
    () => s.items.reduce((n, it) => n + (deselected.has(it.id) ? 0 : 1), 0),
    [s.items, deselected],
  )

  const sections = useMemo<ExportSection[]>(() => {
    const out: ExportSection[] = []
    for (const g of groups) {
      const clips = g.items
        .filter((it) => !deselected.has(it.id))
        .map((it) => ({
          text: it.text,
          url: it.url,
          title: it.title,
          host: it.host,
          createdAt: it.createdAt,
        }))
      if (clips.length) out.push({ groupName: g.name, clips })
    }
    return out
  }, [groups, deselected])

  const linkStyle = linkStyles[format]
  const generated = useMemo(
    () => (sections.length ? formatExport(sections, { format, linkStyle }) : ''),
    [sections, format, linkStyle],
  )
  const clipCount = useMemo(() => sections.reduce((n, sec) => n + sec.clips.length, 0), [sections])

  useEffect(() => {
    if (restoredDraft.current !== null) {
      const text = restoredDraft.current
      restoredDraft.current = null
      setDraft(text)
      setEdited(text !== generated)
      return
    }
    if (!edited) setDraft(generated)
  }, [generated, edited])

  const setAll = (ids: string[], on: boolean) =>
    setDeselected((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (on) next.delete(id)
        else next.add(id)
      }
      return next
    })

  const selectAll = () => setDeselected(new Set())
  const selectNone = () => setDeselected(new Set(s.items.map((i) => i.id)))

  const toggleExpand = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const onDraftChange = (next: string) => {
    setDraft(next)
    setEdited(next !== generated)
    setCopied(false)
    setSaved(false)
    setSaveFailed(false)
  }

  const regenerateDraft = () => {
    setDraft(generated)
    setEdited(false)
    setCopied(false)
    setSaved(false)
    setSaveFailed(false)
  }

  const currentFilename = () => exportFilename(format, todayStamp())

  const persistExport = async (showStatus: boolean) => {
    const next: SavedExport = {
      text: draft,
      format,
      linkStyle,
      filename: currentFilename(),
      clipCount,
      savedAt: Date.now(),
    }
    try {
      await chrome.storage.local.set({ [SAVED_EXPORT_KEY]: next })
      setSavedExport(next)
      if (showStatus) {
        setSaved(true)
        setSaveFailed(false)
        window.clearTimeout(saveTimer.current)
        saveTimer.current = window.setTimeout(() => setSaved(false), 2000)
      }
    } catch {
      if (showStatus) {
        setSaved(false)
        setSaveFailed(true)
      }
    }
  }

  const onCopy = () => {
    navigator.clipboard
      .writeText(draft)
      .then(() => {
        setCopied(true)
        window.clearTimeout(copyTimer.current)
        copyTimer.current = window.setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {})
  }

  const onDownload = () => {
    void persistExport(false)
    downloadText(currentFilename(), draft, exportMime(format))
  }

  const onSave = () => {
    void persistExport(true)
  }

  const onLoadSaved = () => {
    if (!savedExport) return
    restoredDraft.current = savedExport.text
    setFormat(savedExport.format)
    setLinkStyles((prev) => ({ ...prev, [savedExport.format]: savedExport.linkStyle }))
    setDraft(savedExport.text)
    setEdited(savedExport.text !== generated)
    setCopied(false)
    setSaved(false)
    setSaveFailed(false)
  }

  if (!s.ready) return <div className="export-page" />

  return (
    <div className="export-page">
      <header className="export-header">
        <h1 className="title-large">Export clips</h1>
        <span className="body-medium export-count">
          {selectedCount} of {totalCount} clip{totalCount === 1 ? '' : 's'} selected
        </span>
      </header>

      <aside className="export-aside">
        <section className="export-panel" aria-label="Clips to export">
          <div className="export-panel-head">
            <h2 className="title-medium">Clips</h2>
            <div className="export-select-buttons">
              <button type="button" className="text-action" onClick={selectAll}>
                All
              </button>
              <button type="button" className="text-action" onClick={selectNone}>
                None
              </button>
            </div>
          </div>

          {groups.length === 0 ? (
            <p className="body-medium export-empty">
              No clips yet — select text on a page, right-click, and choose “Add to Qurasearch”.
            </p>
          ) : (
            <ul className="export-groups">
              {groups.map((g) => {
                const ids = g.items.map((i) => i.id)
                const picked = ids.filter(isSelected).length
                const isExpanded = expanded.has(g.key)
                return (
                  <li key={g.key}>
                    <div className="export-group-row">
                      <Checkbox
                        aria-label={`Export group ${g.name}`}
                        checked={picked === ids.length}
                        indeterminate={picked > 0 && picked < ids.length}
                        onChange={(e: Event) => setAll(ids, (e.target as HTMLInputElement).checked)}
                      />
                      <span className="export-group-icon" aria-hidden="true">
                        {g.isUngrouped ? (
                          <InboxIcon size={18} />
                        ) : g.color ? (
                          <span className="color-dot" style={{ background: g.color }} />
                        ) : (
                          <BookmarkIcon size={18} />
                        )}
                      </span>
                      <button
                        type="button"
                        className="export-group-name body-medium"
                        aria-expanded={isExpanded}
                        onClick={() => toggleExpand(g.key)}
                      >
                        <span className="ellipsis">{g.name}</span>
                        <span className="pill">
                          {picked}/{ids.length}
                        </span>
                      </button>
                      <IconButton
                        aria-label={isExpanded ? `Collapse ${g.name}` : `Expand ${g.name}`}
                        onClick={() => toggleExpand(g.key)}
                      >
                        {isExpanded ? <ExpandMoreIcon size={20} /> : <ChevronRightIcon size={20} />}
                      </IconButton>
                    </div>
                    {isExpanded ? (
                      <ul className="export-clips">
                        {g.items.map((it) => (
                          <li key={it.id} className="export-clip-row">
                            <Checkbox
                              aria-label={`Export clip: ${it.text.slice(0, 60)}`}
                              checked={isSelected(it.id)}
                              onChange={(e: Event) =>
                                setAll([it.id], (e.target as HTMLInputElement).checked)
                              }
                            />
                            <span className="export-clip-text body-small">{it.text}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="export-panel" aria-label="Format">
          <h2 className="title-medium">Format</h2>
          <div role="radiogroup" aria-label="Export format" className="export-options">
            {(Object.keys(FORMAT_LABELS) as ExportFormat[]).map((f) => (
              <label key={f} className="export-option body-medium">
                <Radio
                  name="format"
                  value={f}
                  checked={format === f}
                  onChange={() => setFormat(f)}
                />
                {FORMAT_LABELS[f]}
              </label>
            ))}
          </div>

          {LINK_STYLES[format].length > 1 ? (
            <>
              <h3 className="title-medium export-sub">Links</h3>
              <div role="radiogroup" aria-label="Link style" className="export-options">
                {LINK_STYLES[format].map((ls) => (
                  <label key={ls} className="export-option body-medium">
                    <Radio
                      name="linkstyle"
                      value={ls}
                      checked={linkStyle === ls}
                      onChange={() => setLinkStyles((prev) => ({ ...prev, [format]: ls }))}
                    />
                    {LINK_STYLE_LABELS[ls]}
                  </label>
                ))}
              </div>
            </>
          ) : null}
        </section>

        <div className="export-actions">
          <FilledButton disabled={!draft} onClick={onCopy}>
            {copied ? 'Copied' : 'Copy'}
          </FilledButton>
          <OutlinedButton disabled={!draft} onClick={onDownload}>
            Download
          </OutlinedButton>
          <OutlinedButton disabled={!draft} onClick={onSave}>
            {saveFailed ? 'Save failed' : saved ? 'Saved' : 'Save'}
          </OutlinedButton>
        </div>

        {savedExport ? (
          <section className="export-panel export-saved" aria-label="Saved export">
            <div>
              <h2 className="title-medium">Saved export</h2>
              <p className="body-small">
                {savedExport.filename} · {savedExport.clipCount} clip
                {savedExport.clipCount === 1 ? '' : 's'} · {savedAtLabel(savedExport.savedAt)}
              </p>
            </div>
            <OutlinedButton onClick={onLoadSaved}>Load</OutlinedButton>
          </section>
        ) : null}
      </aside>

      <main className="export-main">
        <div className="export-editor-head">
          <h2 className="title-medium">Output</h2>
          {edited ? (
            <button type="button" className="text-action" onClick={regenerateDraft}>
              Regenerate
            </button>
          ) : null}
        </div>
        <textarea
          className="export-preview"
          aria-label="Export preview"
          spellCheck={false}
          value={draft}
          placeholder="Nothing selected — pick clips on the left."
          onChange={(e) => onDraftChange(e.target.value)}
        />
      </main>
    </div>
  )
}
