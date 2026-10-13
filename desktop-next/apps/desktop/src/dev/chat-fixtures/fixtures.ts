import type { ChatMessage, ChatMessagePart } from '@/lib/chat-messages'

import type { ChatFixtureState, FixtureParams } from './params'

const USER_PROMPT = 'Add retry with backoff to the billing webhook handler, then run the billing tests'
const PLAN_TEXT = 'I will read the handler, add a bounded exponential backoff, and run the tests.'
const DONE_TEXT =
  'Done. The handler now retries up to 5 times with backoff, and all 41 billing tests pass. The change is in the Changes panel.'

const OFFLINE_TEXT =
  'I lost the connection while running the tests. Your message and this thread are saved. I will continue when you are back online.'

const BLOCKED_PROMPT = 'Write this week’s competitor pricing brief'

function unifiedDiff(path: string, added: number, removed: number): string {
  const head = [`--- a/${path}`, `+++ b/${path}`, `@@ -1,${removed + 3} +1,${added + 3} @@`, ' import { send } from "./send"']
  const gone = Array.from({ length: removed }, (_, index) => `-  const attempt${index} = send(payload)`)
  const kept = [' ']
  const fresh = Array.from({ length: added }, (_, index) => `+  const attempt${index} = retry(send, payload)`)

  return [...head, ...gone, ...kept, ...fresh].join('\n')
}

function readFile(id: string, path: string): ChatMessagePart {
  return {
    type: 'tool-call',
    toolCallId: id,
    toolName: 'read_file',
    args: { path },
    argsText: JSON.stringify({ path }),
    result: { content: `// ${path}`, total_lines: 80 }
  }
}

function editFile(id: string, path: string, added: number, removed: number): ChatMessagePart {
  return {
    type: 'tool-call',
    toolCallId: id,
    toolName: 'patch',
    args: { path },
    argsText: JSON.stringify({ path }),
    result: { success: true, path, inline_diff: unifiedDiff(path, added, removed) }
  }
}

function terminalCall(
  id: string,
  command: string,
  extra: Partial<ChatMessagePart> & { result?: Record<string, unknown> } = {}
): ChatMessagePart {
  return {
    type: 'tool-call',
    toolCallId: id,
    toolName: 'terminal',
    args: { command },
    argsText: JSON.stringify({ command }),
    ...extra
  } as ChatMessagePart
}

export const BLOCKED_QUESTION = {
  choices: ['Skip Acme', 'Paste the page text', 'Open browser to sign in'],
  question: 'The Acme pricing page needs a login, so I cannot read it. Choose how to continue.',
  title: 'I need a source'
}

function clarifyCall(): ChatMessagePart {
  const args = { questions: [{ choices: BLOCKED_QUESTION.choices, question: BLOCKED_QUESTION.question }], title: BLOCKED_QUESTION.title }

  return {
    type: 'tool-call',
    toolCallId: 'c1',
    toolName: 'clarify',
    args,
    argsText: JSON.stringify(args)
  } as ChatMessagePart
}

/** 09:41 UTC today, the time the wireframe prints under the first message. */
function nineForty(): number {
  const now = new Date()

  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 9, 41) / 1000
}

const user = (id: string, text: string): ChatMessage => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text }],
  timestamp: nineForty()
})

const assistant = (id: string, parts: ChatMessagePart[], extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  role: 'assistant',
  parts,
  timestamp: nineForty() + 20,
  ...extra
})

const text = (value: string): ChatMessagePart => ({ type: 'text', text: value })

function workParts(): ChatMessagePart[] {
  return [
    text(PLAN_TEXT),
    readFile('r1', 'billing/webhooks.ts'),
    readFile('r2', 'billing/retry.ts'),
    readFile('r3', 'billing/webhooks.test.ts'),
    editFile('e1', 'billing/webhooks.ts', 24, 6),
    editFile('e2', 'billing/retry.ts', 18, 0)
  ]
}

function blockedMessages(): ChatMessage[] {
  const search = (id: string): ChatMessagePart => ({
    type: 'tool-call',
    toolCallId: id,
    toolName: 'web_search',
    args: { query: `competitor pricing ${id}` },
    argsText: '{}',
    result: { results: [] }
  })

  return [
    user('u1', BLOCKED_PROMPT),
    assistant('a1', [...['s1', 's2', 's3', 's4', 's5', 's6'].map(search), clarifyCall()], { pending: true })
  ]
}

const LONG_ANSWER = [
  'The handler now wraps the send call in a bounded retry. Here is the core of it:',
  '```ts\nexport async function retry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {\n  let delay = 200\n  for (let attempt = 1; ; attempt += 1) {\n    try {\n      return await fn()\n    } catch (error) {\n      if (attempt >= attempts) throw error\n      await sleep(delay)\n      delay *= 2\n    }\n  }\n}\n```',
  'Each failure doubles the wait, starting at 200 ms, and gives up after five attempts so a dead endpoint never blocks the queue.'
].join('\n\n')

function manyTurns(): ChatMessage[] {
  return Array.from({ length: 24 }, (_, index) => [
    user(`mu${index}`, `Question ${index + 1} about the billing handler`),
    assistant(`ma${index}`, [text(`Answer ${index + 1}. The handler retries up to five times with exponential backoff.`)])
  ]).flat()
}

export function fixtureMessages(params: FixtureParams): ChatMessage[] {
  const state: ChatFixtureState = params.state

  if (state === 'empty') {
    return []
  }

  if (state === 'blocked') {
    return blockedMessages()
  }

  const base = [user('u1', USER_PROMPT)]
  const parts = workParts()

  if (params.flags.has('many')) {
    return manyTurns()
  }

  if (state === 'running') {
    return [
      ...base,
      assistant(
        'a1',
        [
          ...parts,
          terminalCall('t1', 'npm test -- billing', {
            toolResultMetadata: { summary: 'Running tests: billing (12 of 41)' }
          })
        ],
        { pending: true }
      )
    ]
  }

  if (state === 'done') {
    const closing = params.flags.has('long') ? [text(LONG_ANSWER)] : [text(DONE_TEXT)]

    return [...base, assistant('a1', [...parts, ...closing])]
  }

  if (state === 'offline') {
    return [...base, assistant('a1', [...parts, text(OFFLINE_TEXT)])]
  }

  if (state === 'failed') {
    return [
      ...base,
      assistant('a1', [...parts, terminalCall('t1', 'npm test -- billing', { result: { error: '3 of 41 tests failed', exit_code: 1, output: '3 failed', success: false } })], {
        error: 'The tests failed',
        errorSurface: {
          code: 'tool_failed',
          headline: 'The tests failed',
          layer: 'runtime',
          message: '3 of 41 billing tests failed after the edit. Partial output is kept. Nothing was committed.',
          retryable: true
        }
      })
    ]
  }

  return [...base, assistant('a1', parts, { pending: true })]
}
