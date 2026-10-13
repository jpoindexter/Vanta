import type { GatewayEventName } from '@hermes/shared'

import {
  type ApprovalPayload,
  sseFrameSchema,
  type SseFrame,
  typedEventSchema,
  type TypedEvent,
  type UsagePayload
} from './schemas'

export type MappedEvent =
  | { approval: ApprovalPayload; kind: 'approval.request' }
  | { finalText: string; kind: 'turn.complete'; stoppedReason?: string; usage?: UsagePayload }
  | { id: string; kind: 'approval.resolved' }
  | { kind: 'gateway'; payload: Record<string, unknown>; type: GatewayEventName }
  | { kind: 'turn.started'; requestId: string }

export interface FrameMapper {
  map: (frame: unknown) => MappedEvent[]
  /** Forget unmatched tool starts at a turn boundary. */
  reset: () => void
}

const PREVIEW_MAX = 120
const SUMMARY_MAX = 200

function firstLine(text: string, max: number): string {
  return (text.split('\n').find(line => line.trim()) ?? '').trim().slice(0, max)
}

function previewOf(args: Record<string, unknown>): string {
  const first = Object.values(args).find((value): value is string => typeof value === 'string' && value.trim() !== '')

  return first ? firstLine(first, PREVIEW_MAX) : ''
}

function gateway(type: GatewayEventName, payload: Record<string, unknown>): MappedEvent {
  return { kind: 'gateway', payload, type }
}

function mapTyped(event: TypedEvent): MappedEvent {
  switch (event.type) {
    case 'tool.start':
      return gateway('tool.start', {
        args: event.args,
        name: event.name,
        preview: previewOf(event.args),
        tool_id: event.id
      })
    case 'tool.complete':
      return gateway('tool.complete', {
        name: event.name,
        result_text: event.output,
        summary: firstLine(event.output, SUMMARY_MAX),
        tool_id: event.id
      })
    case 'thinking':
      return gateway('thinking.delta', { text: event.text })
    case 'approval.request':
      return { approval: event.approval, kind: 'approval.request' }
    case 'approval.resolved':
      return { id: event.id, kind: 'approval.resolved' }
    case 'turn.complete':
      return {
        finalText: event.finalText,
        kind: 'turn.complete',
        stoppedReason: event.stoppedReason,
        usage: event.usage
      }
  }
}

export function createFrameMapper(): FrameMapper {
  const open = new Map<string, string[]>()
  let seq = 0

  const synthStart = (frame: SseFrame): MappedEvent => {
    const name = frame.name ?? 'tool'
    const id = `vanta-syn-${++seq}`
    open.set(name, [...(open.get(name) ?? []), id])

    return gateway('tool.start', { args: {}, context: frame.label ?? '', name, tool_id: id })
  }

  const synthEnd = (frame: SseFrame): MappedEvent => {
    const name = frame.name ?? 'tool'
    const queue = open.get(name) ?? []
    const id = queue.shift() ?? `vanta-syn-${++seq}`

    if (queue.length === 0) {
      open.delete(name)
    }

    const text = frame.detail ?? frame.label ?? ''

    return gateway('tool.complete', {
      name,
      ok: frame.ok !== false,
      result_text: text,
      summary: firstLine(text, SUMMARY_MAX),
      tool_id: id
    })
  }

  const legacy = (frame: SseFrame): MappedEvent[] => {
    if (frame.kind === 'tool_start') {
      return [synthStart(frame)]
    }

    if (frame.kind === 'tool_end') {
      return [synthEnd(frame)]
    }

    if (frame.label && !frame.turnStarted && frame.delta === undefined) {
      return [gateway('status.update', { kind: frame.kind ?? 'status', text: frame.label })]
    }

    return []
  }

  const map = (raw: unknown): MappedEvent[] => {
    const parsed = sseFrameSchema.safeParse(raw)

    if (!parsed.success) {
      return []
    }

    const frame = parsed.data
    const out: MappedEvent[] = []

    if (frame.turnStarted) {
      out.push({ kind: 'turn.started', requestId: frame.turnStarted.requestId })
    }

    if (frame.delta) {
      out.push(gateway('message.delta', { text: frame.delta }))
    }

    // A frame the server typed is authoritative; an absent or unrecognised `typed` falls back to the label.
    const typed = frame.typed === undefined ? null : typedEventSchema.safeParse(frame.typed)

    out.push(...(typed?.success ? [mapTyped(typed.data)] : legacy(frame)))

    return out
  }

  return { map, reset: () => open.clear() }
}
