import { type FormEvent, useState } from 'react'

import type { TicketDetail } from '@/api/vanta-company-schemas'

import { VpButton } from '../../ui/button'
import { useCompany } from '../company-context'
import { clockTime } from '../format'
import { Field } from '../ui/field'
import type { ActionState } from '../use-company-action'

const KIND_WORD = { answer: 'Answer', comment: 'Comment', event: 'Event' } as const

/** The conversation on the ticket, oldest first, with a box to add to it. */
export function TicketThread({ action, detail }: { action: ActionState; detail: TicketDetail }) {
  const { api } = useCompany()
  const [text, setText] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()

    if (text.trim() && (await action.run(() => api.comment(detail.id, text.trim()), { done: 'Comment added.' }))) {
      setText('')
    }
  }

  return (
    <section aria-labelledby="thread-h" className="vc-block">
      <h3 id="thread-h">Thread</h3>
      {detail.thread.length === 0 && <p className="vp-note vp-note--flush">No comments yet.</p>}
      <ol className="vc-plain" data-testid="thread">
        {detail.thread.map((entry, index) => (
          <li key={`${entry.at}-${index}`}>
            <div className="vc-meta">
              <strong>{entry.author}</strong>
              <span className="vp-muted">{KIND_WORD[entry.kind]}</span>
              <span className="vp-muted">{clockTime(entry.at)}</span>
            </div>
            <div>{entry.text}</div>
          </li>
        ))}
      </ol>
      <form className="vc-form" onSubmit={submit}>
        <Field label="Add a comment">
          <textarea
            className="vc-input"
            disabled={action.busy}
            onChange={event => setText(event.target.value)}
            rows={2}
            value={text}
          />
        </Field>
        <div className="vp-acts">
          <VpButton disabled={action.busy || !text.trim()} type="submit">
            Comment
          </VpButton>
        </div>
      </form>
    </section>
  )
}
