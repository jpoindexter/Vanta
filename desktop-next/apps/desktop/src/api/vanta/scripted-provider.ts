type Json = Record<string, unknown>

const toolCall = (name: string, args: Json) => ({
  arguments: args,
  id: `call-${name}-${Math.random().toString(36).slice(2, 8)}`,
  name
})

type Message = { content?: unknown; role: string }

async function* finishAfterTool() {
  yield { delta: 'edited ', type: 'text' }
  yield { delta: 'file', type: 'text' }
  yield { result: { finishReason: 'stop', text: 'edited file', toolCalls: [] }, type: 'done' }
}

async function* editFile(path: string) {
  const call = toolCall('edit_file', { new_string: 'after', old_string: 'before', path })
  yield { call, type: 'tool_call' }
  yield { result: { finishReason: 'tool_calls', text: '', toolCalls: [call] }, type: 'done' }
}

async function* hangUntilAborted(signal: AbortSignal | undefined) {
  yield { delta: 'working…', type: 'text' }
  await new Promise<void>(resolve => {
    if (signal?.aborted) resolve()
    signal?.addEventListener('abort', () => resolve(), { once: true })
  })
  throw Object.assign(new Error('aborted'), { name: 'AbortError' })
}

async function* greet() {
  yield { delta: 'Hi ', type: 'text' }
  yield { delta: 'there', type: 'text' }
  yield {
    result: { finishReason: 'stop', text: 'Hi there', toolCalls: [], usage: { inputTokens: 11, outputTokens: 7 } },
    type: 'done'
  }
}

/**
 * A scripted stand-in for the model, chosen by the latest user message: "edit <file>" asks to edit that file,
 * "hang ..." streams a word and then waits to be stopped, anything else greets. After a tool result it wraps up.
 */
export function scriptedProvider() {
  return {
    contextWindow: () => 100_000,
    modelId: () => 'stub-model',
    async complete() {
      return { finishReason: 'stop', text: 'stub', toolCalls: [] }
    },
    stream(messages: Message[], _tools: unknown, config?: { signal?: AbortSignal }) {
      const prompt = String([...messages].reverse().find(m => m.role === 'user')?.content ?? '')
      const edit = /^edit (\S+)/.exec(prompt)

      if (messages.at(-1)?.role === 'tool') return finishAfterTool()
      if (edit) return editFile(edit[1]!)
      if (prompt.startsWith('hang')) return hangUntilAborted(config?.signal)

      return greet()
    }
  }
}
