import type { VantaTransport } from '@vanta/shared/vanta'

import {
  type ApprovalEvent,
  ApprovalEventSchema,
  type CompanyEvent,
  CompanyEventSchema,
  TypedFrameSchema
} from './vanta-company-schemas'

export type StreamSignal =
  | { event: ApprovalEvent; kind: 'approval' }
  | { event: CompanyEvent; kind: 'company' }
  | { kind: 'connection'; state: 'live' | 'offline' }

export type StreamListener = (signal: StreamSignal) => void

const FIRST_RETRY_MS = 1500
const MAX_RETRY_MS = 15_000

/** Turn one parsed SSE frame into a signal, or null for chat frames and anything unrecognised. */
export function signalFromFrame(frame: unknown): StreamSignal | null {
  const typed = TypedFrameSchema.safeParse(frame)

  if (!typed.success) {
    return null
  }

  const company = CompanyEventSchema.safeParse(typed.data.typed)

  if (company.success) {
    return { event: company.data, kind: 'company' }
  }

  const approval = ApprovalEventSchema.safeParse(typed.data.typed)

  return approval.success ? { event: approval.data, kind: 'approval' } : null
}

/**
 * Keep one event stream open for this client id, reconnecting with backoff when it drops.
 * Events are hints (the payloads match what GET returns), so a gap is repaired by the
 * consumer refetching when the connection comes back. Returns the function that stops it.
 */
export function openCompanyStream(transport: VantaTransport, clientId: string, listener: StreamListener): () => void {
  let stopped = false
  let delay = FIRST_RETRY_MS
  let timer: ReturnType<typeof setTimeout> | undefined
  let closeStream: (() => void) | undefined

  const connect = () => {
    closeStream = transport.openEvents(clientId, {
      onClose: () => {
        closeStream = undefined
        listener({ kind: 'connection', state: 'offline' })

        if (!stopped) {
          timer = setTimeout(connect, delay)
          delay = Math.min(delay * 2, MAX_RETRY_MS)
        }
      },
      onFrame: frame => {
        const signal = signalFromFrame(frame)

        if (signal) {
          listener(signal)
        }
      },
      onOpen: () => {
        delay = FIRST_RETRY_MS
        listener({ kind: 'connection', state: 'live' })
      }
    })
  }

  connect()

  return () => {
    stopped = true
    clearTimeout(timer)
    closeStream?.()
  }
}
