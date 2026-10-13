import type { ApprovalDecision, ApprovalPayload } from '@/components/chat/vanta/approval-types'
import type { ApprovalRequest } from '@/store/prompts'

export type ApprovalChoice = 'always' | 'deny' | 'once' | 'session'

/** What the card reports, as the gateway's approval.respond choices. */
export const CHOICE_FOR_DECISION: Record<ApprovalDecision, ApprovalChoice> = {
  allow: 'once',
  always: 'always',
  deny: 'deny',
  // The gateway has no "never"; the card hides that option for gateway requests.
  never: 'deny'
}

// A plugin `approve` rule escalates through the same gate with a synthetic
// display target (`<tool> (plugin approval rule)`) while the real command or
// change lives in `description`.
const SYNTHETIC_COMMAND_RE = /^<[^>]+> \(/

/** Present a gateway approval request in the shape of the server's approval payload. */
export function approvalPayload(request: ApprovalRequest, canRemember: boolean): ApprovalPayload {
  const command = request.command.trim()
  const description = request.description.trim()
  const isCommand = command.length > 0 && !SYNTHETIC_COMMAND_RE.test(command)
  const subject = isCommand ? command : description || command

  return {
    action: subject,
    id: request.requestId ?? 'legacy',
    reason: isCommand ? description : '',
    request: {
      canRemember,
      kind: isCommand ? 'bash' : 'generic',
      reason: isCommand ? description : '',
      sections: isCommand ? [{ label: 'Command', tone: 'code', value: command }] : [],
      subject,
      title: isCommand ? 'Run a command' : subject,
      toolName: isCommand ? 'terminal' : undefined
    },
    toolName: canRemember ? 'terminal' : undefined
  }
}
