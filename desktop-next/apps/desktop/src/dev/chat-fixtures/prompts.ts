import { clearAllPrompts, setApprovalRequest } from '@/store/prompts'

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
