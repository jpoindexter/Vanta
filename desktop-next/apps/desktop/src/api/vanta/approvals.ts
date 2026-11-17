import type { ServerRequest } from '@vanta/shared'
import { JsonRpcGatewayError } from '@vanta/shared'

import type { ChatClient } from './client-registry'
import type { GatewayHub } from './hub'
import { expectOk, parseBody } from './rpc'
import { type ApprovalPayload, pendingApprovalSchema } from './schemas'

export type ApprovalChoice = 'always' | 'deny' | 'never' | 'once' | 'session'

const DECISION_FOR: Record<ApprovalChoice, 'allow' | 'always' | 'deny' | 'never'> = {
  always: 'always',
  deny: 'deny',
  never: 'never',
  once: 'allow',
  // Vanta has no session-scoped grant. A session pick is a one-time allow, never a silent permanent rule.
  session: 'allow'
}

export function isApprovalChoice(value: unknown): value is ApprovalChoice {
  return typeof value === 'string' && value in DECISION_FOR
}

export function canRemember(approval: ApprovalPayload): boolean {
  const request = approval.request

  return request?.canRemember !== false && request?.fresh !== true
}

/** The Vanta `approval` request params for one Vanta approval, carrying the exact-action request through untouched. */
export function approvalParams(client: ChatClient, approval: ApprovalPayload): Record<string, unknown> {
  const remember = canRemember(approval)

  return {
    allow_permanent: remember,
    allow_session: false,
    choices: remember ? ['once', 'always', 'deny'] : ['once', 'deny'],
    command: approval.request?.subject || approval.action,
    description: approval.request?.reason || approval.reason,
    request_id: approval.id,
    session_id: client.clientId,
    tool_name: approval.toolName ?? null,
    vanta_action: approval.action,
    vanta_request: approval.request ?? null
  }
}

/** Build the server-to-client request the renderer answers with `respond({ choice })`. */
export function approvalServerRequest(hub: GatewayHub, client: ChatClient, approval: ApprovalPayload): ServerRequest {
  const answer = (result: Record<string, unknown>) => {
    const choice = result.choice

    if (!isApprovalChoice(choice)) {
      hub.warn(`ignored approval answer with unknown choice ${JSON.stringify(choice)}`)

      return
    }

    answerApproval(hub, client, approval.id, choice).catch(error => {
      hub.emit(client.clientId, 'error', { message: error instanceof Error ? error.message : String(error) })
    })
  }

  return {
    fail: (code, message) => hub.warn(`approval ${approval.id} answered with error ${code}: ${message}`),
    id: `approval:${client.clientId}:${approval.id}`,
    method: 'approval',
    params: approvalParams(client, approval),
    respond: answer
  }
}

/** POST the user's decision. Resolves to the number of approvals resolved (0 when it was already gone). */
export async function answerApproval(
  hub: GatewayHub,
  client: ChatClient,
  approvalId: string,
  choice: ApprovalChoice
): Promise<number> {
  client.respondedApprovals.add(approvalId)
  const result = await hub.caller.post(client, '/api/approval', { decision: DECISION_FOR[choice], id: approvalId })

  if (result.status === 404) {
    return 0
  }

  expectOk(result, 'approval response')

  return 1
}

export async function fetchPendingApproval(hub: GatewayHub, client: ChatClient): Promise<ApprovalPayload | null> {
  const result = await hub.caller.get(client, '/api/approval')

  return parseBody(pendingApprovalSchema, expectOk(result, 'approval lookup'), 'approval.pending')
}

export function requireChoice(value: unknown): ApprovalChoice {
  if (!isApprovalChoice(value)) {
    throw new JsonRpcGatewayError(
      `approval.respond needs choice once, session, always, deny or never; got ${JSON.stringify(value)}`,
      { code: 400 }
    )
  }

  return value
}
