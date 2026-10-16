import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getAllSessionMessages, searchSessions, setSessionArchived, setSessionPinnedRemote, setSessionUnreadRemote } from '@/api/sessions'
import type { VantaApiRequest } from '@/global'
import { installRestBridge } from '@/test/rest-bridge'

const stored = [
  { content: 'list files', role: 'user' },
  { content: '', role: 'assistant', toolCalls: [{ arguments: '{"command":"ls"}', id: 'c1', name: 'shell_cmd' }] },
  { content: 'a.txt', name: 'shell_cmd', role: 'tool', toolCallId: 'c1' },
  { content: 'one file', role: 'assistant' }
]

function setup() {
  const calls: VantaApiRequest[] = []

  installRestBridge(request => {
    calls.push(request)
    const path = request.path.split('?')[0]

    if (path === '/api/sessions/search') {
      return { results: [{ role: 'user', sessionId: 's1', snippet: '…invoice…', started: '2026-10-13T09:00:00Z', title: 'Invoices', updated: '2026-10-13T10:00:00Z' }] }
    }

    if (path === '/api/sessions/export') {
      return { content: JSON.stringify({ messages: stored }), id: 's1' }
    }

    return { ok: true }
  })
  ;(window as { vantaDesktop?: unknown }).vantaDesktop = {}

  return calls
}

describe('session controls reach the Vanta routes', () => {
  let calls: VantaApiRequest[]

  beforeEach(() => {
    calls = setup()
  })

  afterEach(() => {
    delete (window as { desktopBridge?: unknown }).desktopBridge
    delete (window as { vantaDesktop?: unknown }).vantaDesktop
  })

  it('searches the saved transcripts and returns rows the sidebar can open', async () => {
    const { results } = await searchSessions('invoice')

    expect(calls[0]?.path).toBe('/api/sessions/search?q=invoice&limit=50')
    expect(results[0]).toMatchObject({ session_id: 's1', snippet: '…invoice…', title: 'Invoices' })
    expect(results[0]?.session_started).toBeGreaterThan(0)
  })

  it('does not call the server for an empty query', async () => {
    expect((await searchSessions('   ')).results).toEqual([])
    expect(calls).toEqual([])
  })

  it('maps pin, archive and unread toggles to their own routes', async () => {
    await setSessionPinnedRemote('s1', true)
    await setSessionArchived('s1', false)
    await setSessionUnreadRemote('s1', true)

    expect(calls.map(call => [call.path, call.body])).toEqual([
      ['/api/sessions/pin', { id: 's1', pinned: true }],
      ['/api/sessions/archive', { archived: false, id: 's1' }],
      ['/api/sessions/unread', { id: 's1', unread: true }]
    ])
  })

  it('loads a stored transcript through the export route for the Export action', async () => {
    const { messages, session_id } = await getAllSessionMessages('s1')

    expect(session_id).toBe('s1')
    expect(messages.map(message => message.role)).toEqual(['user', 'tool', 'assistant'])
    expect(calls[0]?.path).toBe('/api/sessions/export?id=s1&format=json')
  })
})
