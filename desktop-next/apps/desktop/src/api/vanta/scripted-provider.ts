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

// Calls a tool that does not exist, with the same arguments every time: the agent gives up with repeated_failure.
async function* loopOnMissingTool() {
  const call = toolCall('no_such_tool', { path: 'x' })
  yield { call, type: 'tool_call' }
  yield { result: { finishReason: 'tool_calls', text: '', toolCalls: [call] }, type: 'done' }
}

// The model server refuses to go on halfway through an answer (a 400 is not retried by the provider layer).
async function* dropMidAnswer() {
  yield { delta: 'The first half of the answer. ', type: 'text' }
  throw Object.assign(new Error('the model server returned an unusable reply'), { status: 400 })
}

// Answers with what it was asked, so a test can read the order queued messages ran in.
async function* echo(text: string) {
  yield { delta: text, type: 'text' }
  yield { result: { finishReason: 'stop', text, toolCalls: [] }, type: 'done' }
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
 * "hang ..." streams a word and then waits to be stopped, "loop ..." keeps calling a missing tool until the agent stops,
 * "echo ..." answers "echo: ..." (to read the order messages ran in), "drop ..." fails halfway through an answer, "flaky ..." does that once and then answers, anything else greets.
 * After a tool result it wraps up (except for "loop").
 * `revoked` makes it refuse every call like a provider whose key was revoked.
 */
export function scriptedProvider(options: { revoked?: boolean } = {}) {
  const flakyAttempts = new Map<string, number>()

  // "flaky" fails the first time a prompt is seen and answers the second time.
  const flaky = (prompt: string) => {
    const attempt = (flakyAttempts.get(prompt) ?? 0) + 1
    flakyAttempts.set(prompt, attempt)

    return attempt === 1 ? dropMidAnswer() : greet()
  }

  return {
    contextWindow: () => 100_000,
    modelId: () => 'stub-model',
    async complete() {
      return { finishReason: 'stop', text: 'stub', toolCalls: [] }
    },
    stream(messages: Message[], _tools: unknown, config?: { signal?: AbortSignal }) {
      // A key the provider has since revoked: every call is refused with the 401 a real provider sends.
      if (options.revoked) throw Object.assign(new Error('401 Incorrect API key provided'), { status: 401 })

      const prompt = String([...messages].reverse().find(m => m.role === 'user')?.content ?? '')
      const edit = /^edit (\S+)/.exec(prompt)

      if (prompt.startsWith('loop')) return loopOnMissingTool()
      if (prompt.startsWith('drop')) return dropMidAnswer()
      if (prompt.startsWith('flaky')) return flaky(prompt)
      if (prompt.startsWith('echo ')) return echo(`echo: ${prompt.slice(5)}`)
      if (messages.at(-1)?.role === 'tool') return finishAfterTool()
      if (edit) return editFile(edit[1]!)
      if (prompt.startsWith('hang')) return hangUntilAborted(config?.signal)

      return greet()
    }
  }
}
