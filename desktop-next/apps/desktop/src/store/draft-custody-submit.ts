import type { ComposerAttachment } from './composer'
import type { CustodyReservation } from './draft-custody-client'

interface SubmitIdentity { runtimeSessionId: string; storedSessionId: string | null }
export interface CustodySubmitOptions {
  onAccepted?: (identity: SubmitIdentity) => void
  onDispatchStarted?: () => void
}

/** An acknowledged provider send wins over later local cleanup failure. No automatic resend. */
export async function runCustodiedSubmit(
  reservation: CustodyReservation,
  submit: (attachments: ComposerAttachment[], callbacks: CustodySubmitOptions) => Promise<unknown> | unknown,
  prepared?: () => boolean | void
): Promise<'accepted' | 'rejected' | 'unknown'> {
  const client = reservation.client
  if (!await client.begin(reservation)) return 'rejected'
  let accepted = false, dispatched = false
  try {
    if (prepared?.() === false) throw new Error('Captured composer changed before dispatch.')
    await submit(reservation.attachments, {
      onAccepted: () => { accepted = true },
      onDispatchStarted: () => { if (dispatched) throw new Error('An ambiguous submission cannot be retried automatically.'); dispatched = true }
    })
  } catch { /* Outcome comes from the actual request/ack boundary, not the wrapper's boolean. */ }
  await reservation.assignment
  const outcome = accepted ? 'accepted' : dispatched ? 'unknown' : 'rejected'
  await client.finish(reservation, outcome)
  return outcome
}
