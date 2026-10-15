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

/** The server's own exact-action request, with Always capped by what the gateway honors for this prompt. */
function serverPayload(request: ApprovalRequest, canRemember: boolean): ApprovalPayload | null {
  const sent = request.request

  if (!sent) {
    return null
  }

  const subject = sent.subject || request.command.trim()

  return {
    action: subject,
    id: request.requestId ?? 'legacy',
    reason: sent.reason || request.description.trim(),
    request: { ...sent, canRemember: sent.canRemember === true && canRemember, subject },
    toolName: sent.toolName ?? request.toolName
  }
}

/** A Hermes-shaped prompt: only a command and a description, so a command is treated as shell. */
function legacyPayload(request: ApprovalRequest, canRemember: boolean): ApprovalPayload {
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

/** Present a gateway approval request in the shape of the server's approval payload. */
export function approvalPayload(request: ApprovalRequest, canRemember: boolean): ApprovalPayload {
  return serverPayload(request, canRemember) ?? legacyPayload(request, canRemember)
}
