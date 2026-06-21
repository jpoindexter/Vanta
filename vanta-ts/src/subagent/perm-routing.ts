// VANTA-SWARM-PERM-ROUTING — swarm permission routing (pure router).
//
// In a swarm/fleet, a worker runs WITHOUT an operator TTY (see
// `fleet/fleet.ts executeWorker` → `spawnSubagent` with `root` set to the
// worker's worktree). When the kernel returns an `ask` verdict, the worker's
// `AgentDeps.requestApproval` callback (`agent/agent-types.ts`) fires — but the
// worker can't prompt a human. Instead it FORWARDS the ask to the LEAD agent,
// which collects the operator's ONE decision and routes it back to the asking
// worker.
//
// SECURITY: forwarding routes the ASK to a human via the lead — it does NOT
// auto-approve. The kernel `assess()` already ran on the worker (the verdict is
// a real `ask`), and the lead still surfaces a real operator prompt before any
// decision is routed back. Routing ≠ bypassing: both the kernel verdict and the
// lead's operator decision still gate the action.
//
// This module is PURE: the live A2A transport (the forward wire) and the
// operator prompt (the lead's decision source) are the injected boundary. See
// the NAMED wire at the bottom of this file.

import type { PermissionRequest } from "../permissions/request.js";

/** An operator's decision on a forwarded ask. */
export type PermDecision = "allow" | "deny";

/**
 * A worker's permission ask, forwarded to the lead. `askId` is the stable
 * correlation key (the lead routes a decision back by it); `workerId` names the
 * asking worker; `request` is the typed UI context the lead surfaces to the
 * operator; `askedAt` is an ISO timestamp for oldest-first ordering.
 */
export type ForwardedAsk = {
  askId: string;
  workerId: string;
  request: PermissionRequest;
  askedAt: string;
};

/** The lead's pending-ask queue. Immutable: every transition returns a new state. */
export type PermRouterState = {
  pending: ForwardedAsk[];
};

/** The worker to notify + the decision to route back to it. */
export type RouteTarget = {
  workerId: string;
  decision: PermDecision;
};

/** Result of routing a decision: the next state + the worker to notify (or null). */
export type RouteResult = {
  state: PermRouterState;
  target: RouteTarget | null;
};

/** An empty router state (no pending asks). */
export function emptyPermRouterState(): PermRouterState {
  return { pending: [] };
}

/**
 * Build the forward-message payload a worker sends to the lead when it hits a
 * kernel `ask`. Pure data shape — the caller wraps it in an A2A message and
 * sends it over the transport. `askedAt` defaults to now (injectable for tests).
 */
export function buildForwardedAsk(
  workerId: string,
  request: PermissionRequest,
  askId: string,
  askedAt: string = new Date().toISOString(),
): ForwardedAsk {
  return { askId, workerId, request, askedAt };
}

/**
 * Enqueue a forwarded ask onto the lead's pending queue. Append-only and
 * DEDUPED by `askId` — a re-forwarded ask (e.g. a retried A2A send) does NOT
 * double-queue. Input state is never mutated.
 */
export function enqueueAsk(state: PermRouterState, ask: ForwardedAsk): PermRouterState {
  if (state.pending.some((p) => p.askId === ask.askId)) return state;
  return { pending: [...state.pending, ask] };
}

/**
 * Route an operator decision back to the worker that asked. Finds the pending
 * ask by `askId`, removes it, and returns the worker to notify. An UNKNOWN
 * `askId` (no matching pending ask — e.g. a decision for an already-resolved or
 * never-seen ask) is ignored safely: state unchanged, target null. Input state
 * is never mutated.
 */
export function routeDecision(
  state: PermRouterState,
  askId: string,
  decision: PermDecision,
): RouteResult {
  const match = state.pending.find((p) => p.askId === askId);
  if (!match) return { state, target: null };
  const pending = state.pending.filter((p) => p.askId !== askId);
  return { state: { pending }, target: { workerId: match.workerId, decision } };
}

/**
 * The pending asks forwarded by one worker. Concurrent asks from multiple
 * workers queue independently; this filters to a single worker's asks (oldest
 * first, preserving enqueue order).
 */
export function pendingForWorker(state: PermRouterState, workerId: string): ForwardedAsk[] {
  return state.pending.filter((p) => p.workerId === workerId);
}

/**
 * The oldest pending ask for the lead to surface next (by `askedAt`, enqueue
 * order tie-broken). Null when the queue is empty.
 */
export function nextPendingAsk(state: PermRouterState): ForwardedAsk | null {
  if (state.pending.length === 0) return null;
  return state.pending.reduce((oldest, ask) =>
    ask.askedAt < oldest.askedAt ? ask : oldest,
  );
}

// ── NAMED wire (live transport + operator prompt are the boundary) ──────────
//
// Worker side (in `fleet/fleet.ts executeWorker` / `subagent/spawn.ts`, where a
// worker's `AgentDeps.requestApproval` is built): instead of prompting (no
// TTY), the worker callback would:
//   const ask = buildForwardedAsk(workerId, buildPermissionRequest({toolName, action, reason}), askId);
//   await bus.send(makeMessage({ from: workerId, to: leadId, text: JSON.stringify(ask) }));
//   // then await the routed decision (correlated by askId) and resolve the
//   // requestApproval promise with allow/deny.
//
// Lead side (the lead agent's loop): on the inbound forward message it would
//   state = enqueueAsk(state, ask);            // dedupe by askId
// surface `nextPendingAsk(state)` to the operator (ONE real prompt), then on the
// operator's choice:
//   const { state: next, target } = routeDecision(state, askId, decision);
//   if (target) await bus.send(makeMessage({ from: leadId, to: target.workerId, text: JSON.stringify(target) }));
//   state = next;
//
// The A2A transport (`a2a/local.ts A2ABus` / a networked `A2ATransport`) and the
// operator prompt are INJECTED — this module owns only the pure forward-request
// model + decision routing. Both the kernel verdict and the lead's operator
// decision still gate; routing never auto-approves.
