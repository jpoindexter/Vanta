import type { TicketDetail } from '@/api/vanta-company-schemas'

export interface CloseGate {
  canClose: boolean
  /** Why Close is locked, in words the owner can act on. Null when it is not locked. */
  reason: null | string
}

const FINISHED = new Set(['done', 'closed'])

type Rule = (detail: TicketDetail) => null | string

const finished: Rule = detail => (FINISHED.has(detail.status) ? 'This ticket is already closed.' : null)

const inFlight: Rule = detail =>
  detail.runs.some(run => run.status === 'running')
    ? 'A run is in flight. Close unlocks when it finishes, or pause the worker first.'
    : null

const artifactMissing: Rule = detail => {
  const promised = detail.outcome
  const unmet = promised && !promised.satisfiedBy && !promised.noArtifactReason && detail.workProducts.length === 0

  return detail.blockers.some(item => item.kind === 'outcome') || unmet
    ? `This ticket promises a ${promised?.expectedOutput ?? 'deliverable'} and none exists yet. Close unlocks when the worker produces it.`
    : null
}

const reviewPending: Rule = detail => {
  const stage = detail.reviewStages.find(item => item.status === 'pending')

  return stage
    ? `Review stage "${stage.name}" is waiting for you. Approve the work product below, or ask for a revision.`
    : null
}

const workerBlocked: Rule = detail =>
  detail.blockers.some(item => item.kind === 'blocker')
    ? "The worker is blocked and waiting for your answer. Answer below, or close it as won't fix."
    : null

// Order matters: a missing artifact explains more than a review that cannot start without it.
const RULES: Rule[] = [finished, inFlight, artifactMissing, reviewPending, workerBlocked]

/**
 * Close is only enabled when the engine would accept it. A ticket that promised an artifact
 * cannot be closed without one, and a pending review has to be decided first. The server
 * enforces the same rules (409), so this explains the lock instead of waiting for a refusal.
 */
export function closeGate(detail: TicketDetail): CloseGate {
  for (const rule of RULES) {
    const reason = rule(detail)

    if (reason) {
      return { canClose: false, reason }
    }
  }

  return { canClose: true, reason: null }
}
