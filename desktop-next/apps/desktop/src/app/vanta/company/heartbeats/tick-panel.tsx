import { IconPlayerPlay } from '@tabler/icons-react'
import { useState } from 'react'

import type { TickReply } from '@/api/vanta-company-ops-schemas'

import { VpButton } from '../../ui/button'
import { useCompany } from '../company-context'
import { clockTime } from '../format'
import { ActionStatus } from '../ui/action-status'
import { useCompanyAction } from '../use-company-action'

import { beatLine } from './beat-words'

const EXPLAIN =
  'One cadence beat: each department with open goals and budget starts its next queued ticket. Nothing runs on a timer by itself.'

export function tickHeadline(reply: TickReply): string {
  const total = reply.beats.length

  if (total === 0) {
    return 'No departments exist, so nothing was advanced.'
  }

  return `Tick at ${clockTime(reply.at)}: ${reply.dispatched} of ${total} ${total === 1 ? 'department' : 'departments'} advanced.`
}

function TickResult({ reply }: { reply: TickReply }) {
  return (
    <div className="vc-tick" data-testid="tick-result" role="status">
      <strong>{tickHeadline(reply)}</strong>
      {reply.beats.length > 0 && (
        <ul aria-label="Department beats" className="vc-plain">
          {reply.beats.map(beat => (
            <li key={beat.departmentId}>{beatLine(beat)}</li>
          ))}
        </ul>
      )}
      {reply.warnings.map(warning => (
        <p className="vp-note vp-note--flush" key={warning}>
          {warning}
        </p>
      ))}
    </div>
  )
}

/** The Run tick button with its states: idle, running (and waiting for approval), result, error. */
export function TickPanel() {
  const { api } = useCompany()
  const action = useCompanyAction()
  const [reply, setReply] = useState<null | TickReply>(null)

  const run = () =>
    void action.run(
      async () => {
        const result = await api.runTick()

        if (result.ok) {
          setReply(result.data)
        }

        return result
      },
      { needsApproval: true }
    )

  return (
    <section aria-label="Run tick" className="vc-block">
      <div className="vc-toolbar">
        <p className="vp-muted">{EXPLAIN}</p>
        <VpButton aria-busy={action.busy} data-testid="tick-run" disabled={action.busy} onClick={run} variant="primary">
          <IconPlayerPlay aria-hidden className="vp-glyph" stroke={1.75} />
          {action.busy ? 'Running tick' : 'Run tick'}
        </VpButton>
      </div>
      {action.busy && (
        <p className="vp-note" role="status">
          Running the tick. If a worker needs your approval to start, it appears here.
        </p>
      )}
      <ActionStatus error={action.error} notice={null} />
      {reply && !action.busy && <TickResult reply={reply} />}
    </section>
  )
}
