import { type FormEvent, useState } from 'react'

import type { TicketDetail } from '@/api/vanta-company-schemas'

import { VpButton } from '../../ui/button'
import { useCompany } from '../company-context'
import { Field } from '../ui/field'
import type { ActionState } from '../use-company-action'

const KIND_LABEL = { blocker: 'Blocked', outcome: 'Missing artifact', review: 'Waiting for review' } as const

/** What is stopping this ticket. A worker's own question gets an Answer box that restarts the worker. */
export function TicketBlockers({ action, detail }: { action: ActionState; detail: TicketDetail }) {
  const { api } = useCompany()
  const [answer, setAnswer] = useState('')
  const asking = detail.status === 'blocked' && detail.blockers.some(item => item.kind === 'blocker')

  if (detail.blockers.length === 0) {
    return null
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()

    if (
      answer.trim() &&
      (await action.run(() => api.answer(detail.id, answer.trim()), {
        done: 'Answer sent. The worker is running again.'
      }))
    ) {
      setAnswer('')
    }
  }

  return (
    <section aria-labelledby="blockers-h" className="vc-block">
      <h3 id="blockers-h">Blockers</h3>
      <ul className="vc-plain">
        {detail.blockers.map((item, index) => (
          <li key={`${item.kind}-${index}`}>
            <strong>{KIND_LABEL[item.kind]}.</strong> {item.text}
          </li>
        ))}
      </ul>
      {asking && (
        <form className="vc-form" onSubmit={submit}>
          <Field label="Your answer">
            <textarea
              className="vc-input"
              disabled={action.busy}
              onChange={event => setAnswer(event.target.value)}
              rows={3}
              value={answer}
            />
          </Field>
          <div className="vp-acts">
            <VpButton disabled={action.busy || !answer.trim()} type="submit" variant="primary">
              Send answer
            </VpButton>
          </div>
        </form>
      )}
    </section>
  )
}
