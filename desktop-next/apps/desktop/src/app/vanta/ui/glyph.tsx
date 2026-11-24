import {
  IconAlertTriangle,
  IconArrowsExchange,
  IconClock,
  IconFileText,
  IconLoader2,
  IconSparkles
} from '@tabler/icons-react'

import type { ListIconKind } from '../types'

const GLYPHS: Record<ListIconKind, typeof IconClock> = {
  attention: IconAlertTriangle,
  connection: IconArrowsExchange,
  file: IconFileText,
  running: IconLoader2,
  schedule: IconClock,
  skill: IconSparkles
}

/** Row leading icon. Shape carries meaning (triangle = needs attention), never colour alone. */
export function Glyph({ kind }: { kind: ListIconKind }) {
  const Icon = GLYPHS[kind]

  return <Icon aria-hidden className={kind === 'running' ? 'vp-glyph vp-spin' : 'vp-glyph'} stroke={1.75} />
}
