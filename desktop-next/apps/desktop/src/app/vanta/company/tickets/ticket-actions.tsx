import { useState } from 'react'

import type { CompanyWorker, TicketDetail } from '@/api/vanta-company-schemas'

import { VpButton } from '../../ui/button'
import { useCompany } from '../company-context'
import { VcSelect } from '../ui/vc-select'
import type { ActionState } from '../use-company-action'

import { closeGate } from './close-gate'

interface Props {
  action: ActionState
  detail: TicketDetail
}

function AssignControl({ action, detail, workers }: Props & { workers: CompanyWorker[] }) {
  const { api } = useCompany()
  const [workerId, setWorkerId] = useState(detail.workerId ?? '')

  const assign = () =>
    action.run(() => api.assign(detail.id, workerId), {
      done: data =>
        data.run?.started === false
          ? `Assigned. The run did not start: ${data.run.reason ?? 'the worker is busy'}. It is queued.`
          : 'Assigned.',
      needsApproval: true
    })

  return (
    <div className="vc-assign">
      <label className="vc-field">
        <span className="vc-field__label">Worker</span>
        <VcSelect
          disabled={action.busy}
          emptyLabel="Choose a worker"
          onChange={setWorkerId}
          options={workers.map(worker => ({ label: worker.name, value: worker.id }))}
          value={workerId}
        />
      </label>
      <VpButton disabled={action.busy || !workerId || workerId === detail.workerId} onClick={() => void assign()}>
        {detail.workerId ? 'Reassign' : 'Assign'}
      </VpButton>
    </div>
  )
}

function CloseControl({ action, detail }: Props) {
  const { api } = useCompany()
  const gate = closeGate(detail)
  const finished = detail.status === 'done' || detail.status === 'closed'
  const reasonId = `close-reason-${detail.id}`
  const close = (resolution: 'done' | 'wontfix', done: string) =>
    void action.run(() => api.close(detail.id, resolution), { done })

  return (
    <div className="vc-close">
      <div className="vp-acts">
        <VpButton
          aria-describedby={gate.reason ? reasonId : undefined}
          disabled={action.busy || !gate.canClose}
          onClick={() => close('done', `Closed ${detail.id}.`)}
          variant="primary"
        >
          Close ticket
        </VpButton>
        {!finished && (
          <VpButton disabled={action.busy} onClick={() => close('wontfix', `Closed ${detail.id} as won't fix.`)}>
            Won't fix
          </VpButton>
        )}
      </div>
      {gate.reason && (
        <p className="vp-note" data-testid="close-reason" id={reasonId}>
          {gate.reason}
        </p>
      )}
    </div>
  )
}

/** Assign, and Close. Close is locked, with the reason beside it, until the engine would accept it. */
export function TicketActions({ action, detail, workers }: Props & { workers: CompanyWorker[] }) {
  const finished = detail.status === 'done' || detail.status === 'closed'

  return (
    <div aria-label="Ticket actions" className="vc-actions" role="group">
      {!finished && <AssignControl action={action} detail={detail} workers={workers} />}
      <CloseControl action={action} detail={detail} />
    </div>
  )
}
