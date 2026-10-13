import { IconArrowUp, IconChevronDown, IconPlus } from '@tabler/icons-react'
import { type KeyboardEvent, useId } from 'react'

import { HOME_COPY } from '../copy'
import type { ProjectChip } from '../types'
import { VpButton } from '../ui/button'

interface HomeComposerProps {
  onProjectChange: (id: string) => void
  onSubmit: () => void
  onValueChange: (value: string) => void
  projectId: string | null
  projects: ProjectChip[]
  value: string
}

export function HomeComposer({ onProjectChange, onSubmit, onValueChange, projectId, projects, value }: HomeComposerProps) {
  const selectId = useId()
  const canSend = value.trim().length > 0

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className="vp-composer">
      <textarea
        aria-label={HOME_COPY.composerLabel}
        onChange={event => onValueChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={HOME_COPY.composerPlaceholder}
        rows={2}
        value={value}
      />
      <div className="vp-tools">
        <VpButton aria-label={HOME_COPY.attachLabel} variant="icon">
          <IconPlus aria-hidden size={16} stroke={1.75} />
        </VpButton>
        <span className="vp-grow" />
        {projects.length > 0 && (
          <span className="vp-select-wrap">
            <label className="sr-only" htmlFor={selectId}>
              {HOME_COPY.projectLabel}
            </label>
            <select
              className="vp-select"
              id={selectId}
              onChange={event => onProjectChange(event.target.value)}
              value={projectId ?? projects[0].id}
            >
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.name + HOME_COPY.projectSuffix}
                </option>
              ))}
            </select>
            <IconChevronDown aria-hidden size={12} stroke={2} />
          </span>
        )}
        <button
          aria-disabled={!canSend}
          aria-label={HOME_COPY.sendLabel}
          className="vp-send"
          onClick={() => canSend && onSubmit()}
          type="button"
        >
          <IconArrowUp aria-hidden size={16} stroke={2} />
        </button>
      </div>
    </div>
  )
}
