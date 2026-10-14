import { $sessionFacts, type ShellStatus, shellStatusFor } from '@/app/shell/vanta/session-status'
import { useI18n } from '@/i18n'
import { useStoreSelector } from '@/lib/use-session-slice'
import type { SessionDotState } from '@/store/session-dot-state'

import { StatusGlyph, statusWord } from './status-glyph'

const GLYPH_STATUSES: ReadonlySet<ShellStatus> = new Set(['failed', 'needs-input', 'running', 'waiting'])

/** The Vanta status of one chat, from its dot state and what it is blocked on. `null` when it shows no glyph (done, draft). */
export function useGlyphStatus(storedSessionId: null | string, dotState: SessionDotState): null | ShellStatus {
  const fact = useStoreSelector($sessionFacts, facts => (storedSessionId ? facts[storedSessionId] : undefined))
  const status = shellStatusFor(dotState, fact)

  return GLYPH_STATUSES.has(status) ? status : null
}

/** A status shape with its word as the accessible name and hover text: never colour alone. */
export function StatusMark({ status }: { status: ShellStatus }) {
  const { t } = useI18n()
  const word = statusWord(t.vantaShell.status, status)

  return (
    <span
      aria-label={word}
      className="inline-flex size-3.5 shrink-0 items-center justify-center"
      data-status={status}
      role="status"
      title={word}
    >
      <StatusGlyph status={status} />
    </span>
  )
}
