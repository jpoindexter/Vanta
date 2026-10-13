import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react'

import { PALETTE_COPY } from '../copy'
import type { PaletteProps } from '../types'

import { filterCommands, moveActive } from './palette-model'

/** Cmd+K palette: one input, one list. Arrow keys move, Enter runs, Esc closes. */
export function CommandPalette({ commands, onClose, onRun }: PaletteProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const matches = useMemo(() => filterCommands(commands, query), [commands, query])
  const activeCommand = matches[active] ?? null

  // Focus the input on open and hand focus back to whatever opened the palette.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null

    inputRef.current?.focus()

    return () => opener?.focus?.()
  }, [])

  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [active, listId])

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(current => moveActive(current, event.key === 'ArrowDown' ? 1 : -1, matches.length))
    } else if (event.key === 'Enter' && activeCommand) {
      event.preventDefault()
      onRun(activeCommand.id)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    } else if (event.key === 'Tab') {
      // The input owns focus; options are reached with the arrow keys.
      event.preventDefault()
    }
  }

  return (
    <div className="vp vp-overlay" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div aria-label={PALETTE_COPY.label} aria-modal="true" className="vp-sheet" onKeyDown={handleKeyDown} role="dialog">
        <input
          aria-activedescendant={activeCommand ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded="true"
          aria-label={PALETTE_COPY.label}
          className="vp-field"
          onChange={event => {
            setQuery(event.target.value)
            setActive(0)
          }}
          placeholder={PALETTE_COPY.placeholder}
          ref={inputRef}
          role="combobox"
          value={query}
        />
        <div className="vp-list">
          {matches.length === 0 ? (
            <p className="vp-muted" role="status">
              {PALETTE_COPY.noMatches}
            </p>
          ) : (
            <div id={listId} role="listbox">
              {matches.map((command, index) => (
                <button
                  aria-selected={index === active}
                  className="vp-opt"
                  id={`${listId}-${index}`}
                  key={command.id}
                  onClick={() => onRun(command.id)}
                  onMouseMove={() => active !== index && setActive(index)}
                  role="option"
                  tabIndex={-1}
                  type="button"
                >
                  <span>{command.label}</span>
                  <span className="vp-opt__hint">{command.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
