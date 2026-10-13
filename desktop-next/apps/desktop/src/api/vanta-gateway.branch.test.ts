import { describe, expect, it } from 'vitest'

import { messagesForRows } from './vanta/handlers-branch'
import { connectedHarness, healthyTransport } from './vanta/gateway-fixture'

const stored = [
  { content: 'list files', role: 'user' },
  { content: '', role: 'assistant', toolCalls: [{ arguments: '{"command":"ls"}', id: 'c1', name: 'shell_cmd' }] },
  { content: 'a.txt', name: 'shell_cmd', role: 'tool', toolCallId: 'c1' },
  { content: 'one file', role: 'assistant' }
]

describe('session.branch', () => {
  it('counts transcript rows back to stored messages (a tool call and its result are one row)', () => {
    expect(messagesForRows(stored, 1)).toBe(1)
    expect(messagesForRows(stored, 2)).toBe(2)
    expect(messagesForRows(stored, 3)).toBe(4)
  })

  it('forks the stored chat at the clicked row and opens the branch under a live id', async () => {
    const transport = healthyTransport()
      .ok('GET /api/sessions/export?id=stored-1&format=json', { content: JSON.stringify({ messages: stored }), id: 'stored-1' })
      .ok('POST /api/sessions/fork', { id: 'branch-1', ok: true })
      .ok('POST /api/sessions/open', { id: 'branch-1', messages: stored.slice(0, 1), title: 'Chat (branch)' })

    const harness = await connectedHarness(transport)

    const result = await harness.gateway.request<{ session_id: string; stored_session_id: string }>('session.branch', {
      count: 1,
      session_id: 'stored-1'
    })

    expect(transport.callsTo('POST /api/sessions/fork')[0]?.body).toEqual({ count: 1, id: 'stored-1' })
    expect(result.stored_session_id).toBe('branch-1')
    expect(result.session_id).not.toBe('stored-1')
  })

  it('branches the whole chat for session.branch_whole', async () => {
    const transport = healthyTransport()
      .ok('POST /api/sessions/fork', { id: 'branch-2', ok: true })
      .ok('POST /api/sessions/open', { id: 'branch-2', messages: stored, title: 'Chat (branch)' })

    const harness = await connectedHarness(transport)
    await harness.gateway.request('session.branch_whole', { session_id: 'stored-1' })

    expect(transport.callsTo('POST /api/sessions/fork')[0]?.body).toEqual({ id: 'stored-1' })
  })

  it('surfaces a fork failure instead of opening a phantom branch', async () => {
    const transport = healthyTransport().ok('POST /api/sessions/fork', { error: 'session not found' }, 404)
    const harness = await connectedHarness(transport)

    await expect(harness.gateway.request('session.branch_whole', { session_id: 'gone' })).rejects.toThrow('session not found')
    expect(transport.callsTo('POST /api/sessions/open')).toEqual([])
  })
})
