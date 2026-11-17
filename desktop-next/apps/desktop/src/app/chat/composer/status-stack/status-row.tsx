import { Fragment, memo, type ReactNode } from 'react'

import { openAgentTerminal } from '@/app/right-sidebar/terminal/terminals'
import { StatusRow } from '@/components/chat/status-row'
import { Codicon } from '@/components/ui/codicon'
import { GlyphSpinner } from '@/components/ui/glyph-spinner'
import { type Translations, useI18n } from '@/i18n'
import { Check } from '@/lib/icons'
import { capitalize } from '@/lib/text'
import type { TodoStatus } from '@/lib/todos'
import { cn } from '@/lib/utils'
import type { ComposerStatusItem } from '@/store/composer-status'

const toolLabel = (name: string) => name.split('_').filter(Boolean).map(capitalize).join(' ') || name

// Plan steps read as ink glyphs, the same three states as the wireframe: a filled circle with a check when
// done, a ring with a dot for the step in hand, an empty ring for what is still ahead. No hue carries meaning.
const STEP_GLYPH = 'size-4 shrink-0 rounded-full'

export function PlanStepGlyph({ live, status }: { live: boolean; status: TodoStatus }): ReactNode {
  if (status === 'completed') {
    return (
      <span aria-hidden className={cn(STEP_GLYPH, 'grid place-items-center bg-foreground text-background')}>
        <Check className="size-2.5" stroke={3} />
      </span>
    )
  }

  if (status === 'cancelled') {
    return <Codicon aria-hidden className="text-muted-foreground/45" name="circle-slash" size="0.8rem" />
  }

  if (status === 'in_progress') {
    return (
      <span aria-hidden className={cn(STEP_GLYPH, 'grid place-items-center border-2 border-foreground')}>
        <span className={cn('size-1.5 rounded-full bg-foreground', live && 'motion-safe:animate-pulse')} />
      </span>
    )
  }

  return <span aria-hidden className={cn(STEP_GLYPH, 'border border-muted-foreground/60')} />
}

// Left slot: braille spinner while running, otherwise a small status dot
// (green = done, red = failed) so the slot is always filled and rows align.
function leadingGlyph(item: ComposerStatusItem, s: Translations['statusStack'], historical = false): ReactNode {
  if (item.type === 'goal') {
    if (item.goalStatus === 'paused') {
      return <Codicon className="text-muted-foreground/60" name="debug-pause" size="0.8rem" />
    }

    if (item.goalStatus === 'done') {
      return <Codicon className="text-emerald-500/80" name="pass-filled" size="0.8rem" />
    }

    return (
      <GlyphSpinner
        ariaLabel={s.running}
        className="text-ui leading-none text-emerald-500/80"
        spinner="braille"
      />
    )
  }

  if (item.todoStatus) {
    // A retained snapshot is history: an interrupted step is not the live one.
    const status = historical && item.todoStatus === 'in_progress' ? 'pending' : item.todoStatus

    return <PlanStepGlyph live={!historical && item.state === 'running'} status={status} />
  }

  if (item.state === 'running') {
    return (
      <GlyphSpinner
        ariaLabel={s.running}
        className="text-ui leading-none text-muted-foreground/80"
        spinner="braille"
      />
    )
  }

  return (
    <span
      aria-hidden
      className={cn('size-1.5 rounded-full', item.state === 'failed' ? 'bg-destructive/80' : 'bg-emerald-500/70')}
    />
  )
}

interface StatusItemRowProps {
  item: ComposerStatusItem
  /** Render a retained, non-running task snapshot. */
  historical?: boolean
  /** Clear a finished background task from the stack. */
  onDismiss?: (id: string) => void
  /** Open the subagent's own session window, livestreamed by the gateway's
   *  child-session mirror (Agents view fallback for older gateways). */
  onOpen?: () => void
  /** Cancel a running background task. */
  onStop?: (id: string) => void
}

/**
 * Renders one {@link ComposerStatusItem} into the shared {@link StatusRow}.
 * Memoised + keyed by id so parent re-renders never remount it (the spinner
 * keeps ticking instead of resetting).
 */
export const StatusItemRow = memo(function StatusItemRow({
  historical = false,
  item,
  onDismiss,
  onOpen,
  onStop
}: StatusItemRowProps) {
  const { t } = useI18n()
  const s = t.statusStack
  const failed = item.state === 'failed'
  const running = item.state === 'running'

  const action =
    item.type === 'background'
      ? running
        ? onStop && { label: s.stop, onClick: () => onStop(item.id) }
        : onDismiss && { label: s.dismiss, onClick: () => onDismiss(item.id) }
      : null

  const canOpen = item.type === 'subagent' && !!onOpen

  // Background rows link to their read-only terminal tab; subagents open their session.
  const onActivate =
    item.type === 'background' ? () => openAgentTerminal(item.id, item.title) : canOpen ? onOpen : undefined

  return (
    <Fragment>
      <StatusRow
        depth={Math.min(item.depth ?? 0, 4)}
        dismiss={action ? { label: action.label, onDismiss: action.onClick } : undefined}
        leading={leadingGlyph(item, s, historical)}
        onActivate={onActivate}
        trailing={
          canOpen ? (
            <Codicon aria-hidden className="text-muted-foreground/55" name="link-external" size="0.85rem" />
          ) : undefined
        }
      >
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-meta leading-4',
            failed
              ? 'text-destructive/90'
              : item.todoStatus && item.todoStatus !== 'in_progress'
                ? 'text-muted-foreground/75'
                : 'text-foreground/92'
          )}
        >
          {item.title}
        </span>
        {item.type === 'subagent' && item.currentTool && (
          <span className="shrink-0 truncate text-meta leading-4 text-muted-foreground/70">
            {toolLabel(item.currentTool)}
          </span>
        )}
        {item.type === 'goal' && item.currentTool && (
          <span className="shrink-0 truncate text-meta leading-4 text-muted-foreground/70">
            {item.currentTool}
          </span>
        )}
        {failed && typeof item.exitCode === 'number' && item.exitCode !== 0 && (
          <span className="shrink-0 rounded bg-destructive/15 px-1 text-meta font-semibold text-destructive tabular-nums">
            {s.exit(item.exitCode)}
          </span>
        )}
      </StatusRow>
    </Fragment>
  )
})
