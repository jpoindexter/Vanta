import type { GatewayEvent, ServerRequest } from '@hermes/shared'
import { describe, expect, it } from 'vitest'

import { VantaGateway } from './vanta-gateway'
import { connectedHarness, flush, healthyTransport, newChat } from './vanta/gateway-fixture'

const approval = (overrides: Record<string, unknown> = {}) => ({
  action: 'rm -rf build',
  id: '1700000000000',
  reason: 'Deletes the build output',
  request: {
    canRemember: true,
    fresh: false,
    kind: 'bash',
    reason: 'Deletes the build output',
    subject: 'rm -rf build',
    title: 'Bash permission request'
  },
  toolName: 'shell_cmd',
  ...overrides
})

const pushApproval = (transport: ReturnType<typeof healthyTransport>, clientId: string, value = approval()) =>
  transport.push(clientId, { typed: { approval: value, type: 'approval.request' } })

async function withHandler(transportSetup?: (t: ReturnType<typeof healthyTransport>) => void) {
  const transport = healthyTransport()
  transportSetup?.(transport)
  const harness = await connectedHarness(transport)
  const requests: ServerRequest[] = []
  harness.gateway.onRequest(request => {
    requests.push(request)
  })

  return { ...harness, requests, chat: await newChat(harness) }
}

describe('approvals', () => {
  it('pushes a server-to-client approval request with the exact action and the right choices', async () => {
    const { chat, requests, transport } = await withHandler()

    pushApproval(transport, chat.session_id)

    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      id: `approval:${chat.session_id}:1700000000000`,
      method: 'approval',
      params: {
        allow_permanent: true,
        choices: ['once', 'always', 'deny'],
        command: 'rm -rf build',
        description: 'Deletes the build output',
        request_id: '1700000000000',
        session_id: chat.session_id,
        tool_name: 'shell_cmd'
      }
    })
    expect(requests[0]?.params.vanta_request).toMatchObject({ kind: 'bash', subject: 'rm -rf build' })
  })

  it('round trips: Always from the card posts the decision for that chat and the pending request clears', async () => {
    const { chat, requests, transport } = await withHandler(t => t.ok('POST /api/approval', { ok: true }))

    pushApproval(transport, chat.session_id)
    requests[0]?.respond({ choice: 'always' })
    await flush()

    expect(transport.callsTo('POST /api/approval')[0]).toMatchObject({
      body: { decision: 'always', id: '1700000000000' },
      clientId: chat.session_id
    })
  })

  it('maps once to allow, session to a one-time allow, deny to deny and never to never', async () => {
    const { chat, gateway, transport } = await withHandler(t => t.ok('POST /api/approval', { ok: true }))
    const cases: Array<[string, string]> = [
      ['once', 'allow'],
      ['session', 'allow'],
      ['deny', 'deny'],
      ['never', 'never']
    ]

    for (const [choice] of cases) {
      await gateway.request('approval.respond', { choice, request_id: 'r', session_id: chat.session_id })
    }

    expect(transport.callsTo('POST /api/approval').map(c => (c.body as { decision: string }).decision)).toEqual(
      cases.map(([, decision]) => decision)
    )
  })

  it('does not offer Always when the server says a saved rule cannot replace this approval', async () => {
    const { chat, requests, transport } = await withHandler()

    pushApproval(
      transport,
      chat.session_id,
      approval({
        request: { canRemember: false, fresh: true, kind: 'bash', subject: 'deploy', reason: 'r', title: 't' }
      })
    )

    expect(requests[0]?.params).toMatchObject({ allow_permanent: false, choices: ['once', 'deny'] })
  })

  it('announces a given approval once even when it is pushed twice', async () => {
    const { chat, requests, transport } = await withHandler()

    pushApproval(transport, chat.session_id)
    pushApproval(transport, chat.session_id)

    expect(requests).toHaveLength(1)
  })

  it('ignores an answer with an unknown choice and says so', async () => {
    const { chat, logs, requests, transport } = await withHandler(t => t.ok('POST /api/approval', { ok: true }))

    pushApproval(transport, chat.session_id)
    requests[0]?.respond({ choice: 'maybe' })
    await flush()

    expect(transport.callsTo('POST /api/approval')).toHaveLength(0)
    expect(logs.some(line => line.includes('unknown choice'))).toBe(true)
  })

  it('clears the card when the server resolves an approval this window did not answer', async () => {
    const { chat, gateway, transport } = await withHandler()
    const cancelled: GatewayEvent[] = []
    gateway.on('approval.cancelled', event => cancelled.push(event))

    pushApproval(transport, chat.session_id)
    transport.push(chat.session_id, { typed: { id: '1700000000000', type: 'approval.resolved' } })

    expect(cancelled[0]).toMatchObject({ payload: { request_ids: ['1700000000000'], session_id: chat.session_id } })
  })

  it('does not report its own answer as a foreign cancel', async () => {
    const { chat, gateway, requests, transport } = await withHandler(t => t.ok('POST /api/approval', { ok: true }))
    const cancelled: GatewayEvent[] = []
    gateway.on('approval.cancelled', event => cancelled.push(event))

    pushApproval(transport, chat.session_id)
    requests[0]?.respond({ choice: 'once' })
    await flush()
    transport.push(chat.session_id, { typed: { id: '1700000000000', type: 'approval.resolved' } })

    expect(cancelled).toHaveLength(0)
  })

  it('approval.pending lists the waiting approval; approval.respond without an id answers it', async () => {
    const { chat, gateway, transport } = await withHandler(t =>
      t.ok('GET /api/approval', approval()).ok('POST /api/approval', { ok: true })
    )

    const pending = await gateway.request<{ approvals: Array<{ request_id: string }> }>('approval.pending', {
      session_id: chat.session_id
    })
    const answered = await gateway.request('approval.respond', { choice: 'deny', session_id: chat.session_id })

    expect(pending.approvals.map(a => a.request_id)).toEqual(['1700000000000'])
    expect(answered).toEqual({ resolved: 1 })
    expect(transport.callsTo('POST /api/approval')[0]?.body).toEqual({ decision: 'deny', id: '1700000000000' })
  })

  it('approval.respond reports 0 resolved when the approval is already gone (404)', async () => {
    const { chat, gateway } = await withHandler(t => t.ok('POST /api/approval', { error: 'approval not found' }, 404))

    await expect(
      gateway.request('approval.respond', { choice: 'once', request_id: 'old', session_id: chat.session_id })
    ).resolves.toEqual({ resolved: 0 })
  })

  it('surfaces a failure to save a remembered rule instead of pretending it was approved', async () => {
    const { chat, gateway } = await withHandler(t =>
      t.ok('POST /api/approval', { error: 'Could not save the approval rule.' }, 500)
    )

    await expect(
      gateway.request('approval.respond', { choice: 'always', request_id: 'r', session_id: chat.session_id })
    ).rejects.toThrow('Could not save the approval rule.')
  })

  it('rejects an unknown choice on approval.respond', async () => {
    const { chat, gateway } = await withHandler()

    await expect(
      gateway.request('approval.respond', { choice: 'whatever', request_id: 'r', session_id: chat.session_id })
    ).rejects.toMatchObject({ code: 400 })
  })

  it('finds a waiting approval by polling when the server never pushes one', async () => {
    const transport = healthyTransport().route('POST /api/chat', () => new Promise(() => undefined))
    transport.ok('GET /api/approval', approval())
    const gateway = new VantaGateway({ approvalPollMs: 10, log: () => undefined, transport })
    await gateway.connect('vanta://local')
    const requests: ServerRequest[] = []
    gateway.onRequest(request => {
      requests.push(request)
    })
    const chat = await gateway.request<{ session_id: string }>('session.create', {})

    await gateway.request('prompt.submit', { session_id: chat.session_id, text: 'run it' })
    await new Promise(resolve => setTimeout(resolve, 80))

    expect(requests).toHaveLength(1)
    expect(requests[0]?.params.request_id).toBe('1700000000000')
  })

  it('stops polling when the turn ends', async () => {
    const transport = healthyTransport().ok('POST /api/chat', { finalText: 'done' })
    transport.ok('GET /api/approval', null)
    const gateway = new VantaGateway({ approvalPollMs: 10, log: () => undefined, transport })
    await gateway.connect('vanta://local')
    const chat = await gateway.request<{ session_id: string }>('session.create', {})

    await gateway.request('prompt.submit', { session_id: chat.session_id, text: 'x' })
    await new Promise(resolve => setTimeout(resolve, 30))
    const callsAfterDone = transport.callsTo('GET /api/approval').length
    await new Promise(resolve => setTimeout(resolve, 60))

    expect(transport.callsTo('GET /api/approval')).toHaveLength(callsAfterDone)
  })
})
