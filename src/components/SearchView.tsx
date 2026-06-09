import { useEffect, useMemo, useRef, useState } from 'react'
import { type StoreState, sortedGroups } from '../store'
import { AppBar } from './AppBar'
import { EmptyState } from './EmptyState'
import { ClipCard, type ClipActions } from './ClipCard'
import { IconButton } from '../md'
import { ArrowBackIcon, SearchIcon, CloseIcon } from '../icons'

export function SearchView({
  state,
  onBack,
  onCopy,
  onOpen,
  onMove,
  onDelete,
}: { state: StoreState; onBack: () => void } & ClipActions) {
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const query = q.trim().toLowerCase()
  const results = useMemo(() => {
    if (!query) return []
    return state.items
      .filter(
        (i) =>
          i.text.toLowerCase().includes(query) ||
          i.title.toLowerCase().includes(query) ||
          i.host.toLowerCase().includes(query),
      )
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [query, state.items])

  const groups = sortedGroups(state)

  return (
    <div className="app">
      <AppBar
        leading={
          <IconButton aria-label="Back" onClick={onBack}>
            <ArrowBackIcon />
          </IconButton>
        }
        title={
          <div className="searchbar">
            <span className="search-icon">
              <SearchIcon size={20} />
            </span>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search all clips"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search clips"
            />
            {q ? (
              <IconButton aria-label="Clear search" onClick={() => setQ('')}>
                <CloseIcon size={20} />
              </IconButton>
            ) : null}
          </div>
        }
      />
      <div className="app-body">
        {!query ? (
          <EmptyState
            icon={<SearchIcon size={28} />}
            title="Search your clips"
            text="Type to search all clips by text, title, or site."
          />
        ) : results.length === 0 ? (
          <EmptyState
            icon={<SearchIcon size={28} />}
            title="No matches"
            text={`Nothing found for “${q.trim()}”.`}
          />
        ) : (
          <>
            <div className="results-count body-small">
              {results.length} result{results.length === 1 ? '' : 's'}
            </div>
            <div className="clip-list">
              {results.map((it) => (
                <ClipCard
                  key={it.id}
                  item={it}
                  groups={groups}
                  showHandle={false}
                  onCopy={onCopy}
                  onOpen={onOpen}
                  onMove={onMove}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
