import type { GatewayEvent, GatewayEventName, ServerRequest } from '@vanta/shared'
import type { VantaResult } from '@vanta/shared/vanta'
import { act, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { deferred } from '@/test/deferred'
import { renderMessageStream } from '@/app/session/hooks/use-message-stream/test-harness'

import { VantaGateway } from '../vanta-gateway'
import { FakeVantaTransport } from './fake-transport'

const gateways: VantaGateway[] = []
const pending: Array<ReturnType<typeof deferred<VantaResult>>> = []
afterEach(async () => {
  cleanup()
  gateways.splice(0).forEach(gateway => gateway.close())
  pending.splice(0).forEach(result => result.resolve({ ok: true, status: 200, data: { finalText: '' } }))
  await Promise.resolve()
})

async function setup() {
  const transport = new FakeVantaTransport().ok('GET /api/approval', null)
    .ok('GET /api/status', {}).ok('POST /api/sessions/new', { id: 'stored' })
  const gateway = new VantaGateway({ transport, approvalPollMs: 0, log: () => undefined })
  gateways.push(gateway)
  const events: GatewayEvent[] = [], approvals: ServerRequest[] = []
  gateway.onAny(event => events.push(event))
  gateway.onRequest(request => { approvals.push(request) })
  await gateway.connect('vanta://local')
  const chat = await gateway.request<{ session_id: string }>('session.create', {})
  const start = async (text: string) => {
    const result = deferred<VantaResult>()
    pending.push(result)
    transport.route('POST /api/chat', () => result.promise)
    await gateway.request('prompt.submit', { session_id: chat.session_id, text })
    const requestId = (transport.callsTo('POST /api/chat').at(-1)!.body as { requestId: string }).requestId
    return { requestId, finish: (finalText: string, usage?: { inputTokens: number; outputTokens: number }) =>
      result.resolve({ ok: true, status: 200, data: { finalText, usage } }) }
  }
  return { gateway, transport, events, approvals, start, id: chat.session_id,
    push: (frame: unknown) => transport.push(chat.session_id, frame) }
}

const complete = (text: string) => ({ typed: { type: 'turn.complete', sessionId: 'stored', finalText: text, stoppedReason: 'done' } })
const started = (requestId: string, sessionId = 'stored') => ({ turnStarted: { requestId, sessionId } })
const usage = (inputTokens: number) => ({ typed: { type: 'usage', reported: true, inputTokens, outputTokens: 2, contextTokens: 3, contextWindow: 100 } })
const todoStart = (text: string) => ({ typed: { type: 'tool.start', id: 'same-tool-id', name: 'todo', args: { action: 'write', items: [{ text }] } } })
const todoEnd = () => ({ typed: { type: 'tool.complete', id: 'same-tool-id', name: 'todo', ok: true, output: 'saved' } })
const approval = (id: string) => ({ typed: { type: 'approval.request', approval: { id, action: 'edit fixture', reason: 'fixture', toolName: 'edit_file' } } })
const eventsOf = <K extends GatewayEventName>(events: GatewayEvent[], type: K) =>
  events.filter((event): event is GatewayEvent<K> => event.type === type)
const completions = (events: GatewayEvent[]) => eventsOf(events, 'message.complete')

it('rejects old prose, plan, usage, approval and terminal before they mutate the next turn', async () => {
  const ctx = await setup(), first = await ctx.start('first')
  ctx.push(started(first.requestId))
  first.finish('first answer')
  await vi.waitFor(() => expect(completions(ctx.events)).toHaveLength(1))
  const second = await ctx.start('second'), before = ctx.events.length
  ctx.push({ delta: 'stale first answer tail' })
  ctx.push(usage(900))
  ctx.push(todoStart('stale first plan'))
  ctx.push(approval('stale-approval'))
  ctx.push(complete('first answer'))
  expect(ctx.events).toHaveLength(before)
  expect(ctx.approvals).toHaveLength(0)
  expect(completions(ctx.events)).toHaveLength(1)
  ctx.push(started(second.requestId))
  ctx.push({ delta: 'second answer' })
  ctx.push(usage(1))
  ctx.push(todoEnd())
  expect(eventsOf(ctx.events, 'session.usage').at(-1)?.payload?.usage)
    .toMatchObject({ calls: 1, input: 1, output: 2 })
  expect(eventsOf(ctx.events, 'tool.complete').at(-1)?.payload?.todos).toBeUndefined()
  ctx.push(todoStart('second plan'))
  ctx.push(todoEnd())
  expect(eventsOf(ctx.events, 'tool.complete').at(-1)?.payload?.todos)
    .toEqual([{ id: '1', content: 'second plan', status: 'pending' }])
  ctx.push(complete('second answer'))
  expect(completions(ctx.events).map(event => event.payload?.text)).toEqual(['first answer', 'second answer'])
  expect(ctx.transport.callsTo('POST /api/chat')).toHaveLength(2)
})

it('keeps normal current-request SSE completion, approvals and resolution ahead of HTTP', async () => {
  const ctx = await setup(), turn = await ctx.start('current')
  ctx.push(started(turn.requestId))
  ctx.push({ delta: 'current reply' })
  ctx.push(approval('current-approval'))
  ctx.push({ typed: { type: 'approval.resolved', id: 'current-approval' } })
  expect(ctx.approvals).toHaveLength(1)
  expect(eventsOf(ctx.events, 'approval.cancelled').at(0)?.payload?.request_ids).toEqual(['current-approval'])
  ctx.push(complete('current reply'))
  turn.finish('current reply')
  await Promise.resolve()
  expect(completions(ctx.events)).toHaveLength(1)
  expect(eventsOf(ctx.events, 'message.delta').at(0)?.payload?.text).toBe('current reply')
})

it.each([false, true])('clears an exact old announced approval after HTTP settlement, next turn=%s', async nextTurn => {
  const ctx = await setup(), first = await ctx.start('first')
  ctx.push(started(first.requestId))
  ctx.push(approval('first-approval'))
  expect(ctx.approvals).toHaveLength(1)
  first.finish('first answer')
  await vi.waitFor(() => expect(completions(ctx.events)).toHaveLength(1))
  if (nextTurn) await ctx.start('second')
  ctx.push({ typed: { type: 'approval.resolved', id: 'unannounced-id' } })
  expect(ctx.events.filter(event => event.type === 'approval.cancelled')).toHaveLength(0)
  ctx.push({ typed: { type: 'approval.resolved', id: 'first-approval' } })
  expect(eventsOf(ctx.events, 'approval.cancelled').map(event => event.payload?.request_ids))
    .toEqual([['first-approval']])
  expect(completions(ctx.events)).toHaveLength(1)
})

it('leaves missing-start legacy frames unverified while the original HTTP result still settles the turn', async () => {
  const ctx = await setup(), turn = await ctx.start('legacy')
  const before = ctx.events.length
  ctx.push({ delta: 'unbound text' })
  ctx.push(complete('unbound text'))
  expect(ctx.events).toHaveLength(before)
  turn.finish('authoritative legacy answer')
  await vi.waitFor(() => expect(completions(ctx.events)).toHaveLength(1))
  expect(completions(ctx.events)[0].payload?.text).toBe('authoritative legacy answer')
  expect(ctx.transport.callsTo('POST /api/chat')).toHaveLength(1)
})

it('keeps settled A usage in the actual renderer session total when B streams after A HTTP', async () => {
  const ctx = await setup(), consumer = renderMessageStream(ctx.id)
  ctx.gateway.onAny(event => act(() => consumer.handleEvent(event)))
  const first = await ctx.start('first')
  ctx.push(started(first.requestId))
  await act(async () => { first.finish('first answer', { inputTokens: 5, outputTokens: 2 }) })
  expect(consumer.state().usage).toMatchObject({ input: 5, output: 2 })
  ctx.push({ typed: { type: 'usage', sessionId: 'stored', reported: true, inputTokens: 5, outputTokens: 2, contextTokens: 3, contextWindow: 100 } })
  const second = await ctx.start('second')
  ctx.push(started(second.requestId))
  ctx.push({ typed: { type: 'usage', sessionId: 'stored', reported: true, inputTokens: 7, outputTokens: 3, contextTokens: 4, contextWindow: 100 } })
  expect(consumer.state().usage).toMatchObject({ calls: 2, input: 12, output: 5, total: 17 })
})

it.each([{ inputs: [5] }, { inputs: [2, 3] }])('retains ordered session accounting after both HTTP results settle: $inputs', async ({ inputs }) => {
  const ctx = await setup(), consumer = renderMessageStream(ctx.id)
  ctx.gateway.onAny(event => act(() => consumer.handleEvent(event)))
  const first = await ctx.start('first')
  ctx.push(started(first.requestId))
  await act(async () => { first.finish('first answer', { inputTokens: inputs.at(-1)!, outputTokens: 2 }) })
  const second = await ctx.start('second')
  await act(async () => { second.finish('second answer', { inputTokens: 7, outputTokens: 3 }) })
  for (const inputTokens of inputs) ctx.push({ delta: 'stale prose must not appear', typed: {
    type: 'usage', sessionId: 'stored', reported: true, inputTokens, outputTokens: 2, contextTokens: 3, contextWindow: 100
  } })
  ctx.push(complete('first answer'))
  ctx.push(started(second.requestId))
  ctx.push({ typed: { type: 'usage', sessionId: 'stored', reported: true, inputTokens: 7, outputTokens: 3, contextTokens: 4, contextWindow: 100 } })
  ctx.push(complete('second answer'))
  expect(completions(ctx.events).map(event => event.payload?.text)).toEqual(['first answer', 'second answer'])
  expect(ctx.events.filter(event => event.type === 'message.delta')).toHaveLength(0)
  expect(consumer.state().usage).toMatchObject({ calls: inputs.length + 1, input: 12, output: inputs.length * 2 + 3, context_used: 4 })
  expect(ctx.transport.callsTo('POST /api/chat')).toHaveLength(2)
})

it('rejects foreign or missing-session late accounting rather than borrowing the current stored chat', async () => {
  const ctx = await setup(), first = await ctx.start('first')
  ctx.push(started(first.requestId))
  first.finish('first answer')
  await vi.waitFor(() => expect(completions(ctx.events)).toHaveLength(1))
  const before = ctx.events.length
  ctx.push(usage(900))
  ctx.push({ typed: { type: 'usage', sessionId: 'foreign-stored', reported: true, inputTokens: 900 } })
  expect(ctx.events).toHaveLength(before)
})

it('binds a fresh reconnect to its exact preexisting request when its start frame was missed', async () => {
  const ctx = await setup(), turn = await ctx.start('reconnect')
  ctx.gateway.close()
  await ctx.gateway.connect('vanta://local')
  ctx.push({ delta: 'recovered reply' })
  ctx.push(complete('recovered reply'))
  expect(completions(ctx.events).map(event => event.payload?.text)).toEqual(['recovered reply'])
  expect(eventsOf(ctx.events, 'message.delta').at(0)?.payload?.text).toBe('recovered reply')
  turn.finish('recovered reply')
  expect(ctx.transport.callsTo('POST /api/chat')).toHaveLength(1)
})

it('streams an identity-validated adopted turn without requiring its missed start frame or another POST', async () => {
  const ctx = await setup()
  const live = { clientId: 'original-client', requestId: 'original-request', root: '/project', profile: 'default', running: true }
  const opened = { id: 'adopted-stored', messages: [{ role: 'user', content: 'original task' }], live }
  ctx.transport.ok('POST /api/sessions/open', opened)
    .ok('GET /api/sessions/live?storedId=adopted-stored&requestId=original-request', opened)
  await ctx.gateway.request('session.resume', { session_id: opened.id })
  ctx.transport.push(live.clientId, { delta: 'adopted reply' })
  ctx.transport.push(live.clientId, { typed: { type: 'turn.complete', sessionId: opened.id, finalText: 'adopted reply', stoppedReason: 'done' } })
  expect(completions(ctx.events).map(event => event.payload?.text)).toEqual(['adopted reply'])
  expect(eventsOf(ctx.events, 'message.delta').at(0)?.payload?.text).toBe('adopted reply')
  expect(ctx.transport.callsTo('POST /api/chat')).toHaveLength(0)
})

it.each([false, true])('rebinds validated idle known-client adoption without relabeling old backlog, previous cursor=%s', async previous => {
  const ctx = await setup()
  if (previous) {
    const first = await ctx.start('previous request')
    ctx.push(started(first.requestId))
    first.finish('previous answer')
    await vi.waitFor(() => expect(completions(ctx.events)).toHaveLength(1))
  }
  const old = ctx.transport.streams.get(ctx.id)!, posts = ctx.transport.callsTo('POST /api/chat').length
  const live = { clientId: ctx.id, requestId: 'adopted-existing-request', root: '/project', profile: 'default', running: true }
  const opened = { id: 'stored', messages: [{ role: 'user', content: 'existing live task' }], live }
  ctx.transport.ok('POST /api/sessions/open', opened)
    .ok('GET /api/sessions/live?storedId=stored&requestId=adopted-existing-request', opened)
  await ctx.gateway.request('session.resume', { session_id: opened.id })
  expect(ctx.transport.opened).toEqual([ctx.id, ctx.id])
  const before = ctx.events.length
  old.onFrame({ delta: 'stale old attachment' })
  old.onFrame({ typed: { type: 'usage', sessionId: 'stored', reported: true, inputTokens: 900 } })
  old.onFrame(complete('stale old terminal'))
  expect(ctx.events).toHaveLength(before)
  ctx.push({ delta: 'known-client adopted reply' })
  ctx.push(complete('known-client adopted reply'))
  expect(eventsOf(ctx.events.slice(before), 'message.delta').map(event => event.payload?.text)).toEqual(['known-client adopted reply'])
  expect(completions(ctx.events.slice(before)).map(event => event.payload?.text)).toEqual(['known-client adopted reply'])
  expect(ctx.transport.callsTo('POST /api/chat')).toHaveLength(posts)
})

it('keeps the same active validated request attachment idempotent', async () => {
  const ctx = await setup(), turn = await ctx.start('already running')
  ctx.push(started(turn.requestId))
  const original = ctx.transport.streams.get(ctx.id)
  const live = { clientId: ctx.id, requestId: turn.requestId, root: '/project', profile: 'default', running: true }
  const opened = { id: 'stored', messages: [{ role: 'user', content: 'already running' }], live }
  ctx.transport.ok('POST /api/sessions/open', opened)
    .ok(`GET /api/sessions/live?storedId=stored&requestId=${turn.requestId}`, opened)
  await ctx.gateway.request('session.resume', { session_id: opened.id })
  expect(ctx.transport.opened).toEqual([ctx.id])
  expect(ctx.transport.streams.get(ctx.id)).toBe(original)
  ctx.push({ delta: 'original live reply' })
  ctx.push(complete('original live reply'))
  expect(completions(ctx.events).map(event => event.payload?.text)).toEqual(['original live reply'])
  expect(ctx.transport.callsTo('POST /api/chat')).toHaveLength(1)
})

it('rejects a foreign-session terminal even after the current request start was observed', async () => {
  const ctx = await setup(), turn = await ctx.start('current')
  ctx.push(started(turn.requestId))
  ctx.push({ typed: { type: 'turn.complete', sessionId: 'foreign-stored', finalText: 'foreign answer', stoppedReason: 'done' } })
  expect(completions(ctx.events)).toHaveLength(0)
  ctx.push(complete('current answer'))
  expect(completions(ctx.events)[0].payload?.text).toBe('current answer')
})

it('ignores abandoned stream callbacks before they change usage or ownership', async () => {
  const ctx = await setup(), turn = await ctx.start('reconnect')
  const old = ctx.transport.streams.get(ctx.id)!
  ctx.gateway.close()
  await ctx.gateway.connect('vanta://local')
  const before = ctx.events.length
  old.onFrame(started('foreign-request'))
  old.onFrame(usage(900))
  old.onFrame(complete('old answer'))
  expect(ctx.events).toHaveLength(before)
  ctx.push(usage(1))
  expect(eventsOf(ctx.events, 'session.usage').at(-1)?.payload?.usage).toMatchObject({ calls: 1, input: 1 })
  ctx.push(complete('current answer'))
  expect(completions(ctx.events).map(event => event.payload?.text)).toEqual(['current answer'])
  turn.finish('current answer')
})

it.each(['request', 'session'])('rejects a conflicting %s start until the actual request is announced', async conflict => {
  const ctx = await setup(), turn = await ctx.start('current')
  ctx.push(started(conflict === 'request' ? 'foreign-request' : turn.requestId, conflict === 'session' ? 'foreign-stored' : 'stored'))
  ctx.push({ delta: 'foreign reply' })
  ctx.push(complete('foreign reply'))
  expect(completions(ctx.events)).toHaveLength(0)
  expect(ctx.events.filter(event => event.type === 'message.delta')).toHaveLength(0)
  ctx.push(started(turn.requestId))
  ctx.push(complete('current answer'))
  expect(completions(ctx.events)[0].payload?.text).toBe('current answer')
})
