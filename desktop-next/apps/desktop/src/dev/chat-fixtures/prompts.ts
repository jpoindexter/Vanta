import { requestComposerInsert } from '@/app/chat/composer/focus'
import { clearClarifyRequest, setClarifyRequest } from '@/store/clarify'
import { mainComposerScope } from '@/store/composer'
import { $queuedPromptsBySession, enqueueQueuedPrompt } from '@/store/composer-queue'
import { clearAllPrompts, setApprovalRequest } from '@/store/prompts'

import { BLOCKED_QUESTION } from './fixtures'
import type { FixtureParams } from './params'

/** Put the prompt stores in the shape the scenario needs. */
export function seedPrompts(params: FixtureParams, sessionId: string): void {
  clearAllPrompts(sessionId)

  if (params.state === 'waiting') {
    setApprovalRequest({
      command: 'npm test -- billing',
      description: 'Vanta wants to run the billing tests after the edit',
      requestId: 'approval-1',
      sessionId
    })
  }
}

export function seedClarify(params: FixtureParams, sessionId: string): void {
  clearClarifyRequest(undefined, sessionId)

  if (params.state === 'blocked') {
    setClarifyRequest({
      questions: [
        { choices: BLOCKED_QUESTION.choices, multiSelect: false, qid: 'q1', question: BLOCKED_QUESTION.question }
      ],
      requestId: 'clarify-1',
      sessionId
    })
  }
}

const DRAFT_10 = Array.from(
  { length: 10 },
  (_, index) => `Line ${index + 1} of a long draft the composer should grow around`
).join('\n')

/** Composer-side scenarios: queued messages, attachment chips, a ten-line draft. */
export function seedComposer(params: FixtureParams, sessionId: string): () => void {
  $queuedPromptsBySession.set({})
  mainComposerScope.$attachments.set([])

  if (params.flags.has('queue')) {
    enqueueQueuedPrompt(sessionId, { attachments: [], text: 'Also update the changelog' })
    enqueueQueuedPrompt(sessionId, { attachments: [], text: 'Then tag the release when the tests pass' })
  }

  if (params.flags.has('attachments')) {
    mainComposerScope.$attachments.set([
      { id: 'a1', kind: 'file', label: 'billing-spec.pdf', path: '/work/Vanta/docs/billing-spec.pdf' },
      { id: 'a2', kind: 'file', label: 'webhooks.ts', path: '/work/Vanta/billing/webhooks.ts' },
      { id: 'a3', kind: 'url', label: 'stripe.com/docs/webhooks', path: 'https://stripe.com/docs/webhooks' }
    ])
  }

  if (!params.flags.has('draft10')) {
    return () => undefined
  }

  const timer = window.setTimeout(() => requestComposerInsert(DRAFT_10), 600)

  return () => window.clearTimeout(timer)
}
