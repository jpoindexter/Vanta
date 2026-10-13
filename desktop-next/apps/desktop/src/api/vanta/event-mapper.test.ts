import { describe, expect, it } from 'vitest'

import { createFrameMapper, type MappedEvent } from './event-mapper'

function toolId(event: MappedEvent | undefined): string {
  if (event?.kind !== 'gateway') {
    throw new Error('expected a gateway event')
  }

  return String(event.payload.tool_id)
}

const gateway = (type: string, payload: Record<string, unknown>) => ({ kind: 'gateway', payload, type })

describe('frame mapper: typed events', () => {
  it('maps tool.start to a tool.start event with id, name, args and a preview', () => {
    const mapper = createFrameMapper()

    const out = mapper.map({
      label: '→ shell_cmd',
      kind: 'tool_start',
      name: 'shell_cmd',
      typed: { args: { command: 'ls -la\nsecond line' }, id: 'tool-1', name: 'shell_cmd', type: 'tool.start' }
    })

    expect(out).toEqual([
      gateway('tool.start', {
        args: { command: 'ls -la\nsecond line' },
        name: 'shell_cmd',
        preview: 'ls -la',
        tool_id: 'tool-1'
      })
    ])
  })

  it('maps tool.complete with the output as result text and a one-line summary', () => {
    const out = createFrameMapper().map({
      typed: { id: 'tool-1', name: 'shell_cmd', ok: true, output: '\nfirst\nsecond', type: 'tool.complete' }
    })

    expect(out).toEqual([
      gateway('tool.complete', {
        name: 'shell_cmd',
        result_text: '\nfirst\nsecond',
        summary: 'first',
        tool_id: 'tool-1'
      })
    ])
  })

  it('maps thinking to thinking.delta', () => {
    expect(createFrameMapper().map({ typed: { text: 'considering', type: 'thinking' } })).toEqual([
      gateway('thinking.delta', { text: 'considering' })
    ])
  })

  it('maps approval.request and approval.resolved', () => {
    const approval = { action: 'rm -rf build', id: '1', reason: 'delete', toolName: 'shell_cmd' }
    const mapper = createFrameMapper()

    expect(mapper.map({ typed: { approval, type: 'approval.request' } })).toMatchObject([
      { approval, kind: 'approval.request' }
    ])
    expect(mapper.map({ typed: { id: '1', type: 'approval.resolved' } })).toEqual([
      { id: '1', kind: 'approval.resolved' }
    ])
  })

  it('maps turn.complete with usage and stop reason', () => {
    const out = createFrameMapper().map({
      typed: {
        finalText: 'done',
        sessionId: 's1',
        stoppedReason: 'done',
        type: 'turn.complete',
        usage: { inputTokens: 3, outputTokens: 4 }
      }
    })

    expect(out).toEqual([
      { finalText: 'done', kind: 'turn.complete', stoppedReason: 'done', usage: { inputTokens: 3, outputTokens: 4 } }
    ])
  })

  it('does not also synthesize a label tool event when the frame is typed', () => {
    const out = createFrameMapper().map({
      kind: 'tool_end',
      label: '✓ x',
      name: 'x',
      ok: true,
      typed: { id: 'tool-9', name: 'x', ok: true, output: 'fine', type: 'tool.complete' }
    })

    expect(out).toHaveLength(1)
  })
})

describe('frame mapper: legacy label fallback', () => {
  it('maps a delta to message.delta', () => {
    expect(createFrameMapper().map({ delta: 'Hel' })).toEqual([gateway('message.delta', { text: 'Hel' })])
  })

  it('synthesizes matching ids for an untyped tool_start and tool_end of the same tool', () => {
    const mapper = createFrameMapper()
    const [start] = mapper.map({ kind: 'tool_start', label: '→ read_file', name: 'read_file' })
    const [end] = mapper.map({
      detail: 'contents',
      kind: 'tool_end',
      label: '✓ read_file',
      name: 'read_file',
      ok: true
    })

    expect(start).toMatchObject({ kind: 'gateway', type: 'tool.start' })
    expect(end).toMatchObject({ kind: 'gateway', type: 'tool.complete' })
    expect(toolId(start)).toBe(toolId(end))
  })

  it('pairs two overlapping calls of one tool in start order', () => {
    const mapper = createFrameMapper()
    const a = toolId(mapper.map({ kind: 'tool_start', name: 't' })[0])
    const b = toolId(mapper.map({ kind: 'tool_start', name: 't' })[0])
    const endA = toolId(mapper.map({ kind: 'tool_end', name: 't', ok: true })[0])
    const endB = toolId(mapper.map({ kind: 'tool_end', name: 't', ok: true })[0])

    expect([endA, endB]).toEqual([a, b])
  })

  it('reports turnStarted separately and does not turn its label into a status line', () => {
    const out = createFrameMapper().map({
      label: 'Response started.',
      turnStarted: { requestId: 'r1', sessionId: 's1' }
    })

    expect(out).toEqual([{ kind: 'turn.started', requestId: 'r1' }])
  })

  it('turns a plain note into status.update', () => {
    expect(createFrameMapper().map({ kind: 'note', label: 'note: hi' })).toEqual([
      gateway('status.update', { kind: 'note', text: 'note: hi' })
    ])
  })

  it('falls back to the label when typed is present but unrecognised', () => {
    const out = createFrameMapper().map({ kind: 'tool_start', name: 'x', typed: { type: 'future.event' } })

    expect(out).toMatchObject([{ kind: 'gateway', type: 'tool.start' }])
  })

  it('ignores frames that are not objects', () => {
    const mapper = createFrameMapper()

    expect(mapper.map('nope')).toEqual([])
    expect(mapper.map(null)).toEqual([])
    expect(mapper.map(42)).toEqual([])
  })
})
