import { IconArrowUp, IconPlus } from '@tabler/icons-react'
import type { KeyboardEvent } from 'react'

import { HOME_COPY } from '../copy'
import type { ProjectChip } from '../types'
import { Button } from '@/components/ui/button'

import { ProjectPicker } from './project-picker'

interface HomeComposerProps {
  disabled?: boolean
  pending?: boolean
  blocked?: boolean
  attention?: string
  onAttach: () => void
  onProjectChange: (id: string) => void
  onSubmit: () => void
  onValueChange: (value: string) => void
  projectId: string | null
  projects: ProjectChip[]
  value: string
}

function HomeComposerInput({ disabled, blocked, pending, attention, onSubmit, onValueChange, value }: Pick<HomeComposerProps, 'disabled' | 'blocked' | 'pending' | 'attention' | 'onSubmit' | 'onValueChange' | 'value'>) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      if (!disabled && !pending && !blocked) onSubmit()
    }
  }

  return <textarea
    aria-label={HOME_COPY.composerLabel}
    aria-description={attention || (disabled ? 'Your chat is getting ready.' : undefined)}
    className="block min-h-11 w-full resize-none border-0 bg-transparent p-0.5 text-sm outline-none focus-visible:outline-none"
    data-testid="home-composer-input"
    data-vp="composer-input"
    disabled={disabled}
    onChange={event => onValueChange(event.target.value)}
    onKeyDown={handleKeyDown}
    placeholder={HOME_COPY.composerPlaceholder}
    rows={2}
    value={value}
  />
}

export function HomeComposer({ disabled, blocked: unavailable, pending, attention, onAttach, onProjectChange, onSubmit, onValueChange, projectId, projects, value }: HomeComposerProps) {
  const canSend = value.trim().length > 0
  const blocked = disabled || pending || unavailable
  return (
    <div
      className="desktop-input-chrome flex flex-col gap-2 rounded-surface border bg-background px-3 py-2.5"
      data-slot="composer-surface"
      data-testid="home-composer"
      data-vp="composer"
      aria-busy={pending || undefined}
    >
      <HomeComposerInput disabled={disabled} blocked={unavailable} pending={pending} attention={attention} onSubmit={onSubmit} onValueChange={onValueChange} value={value} />
      {attention && <p className="text-xs text-muted-foreground" role="status">{attention}</p>}
      <div className="flex flex-wrap items-center gap-1.5" data-slot="composer-controls">
        <Button aria-label={HOME_COPY.attachLabel} data-testid="home-composer-attach" disabled={blocked} onClick={onAttach} size="icon-sm" type="button" variant="ghost">
          <IconPlus aria-hidden size={16} stroke={1.75} />
        </Button>
        <span className="flex-1" />
        {projects.length > 0 && <ProjectPicker disabled={blocked} onChange={onProjectChange} projectId={projectId} projects={projects} />}
        <Button
          aria-disabled={!canSend || blocked}
          aria-label={HOME_COPY.sendLabel}
          className="rounded-pill"
          data-testid="home-composer-send"
          data-slot="composer-send"
          disabled={blocked}
          onClick={() => canSend && onSubmit()}
          size="icon-sm"
          type="button"
        >
          <IconArrowUp aria-hidden size={16} stroke={2} />
        </Button>
      </div>
    </div>
  )
}
