import type { TranscriptEntry } from './client-registry'
import type { VantaMessage } from './schemas'

function textOf(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map(part =>
        part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
          ? (part as { text: string }).text
          : ''
      )
      .join('')
  }

  return ''
}

function argsOf(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }

  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw)

      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }

  return {}
}

/**
 * Vanta stores assistant tool calls inside the assistant message and the result as a separate `tool`
 * message. The Hermes transcript projects each call as ONE `tool` row carrying args and result.
 */
export function toTranscript(messages: readonly VantaMessage[]): TranscriptEntry[] {
  const rows: TranscriptEntry[] = []
  const toolRows = new Map<string, TranscriptEntry>()

  for (const message of messages) {
    if (message.role === 'tool') {
      const result = textOf(message.content)
      const row = message.toolCallId ? toolRows.get(message.toolCallId) : undefined

      if (row) {
        row.text = result
        row.content = result
      } else {
        rows.push({
          content: result,
          name: message.name ?? 'tool',
          role: 'tool',
          text: result,
          tool_call_id: message.toolCallId ?? ''
        })
      }

      continue
    }

    const text = textOf(message.content)

    if (text || !message.toolCalls?.length) {
      rows.push({ content: text, role: message.role, text })
    }

    for (const call of message.toolCalls ?? []) {
      const row: TranscriptEntry = {
        args: argsOf(call.arguments),
        content: '',
        name: call.name ?? 'tool',
        role: 'tool',
        text: '',
        tool_call_id: call.id ?? ''
      }

      rows.push(row)

      if (call.id) {
        toolRows.set(call.id, row)
      }
    }
  }

  return rows
}
