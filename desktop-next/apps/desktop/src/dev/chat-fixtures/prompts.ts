import { clearClarifyRequest, setClarifyRequest } from '@/store/clarify'
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
      questions: [{ choices: BLOCKED_QUESTION.choices, multiSelect: false, qid: 'q1', question: BLOCKED_QUESTION.question }],
      requestId: 'clarify-1',
      sessionId
    })
  }
}
