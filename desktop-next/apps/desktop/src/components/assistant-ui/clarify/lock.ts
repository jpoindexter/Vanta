import type { VantaGateway } from '@/desktop-api'
import { type ClarifyRequest } from '@/store/clarify'
import { forgetServerRequest } from '@/store/server-requests'
import { requestForOwnedSession } from '@/store/session-states'

export interface LockedAnswer {
  answer: null | string
  qid: string
}

/**
 * Send every answer of a clarify request, then forget the server request.
 *
 * Sequential, not Promise.all: the LAST lock resolves the blocked server
 * request, so every earlier lock must already be accepted when it lands — a
 * reordered burst could complete the batch with a missing answer.
 * `clarify.lock` is a normal RPC; it rides the session's OWNER socket (a
 * profile / Bot Chat switch re-points ambient elsewhere).
 */
export async function lockClarifyAnswers(
  request: ClarifyRequest,
  gateway: VantaGateway,
  answers: readonly LockedAnswer[]
): Promise<void> {
  for (const { answer, qid } of answers) {
    await requestForOwnedSession<{ remaining?: string[]; status?: string }>(
      request.sessionId,
      gateway.request.bind(gateway) as typeof gateway.request,
      'clarify.lock',
      { answer, question_id: qid, request_id: request.requestId }
    )
  }

  forgetServerRequest(request.requestId)
}
