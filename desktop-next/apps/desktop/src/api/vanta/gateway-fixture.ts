import { VantaGateway } from '../vanta-gateway'

import { FakeVantaTransport } from './fake-transport'

export interface Harness {
  gateway: VantaGateway
  logs: string[]
  transport: FakeVantaTransport
}

let storedCounter = 0

/** A transport that answers the session lifecycle routes the way a healthy Vanta server does. */
export function healthyTransport(): FakeVantaTransport {
  return new FakeVantaTransport()
    .ok('GET /api/approval', null)
    .route('POST /api/sessions/new', () => ({ data: { id: `stored-${++storedCounter}` }, ok: true, status: 200 }))
    .ok('GET /api/status', { accessMode: 'approve', model: 'gpt-test', provider: 'openai', root: '/work/project' })
    .ok('POST /api/sessions/rename', { id: 'x', title: 'y' })
}

export async function connectedHarness(transport: FakeVantaTransport = healthyTransport()): Promise<Harness> {
  const logs: string[] = []
  const gateway = new VantaGateway({ approvalPollMs: 0, log: message => logs.push(message), transport })
  await gateway.connect('vanta://local')

  return { gateway, logs, transport }
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })

  return { promise, resolve }
}

export const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0))

export interface SessionCreated {
  info: Record<string, unknown>
  session_id: string
  stored_session_id: string
}

export async function newChat(harness: Harness): Promise<SessionCreated> {
  return harness.gateway.request<SessionCreated>('session.create', {})
}
