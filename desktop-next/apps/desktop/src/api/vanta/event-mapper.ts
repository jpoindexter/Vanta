import type { GatewayEventName } from '@vanta/shared'

import {
  type ApprovalPayload,
  sseFrameSchema,
  type SseFrame,
  typedEventSchema,
  type TypedEvent,
  type UsagePayload
} from './schemas'
import { PlanTracker, type PlanItem, planFromTodoArgs } from './todo-payload'

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

const PERCENT = 100
const TENTH = 10

/**
 * Running totals for the chat this mapper serves. The server reports each settled instruction's
 * tokens; the meter wants the session so far (since this window opened the chat).
 */
class UsageTotals {
  private calls = 0
  private input = 0
  private output = 0

  tick(event: Extract<TypedEvent, { type: 'usage' }>): MappedEvent {
    const percent = event.contextWindow > 0 ? Math.min(PERCENT, (event.contextTokens / event.contextWindow) * PERCENT) : 0

    if (event.reported) {
      this.calls += 1
      this.input += event.inputTokens
      this.output += event.outputTokens
    }

    return gateway('session.usage', {
      usage: {
        // Token counts only move when the provider reported them; an unreported turn must not reset the totals.
        ...(this.calls > 0 ? { calls: this.calls, input: this.input, output: this.output, total: this.input + this.output } : {}),
        context_estimated: true,
        context_max: event.contextWindow,
        context_percent: Math.round(percent * TENTH) / TENTH,
        context_source: 'vanta',
        context_used: event.contextTokens
      }
    })
  }
}

/** The plan, when this call is a `todo` write, so the plan panel above the composer lights up. */
function planFields(name: string, args: unknown): { todos?: PlanItem[] } {
  const todos = planFromTodoArgs(name, args)

  return todos ? { todos } : {}
}

function mapTyped(event: TypedEvent, totals: UsageTotals, plans: PlanTracker): MappedEvent {
  switch (event.type) {
    case 'usage':
      return totals.tick(event)
    case 'tool.start':
      plans.start(event.id, event.name, event.args)

      return gateway('tool.start', {
        args: event.args,
        name: event.name,
        preview: previewOf(event.args),
        tool_id: event.id,
        ...planFields(event.name, event.args)
      })
    case 'tool.complete':
      return gateway('tool.complete', {
        name: event.name,
        // `result` is what the transcript stores on the tool part; `result_text` stays for older consumers.
        result: event.output,
        result_text: event.output,
        summary: firstLine(event.output, SUMMARY_MAX),
        tool_id: event.id,
        // A failed tool must reach the row as a failure, not as a completed step.
        ...(event.ok ? {} : { error: firstLine(event.output, SUMMARY_MAX) || 'Tool failed' }),
        ...(plans.complete(event.id) ?? {})
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

/**
 * Servers that predate typed events label tool steps without ids. Mint one per start and pair each
 * end with the oldest open start of the same tool name, so the transcript still gets matched rows.
 */
class LegacyToolIds {
  private readonly open = new Map<string, string[]>()
  private seq = 0

  start(frame: SseFrame): MappedEvent {
    const name = frame.name ?? 'tool'
    const id = `vanta-syn-${++this.seq}`
    this.open.set(name, [...(this.open.get(name) ?? []), id])

    return gateway('tool.start', { args: {}, context: frame.label ?? '', name, tool_id: id })
  }

  end(frame: SseFrame): MappedEvent {
    const name = frame.name ?? 'tool'
    const queue = this.open.get(name) ?? []
    const id = queue.shift() ?? `vanta-syn-${++this.seq}`

    if (queue.length === 0) {
      this.open.delete(name)
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

  reset(): void {
    this.open.clear()
  }
}

function legacyEvents(frame: SseFrame, ids: LegacyToolIds): MappedEvent[] {
  if (frame.kind === 'tool_start') {
    return [ids.start(frame)]
  }

  if (frame.kind === 'tool_end') {
    return [ids.end(frame)]
  }

  if (frame.label && !frame.turnStarted && frame.delta === undefined) {
    return [gateway('status.update', { kind: frame.kind ?? 'status', text: frame.label })]
  }

  return []
}

export function createFrameMapper(): FrameMapper {
  const ids = new LegacyToolIds()
  const totals = new UsageTotals()
  const plans = new PlanTracker()

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
    out.push(...(typed?.success ? [mapTyped(typed.data, totals, plans)] : legacyEvents(frame, ids)))

    return out
  }

  return {
    map,
    reset: () => {
      ids.reset()
      plans.reset()
    }
  }
}
