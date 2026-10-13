import {
  IconAlertTriangle,
  IconBan,
  IconCircle,
  IconCircleCheck,
  IconCircleDashed,
  IconCircleDot,
  IconCircleX,
  IconEye,
  IconLoader2,
  IconPlayerPause,
  type TablerIcon
} from '@tabler/icons-react'

import type { BudgetLimit, TicketStatus, WorkerStatus } from '@/api/vanta-company-schemas'

import { TICKET_STATUS_WORD, WORKER_STATUS_WORD } from '../copy'

type Tone = 'attention' | 'danger' | 'quiet'

interface Entry {
  icon: TablerIcon
  spin?: boolean
  tone: Tone
  word: string
}

const WORKER: Record<WorkerStatus, Entry> = {
  failed: { icon: IconCircleX, tone: 'danger', word: WORKER_STATUS_WORD.failed },
  idle: { icon: IconCircle, tone: 'quiet', word: WORKER_STATUS_WORD.idle },
  paused: { icon: IconPlayerPause, tone: 'quiet', word: WORKER_STATUS_WORD.paused },
  waiting: { icon: IconAlertTriangle, tone: 'attention', word: WORKER_STATUS_WORD.waiting },
  working: { icon: IconLoader2, spin: true, tone: 'quiet', word: WORKER_STATUS_WORD.working }
}

const TICKET: Record<TicketStatus, Entry> = {
  assigned: { icon: IconCircleDot, tone: 'quiet', word: TICKET_STATUS_WORD.assigned },
  blocked: { icon: IconAlertTriangle, tone: 'attention', word: TICKET_STATUS_WORD.blocked },
  closed: { icon: IconBan, tone: 'quiet', word: TICKET_STATUS_WORD.closed },
  done: { icon: IconCircleCheck, tone: 'quiet', word: TICKET_STATUS_WORD.done },
  in_progress: { icon: IconLoader2, spin: true, tone: 'quiet', word: TICKET_STATUS_WORD.in_progress },
  in_review: { icon: IconEye, tone: 'attention', word: TICKET_STATUS_WORD.in_review },
  open: { icon: IconCircleDashed, tone: 'quiet', word: TICKET_STATUS_WORD.open }
}

const BUDGET: Record<BudgetLimit['status'], Entry> = {
  active: { icon: IconCircleCheck, tone: 'quiet', word: 'Within limit' },
  exceeded: { icon: IconBan, tone: 'danger', word: 'Stopped at limit' },
  warning: { icon: IconAlertTriangle, tone: 'attention', word: 'Near limit' }
}

/** A status as shape plus word. Colour only reinforces; the shape and the word carry the meaning. */
function Mark({ entry }: { entry: Entry }) {
  const Icon = entry.icon

  return (
    <span className="vc-mark" data-tone={entry.tone}>
      <Icon aria-hidden className={entry.spin ? 'vp-glyph vp-spin' : 'vp-glyph'} stroke={1.75} />
      <span>{entry.word}</span>
    </span>
  )
}

export const WorkerStatusMark = ({ status }: { status: WorkerStatus }) => <Mark entry={WORKER[status]} />
export const TicketStatusMark = ({ status }: { status: TicketStatus }) => <Mark entry={TICKET[status]} />
export const BudgetStatusMark = ({ status }: { status: BudgetLimit['status'] }) => <Mark entry={BUDGET[status]} />
