import { IconAlertTriangleFilled, IconLoader2, IconX } from '@tabler/icons-react'

import type { ShellStatus } from '@/app/shell/vanta/session-status'
import type { Translations } from '@/i18n'

const GLYPH_SIZE = 14

/** The word for a status, or '' when the status shows nothing (done, draft). */
export function statusWord(copy: Translations['vantaShell']['status'], status: ShellStatus): string {
  switch (status) {
    case 'running':
      return copy.running

    case 'waiting':
      return copy.waiting

    case 'needs-input':
      return copy.needsInput

    case 'failed':
      return copy.failed

    case 'done':
      return copy.done

    default:
      return ''
  }
}

/** The shape a status shows in a row's lead cell. Shape carries the meaning:
 *  spinner running, triangle waiting, cross failed, nothing when done. */
export function StatusGlyph({ status }: { status: ShellStatus }) {
  switch (status) {
    case 'running':
      return <IconLoader2 aria-hidden className="vs-glyph-running" size={GLYPH_SIZE} />

    case 'waiting':
    case 'needs-input':
      return <IconAlertTriangleFilled aria-hidden className="vs-glyph-waiting" size={GLYPH_SIZE} />

    case 'failed':
      return <IconX aria-hidden className="vs-glyph-failed" size={GLYPH_SIZE} />

    case 'draft':
      return <span aria-hidden className="vs-glyph-draft" />

    default:
      return null
  }
}
