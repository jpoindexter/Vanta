import { type FormEvent, useState } from 'react'

import type { TicketDetail } from '@/api/vanta-company-schemas'

import { VpButton } from '../../ui/button'
import { useCompany } from '../company-context'
import { Field } from '../ui/field'
import type { ActionState } from '../use-company-action'

const KIND_LABEL = { blocker: 'Blocked', outcome: 'Missing artifact', review: 'Waiting for review' } as const

/** The worker's own question gets an Answer box; sending it restarts the worker with the answer. */
function AnswerForm({ action, ticketId }: { action: ActionState; ticketId: string }) {
  const { api } = useCompany()
  const [answer, setAnswer] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const text = answer.trim()
    const done = 'Answer sent. The worker is running again.'

    if (text && (await action.run(() => api.answer(ticketId, text), { done }))) {
      setAnswer('')
    }
  }

  return (
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
  )
}

/** What is stopping this ticket, and the Answer box when the worker is the one asking. */
export function TicketBlockers({ action, detail }: { action: ActionState; detail: TicketDetail }) {
  const asking = detail.status === 'blocked' && detail.blockers.some(item => item.kind === 'blocker')

  if (detail.blockers.length === 0) {
    return null
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
      {asking && <AnswerForm action={action} ticketId={detail.id} />}
    </section>
  )
}
