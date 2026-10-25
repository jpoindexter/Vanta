import type { TranscriptEntry } from './client-registry'
import type { VantaMessage } from './schemas'
import { savedRunFailure } from './saved-run-failure'

function textOf(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .map(part => (typeof (part as { text?: unknown } | null)?.text === 'string' ? (part as { text: string }).text : ''))
    .join('')
}

function argsOf(raw: unknown): Record<string, unknown> {
  const parsed = typeof raw === 'string' ? safeParse(raw) : raw

  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

type ToolCall = NonNullable<VantaMessage['toolCalls']>[number]

function toolRow(call: ToolCall): TranscriptEntry {
  return {
    args: argsOf(call.arguments),
    content: '',
    name: call.name ?? 'tool',
    role: 'tool',
    text: '',
    tool_call_id: call.id ?? ''
  }
}

function orphanToolResult(message: VantaMessage): TranscriptEntry {
  const result = textOf(message.content)

  return {
    content: result,
    name: message.name ?? 'tool',
    role: 'tool',
    text: result,
    tool_call_id: message.toolCallId ?? ''
  }
}

function messageRow(message: VantaMessage, text: string): TranscriptEntry {
  return {
    content: text,
    role: message.role,
    text,
    ...(message.role === 'assistant' ? savedRunFailure(message.desktopRun) : {})
  }
}

function hasVisibleMessage(message: VantaMessage, row: TranscriptEntry): boolean {
  return Boolean(row.text || !message.toolCalls?.length || row.display_kind === 'failed_run')
}

/**
 * Vanta stores assistant tool calls inside the assistant message and the result as a separate `tool`
 * message. The Vanta transcript projects each call as ONE `tool` row carrying args and result.
 */
export function toTranscript(messages: readonly VantaMessage[]): TranscriptEntry[] {
  const rows: TranscriptEntry[] = []
  const toolRows = new Map<string, TranscriptEntry>()

  for (const message of messages) {
    if (message.role === 'tool') {
      const row = message.toolCallId ? toolRows.get(message.toolCallId) : undefined

      if (row) {
        row.text = row.content = textOf(message.content)
      } else {
        rows.push(orphanToolResult(message))
      }

      continue
    }

    const text = textOf(message.content)
    const row = messageRow(message, text)

    if (hasVisibleMessage(message, row)) {
      rows.push(row)
    }

    for (const call of message.toolCalls ?? []) {
      const row = toolRow(call)
      rows.push(row)

      if (call.id) {
        toolRows.set(call.id, row)
      }
    }
  }

  return rows
}
