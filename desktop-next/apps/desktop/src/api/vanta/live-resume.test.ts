import { afterEach, expect, it, vi } from 'vitest'
import type { GatewayEvent } from '@vanta/shared'
import { VantaGateway } from '../vanta-gateway'
import { FakeVantaTransport } from './fake-transport'
import { deferred } from '@/test/deferred'

const live = { clientId: 'vanta-original', requestId: 'req-original', root: '/project', profile: 'writer', running: true }
const opened = { id: 'stored-original', title: 'Waiting task', messages: [{ role: 'user', content: 'Do the task' }], live }
const route = 'GET /api/sessions/live?storedId=stored-original&requestId=req-original'
const gateways: VantaGateway[] = []
afterEach(async () => {
  for (const gateway of gateways.splice(0)) {
    await gateway.request('session.close', { session_id: live.clientId }).catch(() => undefined)
    gateway.close()
  }
})
async function setup(snapshot: unknown, opening: unknown = opened) {
  const transport = new FakeVantaTransport().ok('GET /api/approval', null)
    .ok('POST /api/sessions/open', opening).ok('POST /api/chat/stop', {})
    .ok(route, snapshot)
  const log = vi.fn(), gateway = new VantaGateway({ transport, approvalPollMs: 25, log })
  const events: GatewayEvent[] = []
  gateway.onAny(event => events.push(event))
  gateways.push(gateway)
  await gateway.connect('vanta://local')
  return { gateway, transport, events, log }
}
const resume = (gateway: VantaGateway) => gateway.request('session.resume', { session_id: opened.id })
const completes = (events: GatewayEvent[]) => events.filter(event => event.type === 'message.complete')

it('recovers a completion that happened before stream attachment without sending the task again', async () => {
  const result = { finalText: 'Actual completed answer', sessionId: opened.id, stoppedReason: 'done' }
  const { gateway, transport, events } = await setup({ ...opened, live: { ...live, running: false, result } })
  expect(await resume(gateway)).toMatchObject({ running: false })
  await vi.waitFor(() => expect(completes(events)).toHaveLength(1))
  expect(completes(events)[0].payload).toMatchObject({ status: 'complete', text: result.finalText })
  expect(transport.opened).toEqual([live.clientId])
  expect(transport.callsTo('POST /api/chat')).toHaveLength(0)
  expect(transport.callsTo('GET /api/status')).toHaveLength(0)
})

it('uses the authoritative failed receipt when no HTTP chat response belongs to the new renderer', async () => {
  const result = { finalText: 'Partial output', sessionId: opened.id, stoppedReason: 'failed',
    receipt: { status: 'failed', failureKind: 'model', actions: ['retry_failed_step'], checkpoint: { instruction: 'Do the task', partialText: 'Partial output' } } }
  const { gateway, transport, events } = await setup({ ...opened, live: { ...live, running: false, result } })
  await resume(gateway)
  await vi.waitFor(() => expect(completes(events)).toHaveLength(1))
  expect(completes(events)[0].payload).toMatchObject({ status: 'error', partial: true,
    error_surface: { code: 'model', recovery: { actions: ['retry_failed_step'] } } })
  expect(transport.callsTo('POST /api/chat')).toHaveLength(0)
})

it.each(['id', 'requestId', 'root', 'profile'] as const)('does not treat a mismatched %s readback as completion', async field => {
  const snapshot = { ...opened, live: { ...live } }
  if (field === 'id') snapshot.id = 'another-stored-chat'
  else snapshot.live[field] = 'another-identity'
  const { gateway, transport, events, log } = await setup(snapshot)
  await resume(gateway)
  await vi.waitFor(() => expect(log).toHaveBeenCalled())
  expect(completes(events)).toHaveLength(0)
  expect(await resume(gateway)).toMatchObject({ running: true, session_id: live.clientId })
  expect(transport.callsTo('POST /api/chat')).toHaveLength(0)
})

it('rejects idle-without-result instead of inventing successful completion', async () => {
  const malformed = { ...opened, live: { ...live, running: false } }
  const { gateway, events, transport } = await setup(malformed, malformed)
  await expect(resume(gateway)).rejects.toThrow('unexpected response')
  expect(completes(events)).toHaveLength(0)
  expect(transport.opened).toHaveLength(0)
})

it('preserves an initial terminal failure and its saved history without appending it twice', async () => {
  const result = { finalText: 'Partial output', stoppedReason: 'failed', receipt: {
    status: 'failed', failureKind: 'model', actions: ['retry_failed_step'] } }
  const terminal = { ...opened, messages: [...opened.messages, { role: 'assistant', content: result.finalText }],
    live: { ...live, running: false, result } }
  const { gateway, events } = await setup(terminal, terminal)
  expect(await resume(gateway)).toMatchObject({ running: false })
  expect(completes(events)).toHaveLength(1)
  expect(completes(events)[0].payload).toMatchObject({ status: 'error', error_surface: { code: 'model' } })
  const history = await gateway.request<{ messages: unknown[] }>('session.history', { session_id: live.clientId })
  expect(history.messages).toHaveLength(2)
})

it('coalesces concurrent opens so a late response cannot resurrect a completed request', async () => {
  const terminal = { ...opened, live: { ...live, running: false, result: { finalText: 'Done', stoppedReason: 'done' } } }
  const { gateway, transport, events } = await setup(terminal)
  const first = deferred<{ data: unknown; ok: boolean; status: number }>()
  const late = deferred<{ data: unknown; ok: boolean; status: number }>()
  let opens = 0
  transport.route('POST /api/sessions/open', () => (++opens === 1 ? first.promise : late.promise))
  const one = resume(gateway), two = resume(gateway)
  try {
    await vi.waitFor(() => expect(opens).toBeGreaterThan(0))
    first.resolve({ data: opened, ok: true, status: 200 })
    await one
    late.resolve({ data: opened, ok: true, status: 200 })
    await two
    expect(completes(events)).toHaveLength(1)
    expect(opens).toBe(1)
  } finally {
    first.resolve({ data: opened, ok: true, status: 200 })
    late.resolve({ data: opened, ok: true, status: 200 })
    await Promise.allSettled([one, two])
  }
})

it('stops recovered observation on close and observes the same request again on reconnect', async () => {
  const { gateway, transport } = await setup(opened)
  await resume(gateway)
  gateway.close()
  const count = transport.callsTo(route).length
  await new Promise(resolve => setTimeout(resolve, 80))
  expect(transport.callsTo(route)).toHaveLength(count)
  await gateway.connect('vanta://local')
  await vi.waitFor(() => expect(transport.callsTo(route).length).toBeGreaterThan(count))
  expect(transport.callsTo('POST /api/chat')).toHaveLength(0)
})

it('removes a failed recovery probe so a later resume can open cleanly', async () => {
  const { gateway, transport } = await setup(opened)
  transport.route('POST /api/sessions/open', () => { throw new Error('connection lost') })
  await expect(resume(gateway)).rejects.toThrow('connection lost')
  const core = (gateway as unknown as { vanta: { registry: { all(): unknown[] } } }).vanta
  expect(core.registry.all()).toHaveLength(0)
  transport.ok('POST /api/sessions/open', opened)
  expect(await resume(gateway)).toMatchObject({ running: true })
})

it('does not emit the same initial terminal request again on a sequential reopen', async () => {
  const terminal = { ...opened, live: { ...live, running: false, result: { finalText: 'Done', stoppedReason: 'done' } } }
  const { gateway, events } = await setup(terminal, terminal)
  await resume(gateway)
  await resume(gateway)
  expect(completes(events)).toHaveLength(1)
})

it.each(['open', 'readback'] as const)('does not attach or emit recovery after close during %s', async stage => {
  const { gateway, transport, events } = await setup(opened)
  const delayed = deferred<{ data: unknown; ok: boolean; status: number }>()
  const key = stage === 'open' ? 'POST /api/sessions/open' : route
  transport.route(key, () => delayed.promise)
  const result = resume(gateway)
  const rejected = expect(result).rejects.toThrow(/connection changed/)
  await vi.waitFor(() => expect(transport.callsTo(key)).toHaveLength(1))
  gateway.close()
  delayed.resolve({ data: opened, ok: true, status: 200 })
  await rejected
  expect(transport.streams.size).toBe(0)
  expect(completes(events)).toHaveLength(0)
  const count = transport.callsTo(route).length
  await new Promise(resolve => setTimeout(resolve, 80))
  expect(transport.callsTo(route)).toHaveLength(count)
})

it('leaves a new normal turn approval poll intact after a recovered turn finishes', async () => {
  const terminal = { ...opened, live: { ...live, running: false, result: { finalText: 'Done', stoppedReason: 'done' } } }
  const { gateway, transport } = await setup(terminal)
  await resume(gateway)
  const chat = deferred<{ data: unknown; ok: boolean; status: number }>()
  transport.route('POST /api/chat', () => chat.promise)
  try {
    await gateway.request('prompt.submit', { session_id: live.clientId, text: 'Another task' })
    gateway.close()
    await gateway.connect('vanta://local')
    const count = transport.callsTo('GET /api/approval').length
    await vi.waitFor(() => expect(transport.callsTo('GET /api/approval').length).toBeGreaterThan(count))
  } finally {
    chat.resolve({ data: { finalText: 'Finished' }, ok: true, status: 200 })
    await vi.waitFor(() => expect(transport.callsTo('POST /api/chat')).toHaveLength(1))
  }
})

it('refuses an old opening response when a newer local turn completed during the request', async () => {
  const terminal = { ...opened, live: { ...live, running: false, result: { finalText: 'Old answer', stoppedReason: 'done' } } }
  const { gateway, transport, events } = await setup(terminal, terminal)
  await resume(gateway)
  const delayed = deferred<{ data: unknown; ok: boolean; status: number }>()
  transport.route('POST /api/sessions/open', () => delayed.promise)
  const stale = resume(gateway)
  const rejected = expect(stale).rejects.toThrow(/chat changed/)
  transport.ok('POST /api/chat', { finalText: 'New answer', stoppedReason: 'done' })
  await gateway.request('prompt.submit', { session_id: live.clientId, text: 'New task' })
  await vi.waitFor(() => expect(completes(events)).toHaveLength(2))
  delayed.resolve({ data: terminal, ok: true, status: 200 })
  await rejected
  expect(completes(events)).toHaveLength(2)
  const history = await gateway.request<{ messages: { text: string }[] }>('session.history', { session_id: live.clientId })
  expect(history.messages.at(-1)?.text).toBe('New answer')
})
