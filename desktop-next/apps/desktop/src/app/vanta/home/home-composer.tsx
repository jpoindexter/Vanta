import { IconArrowUp, IconPlus } from '@tabler/icons-react'
import type { KeyboardEvent } from 'react'

import { HOME_COPY } from '../copy'
import type { ProjectChip } from '../types'
import { VpButton } from '../ui/button'

import { ProjectPicker } from './project-picker'

interface HomeComposerProps {
  onProjectChange: (id: string) => void
  onSubmit: () => void
  onValueChange: (value: string) => void
  projectId: string | null
  projects: ProjectChip[]
  value: string
}

export function HomeComposer({ onProjectChange, onSubmit, onValueChange, projectId, projects, value }: HomeComposerProps) {
  const canSend = value.trim().length > 0

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className="vp-composer" data-testid="home-composer">
      <textarea
        aria-label={HOME_COPY.composerLabel}
        data-testid="home-composer-input"
        onChange={event => onValueChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={HOME_COPY.composerPlaceholder}
        rows={2}
        value={value}
      />
      <div className="vp-tools">
        <VpButton aria-label={HOME_COPY.attachLabel} data-testid="home-composer-attach" variant="icon">
          <IconPlus aria-hidden size={16} stroke={1.75} />
        </VpButton>
        <span className="vp-grow" />
        {projects.length > 0 && <ProjectPicker onChange={onProjectChange} projectId={projectId} projects={projects} />}
        <button
          aria-disabled={!canSend}
          aria-label={HOME_COPY.sendLabel}
          className="vp-send"
          data-testid="home-composer-send"
          onClick={() => canSend && onSubmit()}
          type="button"
        >
          <IconArrowUp aria-hidden size={16} stroke={2} />
        </button>
      </div>
    </div>
  )
}
