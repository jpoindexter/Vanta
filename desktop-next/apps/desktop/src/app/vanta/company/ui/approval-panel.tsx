import { ApprovalCard } from '@/components/chat/vanta/approval-card'

import { useCompany } from '../company-context'

/** The owner approval a hire, budget raise or CLI worker start is waiting on, in the one approval card the chat uses. */
export function PendingApproval() {
  const { approval, decideApproval } = useCompany()

  if (!approval) {
    return null
  }

  return <ApprovalCard allowNever={false} approval={approval} onAnswer={decideApproval} />
}
